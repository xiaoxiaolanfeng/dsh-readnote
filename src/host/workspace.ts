/**
 * 工作区定位与目录列举。
 * @module dsh-readnote/host/workspace
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { MAX_ENTRIES, MD_EXTENSIONS, SKIP_DIRS } from './constants.ts'
import type { DirEntry } from './types.ts'

/**
 * dsh 家目录：环境变量优先，退化到 `~/.dsh`。
 * @returns $DSH_HOME 的绝对路径。
 */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
  return join(homedir(), '.dsh')
}

/**
 * 从 dsh 的工作区账本反查会话所属目录。
 *
 * 为什么落到读文件：`workspaceRegistry` 本机实测不可用，而 `sessions.get()`
 * 只认 live 会话 —— 旧会话两条路都不通，账本是最后的兜底。
 * 读不到或格式变了都只返回 null：让上层报「找不到工作区」，而不是把插件搞崩。
 *
 * @param sessionId - 会话 id。
 * @returns 工作目录绝对路径；拿不到返回 null。
 */
export async function cwdFromWorkspaceLedger(sessionId: string): Promise<string | null> {
  try {
    const raw = await readFile(join(dshHome(), 'storages', 'workspace.json'), 'utf8')
    const parsed = JSON.parse(raw) as {
      tables?: { workspaces?: Record<string, { path?: string; sessionIds?: string[] }> }
    }
    const workspaces = parsed?.tables?.workspaces
    if (workspaces === undefined || workspaces === null) return null
    for (const entry of Object.values(workspaces)) {
      if (!Array.isArray(entry?.sessionIds) || !entry.sessionIds.includes(sessionId)) continue
      if (typeof entry.path === 'string' && entry.path.length > 0) return entry.path
    }
    return null
  } catch {
    return null
  }
}

/**
 * 解析会话所属的工作目录。
 *
 * 三条路，从快到慢：
 *   1. 活会话的 header —— 最快，但 `sessions.get()` 按文档只认 **live** 会话，
 *      隔了天的旧会话拿不到（实测）。
 *   2. `workspaceRegistry.list()` —— 正规 API，但它是「可选 host 能力」，
 *      本机 profile 实测 `ctx.get('workspaceRegistry')` 返回 undefined。
 *   3. 工作区账本文件 —— 最后兜底，见 {@link cwdFromWorkspaceLedger}。
 *
 * @param sessions - SessionStore 服务（可为空）。
 * @param registry - WorkspaceRegistry 服务（可为空）。
 * @param sessionId - 会话 id。
 * @returns 绝对路径；三条路都拿不到时返回 null。
 */
export async function resolveCwd(sessions: any, registry: any, sessionId: unknown): Promise<string | null> {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null

  const session = sessions?.get?.(sessionId)
  const direct = [session?.cwd, session?.header?.cwd, session?.sessionHeader?.cwd, session?.meta?.cwd].find(
    (value) => typeof value === 'string' && value.length > 0,
  )
  if (typeof direct === 'string') return direct

  const workspaces = registry?.list?.()
  if (Array.isArray(workspaces)) {
    for (const workspace of workspaces) {
      const ids = workspace?.sessionIds
      if (!Array.isArray(ids) || !ids.includes(sessionId)) continue
      if (typeof workspace?.path === 'string' && workspace.path.length > 0) return workspace.path
    }
  }

  return cwdFromWorkspaceLedger(sessionId)
}

/**
 * 只在 root 之内解析目标路径，挡住 ../ 穿越。
 * @param root - 工作区根目录。
 * @param target - 目标路径（绝对或相对工作区）。
 * @returns 安全的绝对路径；越界返回 null。
 */
export function safeResolve(root: string, target: string): string | null {
  const rootResolved = resolve(root)
  const abs = isAbsolute(target) ? resolve(target) : resolve(rootResolved, target)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + sep)) return null
  return abs
}

/**
 * 列出工作区内某一层的条目（只读一层，不做递归）。
 *
 * 为什么是「一层」而不是递归扫全树：递归的瓶颈在遍历成本，而遍历成本不受
 * 「结果数量上限」约束 —— 在一棵几十万文件的目录树上会一直走不完（实测踩过）。
 * 分层列目录把每次请求的成本压到一个 readdir，交互上也和文件管理器一致。
 *
 * @param root - 工作区根目录。
 * @param rel - 相对工作区的目录路径，空串表示根。
 * @returns 目录在前、同类按名称排序的条目。
 */
export async function listDirectory(root: string, rel: string): Promise<DirEntry[]> {
  const target = rel.length > 0 ? safeResolve(root, rel) : resolve(root)
  if (target === null) throw new Error('path outside workspace')

  const dirents = await readdir(target, { withFileTypes: true })
  const out: DirEntry[] = []

  for (const entry of dirents) {
    if (out.length >= MAX_ENTRIES) break
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const childRel = rel.length > 0 ? `${rel}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      out.push({ path: childRel, name: entry.name, type: 'dir', size: 0, mtime: 0, readable: false })
      continue
    }
    if (!entry.isFile()) continue
    try {
      const info = await stat(join(target, entry.name))
      out.push({
        path: childRel,
        name: entry.name,
        type: 'file',
        size: info.size,
        mtime: info.mtimeMs,
        readable: MD_EXTENSIONS.has(extname(entry.name).toLowerCase()),
      })
    } catch {
      // 读不到元信息就跳过这一个文件，不影响整层结果。
    }
  }

  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
