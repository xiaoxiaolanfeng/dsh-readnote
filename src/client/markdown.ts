/**
 * 宿主 Markdown 渲染器的取用与兜底。
 *
 * shell 通过 `PLATFORM_MODULES` 共享 `MarkdownText`，但**不能假定它一定在**：
 * 插件要能在宿主没提供（或改名）时退化成 `<pre>`，而不是整页白屏。
 * @module dsh-readnote/client/markdown
 */
import * as primitivesNs from '@deepseek-ai/dsh-client-ui-primitives'
import type { Copy } from './types.ts'

/** 渲染器的属性：`labels` 是必需的，见下方注释。 */
export interface MarkdownProps {
  text: string
  streaming?: boolean
  /**
   * **必须传**。shell 里的 `MarkdownText` 直接读 `i.labels.code.copyLabel`，
   * 没有可选链保护 —— 少传就是 `Cannot read properties of undefined (reading 'code')`，
   * React 会把整棵子树卸载，表现成「点开文件整个页签变白」。
   *
   * 注意这与源码 clone 里的 `codeLabels?`（扁平 + 可选链）不是一回事，属版本差异。详见 `BUILDING.md` 4.7。
   */
  labels: { code: { copyLabel: string; copiedLabel: string } }
}

/** shell 给的渲染器组件。 */
export type MarkdownComponent = (props: MarkdownProps) => unknown

/**
 * 兼容命名空间对象与默认导出两种模块形态。
 *
 * **不能只判断 `typeof === 'function'`**：shell 导出的 `MarkdownText` 是 `memo()` 包过的
 * 对象（`$$typeof: Symbol(react.memo)`），判函数会得到 `undefined`，
 * 然后静默退化成 `<pre>` —— 界面不报错，只是 markdown 全变成纯文本（踩过）。
 * @param mod - 模块命名空间或默认导出。
 * @returns 渲染器组件，取不到时为 undefined。
 */
function pickMarkdown(mod: unknown): MarkdownComponent | undefined {
  const read = (value: unknown): MarkdownComponent | undefined =>
    typeof value === 'function' || (typeof value === 'object' && value !== null)
      ? (value as MarkdownComponent)
      : undefined
  const ns = mod as Record<string, unknown> | undefined
  if (!ns) return undefined
  return read(ns.MarkdownText) ?? read((ns.default as Record<string, unknown> | undefined)?.MarkdownText)
}

/** 宿主提供的 Markdown 渲染器；未提供时为 `undefined`，调用方需退化成 `<pre>`。 */
export const MarkdownText: MarkdownComponent | undefined = pickMarkdown(primitivesNs)

/**
 * 把界面文案装成渲染器要的 `labels`。
 *
 * 单独抽出来是因为**每个** `MarkdownText` 调用点都必须传它（漏了就崩），
 * 而文案来源只有一个 —— 让调用方各自手搓 `{ code: { … } }` 迟早会漏。
 * @param t - 文案表。
 * @returns 渲染器的 labels。
 */
export function labelsFor(t: Copy): MarkdownProps['labels'] {
  return { code: { copyLabel: t.copyCode, copiedLabel: t.copiedCode } }
}

/**
 * 诊断信息：确认 shell 到底共享了哪些原语。只在模块加载时打一次。
 * 排查「渲染器行为与预期不符」时，先看这行日志比读源码快。
 */
export function logPlatform(): void {
  const ns = primitivesNs as Record<string, unknown> | undefined
  console.log('[readnote] primitives keys =', ns ? Object.keys(ns).join(',') : String(ns))
  console.log('[readnote] MarkdownText =', typeof MarkdownText)
}
