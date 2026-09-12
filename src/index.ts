/**
 * dsh-readnote · host half.
 *
 * 为 client 半边提供阅读所需的数据，两个只读端点：
 *   POST /__readnote/list  —— 列出工作区内**某一层**的目录与文件（不递归）
 *   POST /__readnote/read  —— 读取工作区内某个文件的文本内容
 *
 * 为什么是「一层」而不是递归扫全树：
 *   递归的瓶颈在遍历成本，而遍历成本不受「结果数量上限」约束 —— 在一棵
 *   几十万文件的目录树上会一直走不完（实测踩过）。分层列目录把每次请求的
 *   成本压到一个 readdir，交互上也和文件管理器一致。
 *
 * 安全约束：
 *   - 两个端点都走 connection.requestRejection 守卫，跨站浏览器无法触发。
 *   - 路径必须落在会话工作区内（safeResolve 挡 ../ 穿越）。
 *   - 单文件有大小上限，避免把浏览器卡死。
 */

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'

/** Loader row id 与包名保持一致，便于 profile patch 按 id 覆盖。 */
export const name = 'dsh-readnote'

/** 需要的 host 服务：HTTP 注册、连接守卫、会话查询。 */
export const inject = ['webServer', 'connection', 'sessions']

const LIST_PATH = '/__readnote/list'
const READ_PATH = '/__readnote/read'
const NOTES_READ_PATH = '/__readnote/notes'
const NOTES_SAVE_PATH = '/__readnote/notes/save'
const DIAG_PATH = '/__readnote/diag'
const ASK_PATH = '/__readnote/ask'
const ANSWER_PATH = '/__readnote/last-answer'
const MESSAGES_PATH = '/__readnote/messages'

/**
 * 批注库放在工作区里的位置。
 * 刻意「旁挂」而不是写进 markdown 正文：我们读的很可能是别人仓库里的文件，
 * 往里写东西会弄脏对方的工作区（本项目自己就是活例子）。
 */
const NOTES_DIR = '.readnote'
const NOTES_FILE = 'annotations.json'

/** 单个文档的批注条数上限，防止畸形数据把库撑爆。 */
const MAX_NOTES_PER_DOC = 500

/** 单个文件大小上限（2 MB）—— 超过就不往浏览器送。 */
const MAX_FILE_BYTES = 2 * 1024 * 1024

/** 单层目录最多返回多少条，防止某个目录里堆了几万个文件。 */
const MAX_ENTRIES = 500

/** 明确跳过的目录名。 */
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', '.next', 'dist', 'build', 'lib', 'coverage', '__pycache__'])

/** 认作可读 markdown 的扩展名。 */
const MD_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])

