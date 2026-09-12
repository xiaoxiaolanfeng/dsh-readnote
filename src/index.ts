/**
 * dsh-readnote · host half.
 *
 * 为 client 半边提供阅读所需的数据，两个只读端点：
 *   POST /__readnote/list  —— 列出当前会话工作区里的 markdown 文件
 *   POST /__readnote/read  —— 读取工作区内某个文件的文本内容
 *
 * 安全约束：
 *   - 两个端点都走 connection.requestRejection 守卫，跨站浏览器无法触发。
 *   - 路径必须落在会话工作区内（safeResolve 挡 ../ 穿越），不给任意文件读取。
 *   - 单文件有大小上限，避免把浏览器卡死。
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Loader row id 与包名保持一致，便于 profile patch 按 id 覆盖。 */
export const name = 'dsh-readnote'

/** 需要的 host 服务：HTTP 注册、连接守卫、会话查询。 */
export const inject = ['webServer', 'connection', 'sessions']

const LIST_PATH = '/__readnote/list'
const READ_PATH = '/__readnote/read'

/** 单个文件大小上限（2 MB）—— 超过就不往浏览器送。 */
const MAX_FILE_BYTES = 2 * 1024 * 1024

/** 一次最多列出多少个文件。 */
const MAX_FILES = 300

/** 递归深度上限，避免在大仓里走太深。 */
const MAX_DEPTH = 4

/** 明确跳过的目录。 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'lib', '.cache', '.next'])

/** 认作 markdown 的扩展名。 */
const MD_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])

/** 一个可读 markdown 文件的索引项。 */
interface DocEntry {
  /** 相对工作区的路径，前端展示用。 */
  name: string
  /** 绝对路径。 */
  path: string
  /** 字节数。 */
  size: number
  /** 最后修改时间（毫秒）。 */
  mtime: number
}

/**
 * 写回一个 JSON 响应。
 * @param res - Node 响应对象。
 * @param status - HTTP 状态码。
 * @param body - 可序列化的响应体。
 */
function sendJson(res: any, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/**
 * 读取请求体（带上限，超了直接断开）。
 * @param req - Node 请求对象。
 * @returns 请求体文本。
 */
function readBody(req: any): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let data = ''
    req.on('data', (chunk: unknown) => {
      data += chunk
      if (data.length > 1_000_000) req.destroy()
    })
    req.on('end', () => resolveBody(data))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
}

/**
 * 跨站请求守卫（与 dsh-more-session-operations 同款）。
 * @param connection - connection 服务。
 * @param req - Node 请求对象。
 * @param res - Node 响应对象。
 * @returns 是否已经拒绝并结束响应。
 */
function rejectConnectionRequest(connection: any, req: any, res: any): boolean {
  const rejection = connection?.requestRejection?.(req)
  if (rejection === undefined) return false
  sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
  return true
}

/**
 * 从会话记录里取工作目录。字段位置随版本可能不同，逐个候选试。
 * @param session - sessions 服务返回的会话对象。
 * @returns 工作目录绝对路径，取不到返回 null。
 */
function resolveCwd(session: any): string | null {
  const candidates = [
    session?.cwd,
    session?.header?.cwd,
    session?.sessionHeader?.cwd,
    session?.meta?.cwd,
    session?.record?.cwd,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * 在工作区里递归收集 markdown 文件，按修改时间倒序。
 * @param root - 工作区根目录。
 * @param limit - 最多返回多少条。
 * @returns 文件索引。
 */
async function collectMarkdown(root: string, limit: number): Promise<DocEntry[]> {
  const out: DocEntry[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (out.length >= limit || depth > MAX_DEPTH) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= limit) return
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!MD_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue
      try {
        const info = await stat(full)
        out.push({ name: relative(root, full).split(sep).join('/'), path: full, size: info.size, mtime: info.mtimeMs })
      } catch {
        // 读不到元信息就跳过这一个文件，不影响其它结果。
      }
    }
  }

  await walk(root, 0)
  return out.sort((a, b) => b.mtime - a.mtime)
}

/**
 * 只在 root 之内解析目标路径，挡住 ../ 穿越。
 * @param root - 工作区根目录。
 * @param target - 目标路径（绝对或相对工作区）。
 * @returns 安全的绝对路径；越界返回 null。
 */
function safeResolve(root: string, target: string): string | null {
  const rootResolved = resolve(root)
  const abs = isAbsolute(target) ? resolve(target) : resolve(rootResolved, target)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + sep)) return null
  return abs
}

/**
 * Host 半边入口：注册两个只读端点。
 * @param ctx - cordis 根上下文。
 */
export function apply(ctx: any): void {
  const host = ctx.get('webServer')
  const connection = ctx.get('connection')
  const sessions = ctx.get('sessions')

  if (!host || typeof host.register !== 'function') {
    console.log('[readnote] webServer 不可用，未注册 host 端点')
    return
  }

  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: LIST_PATH,
      handler: async (req: any, res: any) => {
        if (rejectConnectionRequest(connection, req, res)) return
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        let payload: any = {}
        try {
          const raw = await readBody(req)
          if (raw) payload = JSON.parse(raw)
        } catch {
          sendJson(res, 400, { error: 'bad json body' })
          return
        }

        const session = sessions?.get?.(payload?.sessionId)
        const cwd = resolveCwd(session)
        if (cwd === null) {
          // 诊断分支：让前端能直接看到会话对象长什么样，便于定位 cwd 字段。
          sendJson(res, 200, {
            ok: false,
            reason: 'cwd-not-found',
            hasSessionsService: Boolean(sessions),
            hasSession: Boolean(session),
            sessionKeys: session ? Object.keys(session).slice(0, 40) : [],
          })
          return
        }

        try {
          const files = await collectMarkdown(cwd, MAX_FILES)
          sendJson(res, 200, { ok: true, dir: cwd, files })
        } catch (error: any) {
          sendJson(res, 500, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: READ_PATH,
      handler: async (req: any, res: any) => {
        if (rejectConnectionRequest(connection, req, res)) return
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'method not allowed' })
          return
        }
        let payload: any = {}
        try {
          const raw = await readBody(req)
          if (raw) payload = JSON.parse(raw)
        } catch {
          sendJson(res, 400, { error: 'bad json body' })
          return
        }

        const session = sessions?.get?.(payload?.sessionId)
        const cwd = resolveCwd(session)
        if (cwd === null) {
          sendJson(res, 200, { ok: false, reason: 'cwd-not-found' })
          return
        }
        if (typeof payload?.path !== 'string' || payload.path.length === 0) {
          sendJson(res, 400, { error: 'path required' })
          return
        }

        const abs = safeResolve(cwd, payload.path)
        if (abs === null) {
          sendJson(res, 403, { error: 'path outside workspace' })
          return
        }
        if (!MD_EXTENSIONS.has(extname(abs).toLowerCase())) {
          sendJson(res, 415, { error: 'not a markdown file' })
          return
        }

        try {
          const info = await stat(abs)
          if (info.size > MAX_FILE_BYTES) {
            sendJson(res, 413, { error: `file too large (${info.size} bytes)` })
            return
          }
          const content = await readFile(abs, 'utf8')
          sendJson(res, 200, { ok: true, path: abs, name: relative(cwd, abs).split(sep).join('/'), size: info.size, content })
        } catch (error: any) {
          sendJson(res, 404, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  console.log('[readnote] host 端点已注册:', LIST_PATH, READ_PATH)
}
