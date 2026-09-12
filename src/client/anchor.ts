/**
 * 锚点定位：把「一段被选中的文本」变成可重新找回的 Range。
 *
 * 用 W3C Web Annotation 的 TextQuoteSelector 思路：记录 `quote` + 前后各若干字的
 * `prefix`/`suffix`，重新渲染后按这三者匹配，而不是存脆弱的字符偏移量。
 *
 * **必须跨文本节点搜索**：markdown 渲染会把 `**加粗**` 变成 `<strong>`，
 * 一句话被拆成好几个文本节点，只在单节点里 `indexOf` 会漏掉跨格式的引用
 * （而且是静默漏 —— 批注存下来了，界面上什么都不显示）。
 * @module dsh-readnote/client/anchor
 */
import { CONTEXT_CHARS } from './constants.ts'
import type { NoteAnchor, TextIndex } from './types.ts'

/**
 * 从当前选区构造锚点。
 * @param range - 选区对应的 Range。
 * @returns 锚点；选区跨节点时前后缀退化为空串。
 */
export function buildAnchor(range: Range): NoteAnchor {
  const quote = range.toString()
  const node = range.startContainer
  const full = node.textContent ?? ''
  const start = range.startOffset
  const end = range.endOffset
  const sameNode = range.startContainer === range.endContainer
  return {
    quote,
    prefix: sameNode ? full.slice(Math.max(0, start - CONTEXT_CHARS), start) : '',
    suffix: sameNode ? full.slice(end, end + CONTEXT_CHARS) : '',
  }
}

/**
 * 把 root 下的文本节点按 DOM 顺序串成一条字符串。
 * @param root - 文档容器。
 * @returns 全局文本与节点索引。
 */
export function buildTextIndex(root: HTMLElement): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; start: number }> = []
  let text = ''
  let current = walker.nextNode() as Text | null
  while (current !== null) {
    nodes.push({ node: current, start: text.length })
    text += current.data
    current = walker.nextNode() as Text | null
  }
  return { text, nodes }
}

/**
 * 把全局偏移映射回 (文本节点, 节点内偏移)。
 * @param index - buildTextIndex 的结果。
 * @param offset - 全局偏移。
 * @returns 落点；越界返回 null。
 */
export function pointAt(index: TextIndex, offset: number): { node: Text; offset: number } | null {
  for (let i = index.nodes.length - 1; i >= 0; i -= 1) {
    const entry = index.nodes[i]
    if (offset >= entry.start) return { node: entry.node, offset: offset - entry.start }
  }
  return null
}

/**
 * 在已渲染的文档里把锚点找回来（跨文本节点）。
 * 优先「前后缀都对上」的那一处；找不到则退化为第一处纯文本匹配。
 * @param root - 文档容器。
 * @param anchor - 批注锚点。
 * @returns 命中的 Range，找不到返回 null。
 */
export function locateRange(root: HTMLElement, anchor: NoteAnchor): Range | null {
  if (anchor.quote.length === 0) return null
  const index = buildTextIndex(root)
  let fallback: Range | null = null
  let from = 0
  for (;;) {
    const at = index.text.indexOf(anchor.quote, from)
    if (at === -1) break
    const startPoint = pointAt(index, at)
    const endPoint = pointAt(index, at + anchor.quote.length)
    if (startPoint !== null && endPoint !== null) {
      const before = index.text.slice(Math.max(0, at - anchor.prefix.length), at)
      const after = index.text.slice(at + anchor.quote.length, at + anchor.quote.length + anchor.suffix.length)
      const exact = before.endsWith(anchor.prefix) && after.startsWith(anchor.suffix)
      const range = document.createRange()
      range.setStart(startPoint.node, startPoint.offset)
      range.setEnd(endPoint.node, endPoint.offset)
      if (exact) return range
      if (fallback === null) fallback = range
    }
    from = at + 1
  }
  return fallback
}
