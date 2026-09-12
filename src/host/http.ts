/**
 * HTTP 连接的收发与公共前置检查。
 * @module dsh-readnote/host/http
 */
import { MAX_BODY_CHARS } from './constants.ts'
import type { HostServices } from './types.ts'

/**
 * 写回一个 JSON 响应。
 * @param res - Node 响应对象。
 * @param status - HTTP 状态码。
 * @param body - 可序列化的响应体。
 */
export function sendJson(res: any, status: number, body: Record<string, unknown>): void {
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
export function readBody(req: any): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let data = ''
    req.on('data', (chunk: unknown) => {
      data += chunk
      if (data.length > MAX_BODY_CHARS) req.destroy()
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
export function rejectConnectionRequest(connection: any, req: any, res: any): boolean {
  const rejection = connection?.requestRejection?.(req)
  if (rejection === undefined) return false
  sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
  return true
}

/**
 * 提取一个错误的可读信息。
 * @param error - 任意抛出物。
 * @returns 错误信息字符串。
 */
export function messageOf(error: unknown): string {
  return (error as { message?: string })?.message ?? String(error)
}

/** 路由处理函数：拿到解析好的请求体与响应对象。 */
export type RouteHandler = (payload: any, res: any, services: HostServices) => Promise<void> | void

/**
 * 注册一个 POST 端点，并统一处理四件每次都要做的事：
 * 跨站守卫、方法检查、请求体解析、未捕获异常。
 *
 * 抽出来的理由是**重复本身就是风险**：这四步原来在每个 handler 里手抄一遍，
 * 八个端点就是八份；漏掉守卫的那一个会静默变成 CSRF 面。
 *
 * @param services - 宿主服务集合。
 * @param path - 端点路径。
 * @param handler - 业务处理函数。
 */
export function registerRoute(services: HostServices, path: string, handler: RouteHandler): void {
  services.ctx.effect(() =>
    services.host.register({
      kind: 'exact',
      path,
      handler: async (req: any, res: any) => {
        if (rejectConnectionRequest(services.connection, req, res)) return
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
        try {
          await handler(payload, res, services)
        } catch (error) {
          sendJson(res, 500, { error: messageOf(error) })
        }
      },
    }),
  )
}
