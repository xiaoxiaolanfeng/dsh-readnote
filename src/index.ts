/**
 * dsh-readnote · host half.
 *
 * 阅读增强插件：把 AI 的回答钉回原文的文档阅读器。
 *
 * host 半边只做浏览器做不到的三件事：
 *   1. 读工作区里的文件（浏览器拿不到本地路径）；
 *   2. 把批注落盘到工作区的 `.readnote/annotations.json`（`localStorage` 换个会话就没了）；
 *   3. 把「引用 + 问题」作为一条真实用户消息发进当前会话，让回答落在会话日志里。
 *
 * 端点实现按功能分在 `./host/routes/`，公共前置检查在 `./host/http.ts`，
 * 本文件只负责把宿主服务取出来交给它们。
 *
 * 安全约束：
 *   - 所有端点走 connection.requestRejection 守卫，跨站浏览器无法触发（在 `registerRoute` 里统一做）。
 *   - 路径必须落在会话工作区内（`safeResolve` 挡 ../ 穿越）。
 *   - 单文件、单层目录、批注条数、请求体都有上限。
 */
import { registerRoutes } from './host/register.ts'
import type { HostServices } from './host/types.ts'

/** Loader row id 与包名保持一致，便于 profile patch 按 id 覆盖。 */
export const name = 'dsh-readnote'

/** 需要的 host 服务：HTTP 注册、连接守卫、会话查询。 */
export const inject = ['webServer', 'connection', 'sessions']

/**
 * Host 半边入口。
 * @param ctx - cordis 根上下文。
 */
export function apply(ctx: any): void {
  const services: HostServices = {
    ctx,
    host: ctx.get('webServer'),
    connection: ctx.get('connection'),
    sessions: ctx.get('sessions'),
    // workspaceRegistry 是「可选 host 能力」，所以用 ctx.get 而不是 inject ——
    // inject 一个不存在的服务会让插件永远停在 pending。
    registry: ctx.get('workspaceRegistry'),
  }

  console.log(
    '[readnote] services: sessions =',
    services.sessions ? 'ok' : 'MISSING',
    '| workspaceRegistry =',
    services.registry ? 'ok' : 'MISSING',
  )

  if (!services.host || typeof services.host.register !== 'function') {
    console.log('[readnote] webServer 不可用，未注册 host 端点')
    return
  }

  registerRoutes(services)
}
