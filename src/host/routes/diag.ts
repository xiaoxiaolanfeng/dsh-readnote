/**
 * 诊断端点：列出关键 host 服务在运行时**真实**暴露的方法。
 *
 * 原则是「问进程，不猜文档」—— 见 BUILDING.md 4.7 那三轮猜错的教训：
 * 读源码 clone 推断 API 形状，连续三次与实际不符；改成让进程自己报方法名之后，
 * 一次就问清了 `agent.followup` / `session.deriveMessages` 的真实签名。
 *
 * 这个端点**保留在发布版里**是有意的：它是插件遇到宿主升级时的第一诊断入口，
 * 去掉它下次还得重新写一遍。
 * @module dsh-readnote/host/routes/diag
 */
import { DIAG_PATH } from '../constants.ts'
import { registerRoute, sendJson } from '../http.ts'
import type { HostServices } from '../types.ts'

/** 要在报告里点名的服务。 */
const PROBED_SERVICES = [
  'agents',
  'llm',
  'sessions',
  'workspaceRegistry',
  'conversation',
  'commands',
  'systemPrompt',
  'storageDomain',
  'sessionPersistence',
]

/**
 * 取一个对象原型上的方法名。
 * @param value - 任意服务实例。
 * @returns 方法名数组；对象为空时返回 'MISSING'。
 */
function methodsOf(value: unknown): string[] | 'MISSING' {
  if (value === undefined || value === null) return 'MISSING'
  return Object.getOwnPropertyNames(Object.getPrototypeOf(value)).slice(0, 40)
}

/**
 * 带 sessionId 时再探一层：agent / session 实例上有什么。
 * 目的是搞清「怎么把一条消息发进已有会话」—— 这决定问答面板走哪条路。
 * @param ctx - cordis 根上下文。
 * @param sessionId - 会话 id。
 * @returns 追加到报告里的字段。
 */
function probeSession(ctx: any, sessionId: string): Record<string, unknown> {
  const report: Record<string, unknown> = {}
  const agents = ctx.get('agents')
  report._agent = methodsOf(agents?.get?.(sessionId))
  try {
    const all = agents?.list?.() ?? []
    report._agentCount = Array.isArray(all) ? all.length : -1
    report._agentIds = Array.isArray(all)
      ? all.slice(0, 6).map((item: any) => ({
          id: item?.id ?? null,
          sessionId: item?.sessionId ?? null,
          keys: Object.keys(item ?? {}).slice(0, 10),
        }))
      : 'N/A'
  } catch (error) {
    report._agentListError = (error as Error)?.message ?? String(error)
  }

  const session = ctx.get('sessions')?.get?.(sessionId)
  report._session = methodsOf(session)
  // 抄一条**真实**消息的结构 —— 我们要自己造一条发进会话，
  // 照抄会话里已有的形状，比读文档猜字段靠谱（BUILDING.md 4.7 的教训）。
  if (session !== undefined && session !== null && typeof session.deriveMessages === 'function') {
    try {
      const messages = session.deriveMessages()
      report._messageCount = Array.isArray(messages) ? messages.length : -1
      const last = Array.isArray(messages) && messages.length > 0 ? messages[messages.length - 1] : null
      report._lastMessageKeys = last === null ? 'NONE' : Object.keys(last)
      report._lastMessage = last === null ? 'NONE' : JSON.parse(JSON.stringify(last))
    } catch (error) {
      report._messageError = (error as Error)?.message ?? String(error)
    }
  }
  return report
}

/**
 * 注册 `/diag`。
 * @param services - 宿主服务集合。
 */
export function registerDiagRoute(services: HostServices): void {
  registerRoute(services, DIAG_PATH, async (payload, res, { ctx }) => {
    const report: Record<string, unknown> = {}
    for (const name of PROBED_SERVICES) report[name] = methodsOf(ctx.get(name))

    if (typeof payload?.sessionId === 'string' && payload.sessionId.length > 0) {
      Object.assign(report, probeSession(ctx, payload.sessionId))
    }
    sendJson(res, 200, { ok: true, services: report })
  })
}
