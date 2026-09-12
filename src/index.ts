/**
 * dsh-readnote · host half.
 *
 * v0.1 骨架：只确认插件能被 dsh 的 Loader 挂载。
 * 后续在这里用 ctx.webServer 注册端点，为 client 半边提供：
 *   - 文档读取（把工作区里的 .md 送到阅读视图）
 *   - 批注持久化（落成会话事件，见 DESIGN.md 第 6 节）
 */

/** Loader row id 与包名保持一致，便于 profile patch 按 id 覆盖。 */
export const name = 'dsh-readnote'

/** v0.1 不依赖任何 host 服务；接入 webServer 时在这里声明。 */
export const inject: string[] = []

/**
 * Host 半边入口。
 * @param ctx - cordis 根上下文（v0.1 未使用，接入服务后启用）。
 */
export function apply(ctx: unknown): void {
  void ctx
  console.log('[readnote] host half loaded')
}