/** 一层目录里的一个条目。 */
interface DirEntry {
  /** 相对工作区的路径，用 / 分隔。 */
  path: string
  /** 展示名。 */
  name: string
  /** 目录还是文件。 */
  type: 'dir' | 'file'
  /** 字节数（目录为 0）。 */
  size: number
  /** 最后修改时间（毫秒，目录为 0）。 */
  mtime: number
  /** 是否可以打开阅读（markdown 才是 true）。 */
  readable: boolean
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
async function resolveCwd(sessions: any, registry: any, sessionId: unknown): Promise<string | null> {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null

  const session = sessions?.get?.(sessionId)
  const direct = [
    session?.cwd,
    session?.header?.cwd,
    session?.sessionHeader?.cwd,
    session?.meta?.cwd,
  ].find((value) => typeof value === 'string' && value.length > 0)
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
 * dsh 家目录：环境变量优先，退化到 `~/.dsh`。
 * @returns $DSH_HOME 的绝对路径。
 */
function dshHome(): string {
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
async function cwdFromWorkspaceLedger(sessionId: string): Promise<string | null> {
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

/** 批注库的绝对路径。 */
function notesPath(workspace: string): string {
  return join(workspace, NOTES_DIR, NOTES_FILE)
}

/**
 * 读整个批注库。
 * 库不存在或损坏时返回空库 —— 批注是附加数据，不该因为它读不出来就让文档打不开。
 * @param workspace - 工作区根目录。
 * @returns 文档相对路径 → 批注数组。
 */
async function readNotes(workspace: string): Promise<Record<string, unknown[]>> {
  try {
    const raw = await readFile(notesPath(workspace), 'utf8')
    const parsed = JSON.parse(raw) as { docs?: Record<string, unknown[]> }
    return parsed?.docs ?? {}
  } catch {
    return {}
  }
}

/**
 * 写整个批注库。
 * 先写临时文件再 rename —— 避免进程中途挂掉留下半截 JSON 把整个库读废。
 * @param workspace - 工作区根目录。
 * @param docs - 文档相对路径 → 批注数组。
 */
async function writeNotes(workspace: string, docs: Record<string, unknown[]>): Promise<void> {
  await mkdir(join(workspace, NOTES_DIR), { recursive: true })
  const target = notesPath(workspace)
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify({ version: 1, docs }, null, 2), 'utf8')
  await rename(tmp, target)
}

/**
 * 列出工作区内某一层的条目（只读一层，不做递归）。
 * @param root - 工作区根目录。
 * @param rel - 相对工作区的目录路径，空串表示根。
 * @returns 目录在前、同类按名称排序的条目。
 */
async function listDirectory(root: string, rel: string): Promise<DirEntry[]> {
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

/**
 * Host 半边入口：注册两个只读端点。
 * @param ctx - cordis 根上下文。
 */
export function apply(ctx: any): void {
  const host = ctx.get('webServer')
  const connection = ctx.get('connection')
  const sessions = ctx.get('sessions')
  // workspaceRegistry 是「可选 host 能力」，所以用 ctx.get 而不是 inject ——
  // inject 一个不存在的服务会让插件永远停在 pending。
  const registry = ctx.get('workspaceRegistry')

  console.log('[readnote] services: sessions =', sessions ? 'ok' : 'MISSING', '| workspaceRegistry =', registry ? 'ok' : 'MISSING')

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
        let rawBody = ''
        try {
          rawBody = await readBody(req)
          if (rawBody) payload = JSON.parse(rawBody)
        } catch {
          sendJson(res, 400, { error: 'bad json body' })
          return
        }
        console.log('[readnote] list raw body =', JSON.stringify(rawBody).slice(0, 300))

        const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
        if (cwd === null) {
          // 诊断分支：让前端能直接看到会话对象长什么样，便于定位 cwd 字段。
          sendJson(res, 200, {
            ok: false,
            reason: 'cwd-not-found',
            receivedSessionId: payload?.sessionId ?? null,
            receivedSessionIdType: typeof payload?.sessionId,
            hasSessions: Boolean(sessions),
            hasRegistry: Boolean(registry),
            registryWorkspaces: registry?.list?.()?.length ?? 0,
          })
          return
        }

        const rel = typeof payload?.dir === 'string' ? payload.dir.replace(/^\/+|\/+$/g, '') : ''
        try {
          const entries = await listDirectory(cwd, rel)
          sendJson(res, 200, { ok: true, workspace: cwd, dir: rel, entries })
        } catch (error: any) {
          sendJson(res, 404, { ok: false, error: error?.message ?? String(error) })
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

        const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
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
          sendJson(res, 200, {
            ok: true,
            path: abs,
            name: relative(cwd, abs).split(sep).join('/'),
            size: info.size,
            content,
          })
        } catch (error: any) {
          sendJson(res, 404, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: NOTES_READ_PATH,
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

        const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
        if (cwd === null) {
          sendJson(res, 200, { ok: false, reason: 'cwd-not-found' })
          return
        }

        const docs = await readNotes(cwd)
        const doc = typeof payload?.doc === 'string' ? payload.doc : ''
        sendJson(res, 200, { ok: true, doc, notes: docs[doc] ?? [] })
      },
    }),
  )

  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: NOTES_SAVE_PATH,
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

        const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
        if (cwd === null) {
          sendJson(res, 200, { ok: false, reason: 'cwd-not-found' })
          return
        }
        if (typeof payload?.doc !== 'string' || payload.doc.length === 0) {
          sendJson(res, 400, { error: 'doc required' })
          return
        }
        if (!Array.isArray(payload?.notes)) {
          sendJson(res, 400, { error: 'notes must be an array' })
          return
        }
        const notes = payload.notes.slice(0, MAX_NOTES_PER_DOC)

        try {
          const docs = await readNotes(cwd)
          // 空数组 = 该文档已无批注，顺手把键删掉，别在库里留空壳。
          if (notes.length === 0) delete docs[payload.doc]
          else docs[payload.doc] = notes
          await writeNotes(cwd, docs)
          sendJson(res, 200, { ok: true, count: notes.length })
        } catch (error: any) {
          sendJson(res, 500, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  // 诊断端点：列出关键 host 服务在运行时**真实**暴露的方法。
  // 原则是「问进程，不猜文档」—— 见 BUILDING.md 4.7 那三轮猜错的教训。
  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: DIAG_PATH,
      handler: async (req: any, res: any) => {
        if (rejectConnectionRequest(connection, req, res)) return
        const names = [
          'agents', 'llm', 'sessions', 'workspaceRegistry', 'conversation',
          'commands', 'systemPrompt', 'storageDomain', 'sessionPersistence',
        ]
        const report: Record<string, unknown> = {}
        for (const name of names) {
          const svc = ctx.get(name)
          report[name] =
            svc === undefined || svc === null
              ? 'MISSING'
              : Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).slice(0, 40)
        }

        // 带 sessionId 时再探一层：agent / session 实例上有什么方法。
        // 目的是搞清「怎么把一条消息发进已有会话」—— 这决定问答面板走哪条路。
        let payload: any = {}
        try {
          const raw = await readBody(req)
          if (raw) payload = JSON.parse(raw)
        } catch {
          // 探测请求体坏了不影响服务清单，继续返回。
        }
        if (typeof payload?.sessionId === 'string' && payload.sessionId.length > 0) {
          const agentsSvc = ctx.get('agents')
          const agent = agentsSvc?.get?.(payload.sessionId)
          report._agent = agent
            ? Object.getOwnPropertyNames(Object.getPrototypeOf(agent)).slice(0, 40)
            : 'MISSING'
          // agents.list() 里到底有什么 —— 判断 agent 的 key 是不是 sessionId。
          try {
            const all = agentsSvc?.list?.() ?? []
            report._agentCount = Array.isArray(all) ? all.length : -1
            report._agentIds = Array.isArray(all)
              ? all.slice(0, 6).map((item: any) => ({
                  id: item?.id ?? null,
                  sessionId: item?.sessionId ?? null,
                  keys: Object.keys(item ?? {}).slice(0, 10),
                }))
              : 'N/A'
          } catch (error: any) {
            report._agentListError = error?.message ?? String(error)
          }
          const session = ctx.get('sessions')?.get?.(payload.sessionId)
          report._session = session
            ? Object.getOwnPropertyNames(Object.getPrototypeOf(session)).slice(0, 40)
            : 'MISSING'
          // 抄一条**真实**消息的结构 —— 我们要自己造一条发进会话，
          // 照抄会话里已有的形状，比读文档猜字段靠谱（BUILDING.md 4.7 的教训）。
          if (session !== undefined && session !== null && typeof session.deriveMessages === 'function') {
            try {
              const messages = session.deriveMessages()
              report._messageCount = Array.isArray(messages) ? messages.length : -1
              const last = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null
              report._lastMessageKeys = last === null ? 'NONE' : Object.keys(last)
              report._lastMessage = last === null ? 'NONE' : JSON.parse(JSON.stringify(last))
            } catch (error: any) {
              report._messageError = error?.message ?? String(error)
            }
          }
        }
        sendJson(res, 200, { ok: true, services: report })
      },
    }),
  )

  // 划词提问：把问题作为一条**真实用户消息**发进当前会话。
  //
  // 为什么走会话而不是自己调模型（像 dsh-ask-in-sidebar 那样）：
  //   设计稿里「钉回原文」这个动作的前提，是回答本来就落在会话日志里。
  //   独立调模型的话，钉的是个游离于会话之外的回答，链路就断了。
  //
  // 消息形状是照会话里已有消息抄的（keys: role / content / source / id），
  // 不是读文档猜的 —— 见 BUILDING.md 4.7。
  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: ASK_PATH,
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

        const sessionId = payload?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendJson(res, 400, { error: 'sessionId required' })
          return
        }
        const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
        if (question.length === 0) {
          sendJson(res, 400, { error: 'question required' })
          return
        }
        const quote = typeof payload?.quote === 'string' ? payload.quote : ''
        const doc = typeof payload?.doc === 'string' ? payload.doc : ''

        const agents = ctx.get('agents')
        let agent = agents?.get?.(sessionId)
        let resumed = false
        if ((agent === undefined || agent === null) && typeof agents?.resume === 'function') {
          // agent 只在「正在工作」时留在 store 里，空闲就被释放。
          // 先试着自己唤醒它 —— 失败了再如实告诉用户，而不是让他猜。
          try {
            agent = await agents.resume(sessionId)
            resumed = true
          } catch {
            agent = undefined
          }
        }
        if (agent === undefined || agent === null) {
          // 会话没有活着的 agent 时**明确告诉前端**，而不是静默失败。
          sendJson(res, 200, {
            ok: false,
            reason: 'agent-not-live',
            message: '这个会话当前没有活跃 agent（dsh 只为正在工作的会话保留它，空闲即释放，resume 也没成功）。先在对话框里发一句话唤醒它，再回来提问。',
          })
          return
        }

        const text = [
          doc.length > 0 ? `【readnote】读《${doc}》时对这段话有疑问：` : '【readnote】对这段话有疑问：',
          '',
          quote.length > 0 ? `> ${quote.replace(/\n/g, '\n> ')}` : '',
          '',
          question,
        ].join('\n')

        try {
          agent.followup({
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: 'user' },
          })
          sendJson(res, 200, { ok: true, resumed })
        } catch (error: any) {
          sendJson(res, 500, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  // 「钉」的原料：把会话里最后一条助手回答取出来给前端。
  //
  // 为什么不在这里调模型做「提炼」：提炼要再花一次调用，而且用户多半更想自己删减
  // ——「先看能改」是设计稿写死的硬约束。所以这里只负责**取回原文**，
  // 前端的编辑框负责提炼，用户点头才落成笔记。
  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: ANSWER_PATH,
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
        const sessionId = payload?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendJson(res, 400, { error: 'sessionId required' })
          return
        }

        const session = ctx.get('sessions')?.get?.(sessionId)
        if (session === undefined || session === null || typeof session.deriveMessages !== 'function') {
          sendJson(res, 200, {
            ok: false,
            reason: 'session-not-live',
            message: '这个会话当前不在内存里（dsh 只为活跃会话保留），先回对话页看一眼再回来钉。',
          })
          return
        }

        try {
          const messages = session.deriveMessages()
          const list = Array.isArray(messages) ? messages : []
          for (let i = list.length - 1; i >= 0; i -= 1) {
            const message = list[i]
            if (message?.role !== 'assistant') continue
            const parts = Array.isArray(message.content) ? message.content : []
            const text = parts
              .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
              .map((part: any) => part.text)
              .join('\n')
              .trim()
            if (text.length === 0) continue
            sendJson(res, 200, { ok: true, text, total: list.length })
            return
          }
          sendJson(res, 200, { ok: false, reason: 'no-answer', message: '还没找到助手回答 —— 先在阅读页用「问 AI」提个问。' })
        } catch (error: any) {
          sendJson(res, 500, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  // 阅读页右侧对话栏的数据源：按时间顺序返回会话里最近的若干条消息。
  //
  // 为什么走轮询而不是订阅：client 侧订阅会话事件流要摸 `useConversation` 那套
  // （用法未验证）；而这是一个「你问一句、它答一句」的低频面板，2 秒轮询足够，
  // 且不引入对宿主事件协议的依赖。真嫌慢再换订阅。
  ctx.effect(() =>
    host.register({
      kind: 'exact',
      path: MESSAGES_PATH,
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
        const sessionId = payload?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          sendJson(res, 400, { error: 'sessionId required' })
          return
        }
        const limit = typeof payload?.limit === 'number' && payload.limit > 0 ? Math.min(payload.limit, 60) : 24

        const session = ctx.get('sessions')?.get?.(sessionId)
        if (session === undefined || session === null || typeof session.deriveMessages !== 'function') {
          sendJson(res, 200, { ok: false, reason: 'session-not-live' })
          return
        }

        try {
          const all = session.deriveMessages()
          const list = Array.isArray(all) ? all : []
          const out: Array<{ role: string; text: string }> = []
          for (const message of list) {
            const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null
            if (role === null) continue
            const parts = Array.isArray(message.content) ? message.content : []
            const text = parts
              .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
              .map((part: any) => part.text)
              .join('\n')
              .trim()
            if (text.length === 0) continue
            // 跳过宿主注入的环境上下文（`<system-reminder>` 那段 AGENTS.md 提醒之类）——
            // 它是给模型的，不该出现在用户的对话栏里。
            if (text.startsWith('<system-reminder')) continue
            out.push({ role, text })
          }
          sendJson(res, 200, { ok: true, total: out.length, messages: out.slice(-limit) })
        } catch (error: any) {
          sendJson(res, 500, { error: error?.message ?? String(error) })
        }
      },
    }),
  )

  console.log(
    '[readnote] host 端点已注册:',
    LIST_PATH,
    READ_PATH,
    NOTES_READ_PATH,
    NOTES_SAVE_PATH,
    ASK_PATH,
    ANSWER_PATH,
    MESSAGES_PATH,
    DIAG_PATH,
  )
}
