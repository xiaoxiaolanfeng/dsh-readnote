/**
 * 把批注画到原文上，并算出每条批注气泡该摆在哪儿。
 *
 * 两件事必须成对做：高亮是 CSS Custom Highlight API（**不改动 React 渲染出的 DOM**），
 * 气泡是绝对定位（相对 `.readnote__doc`）。分两个 effect 是为了让「定位」能在
 * 布局完成后重新算，而高亮只在批注变化时重建。
 * @module dsh-readnote/client/hooks/useNoteLayer
 */
import { useEffect, useState } from '../react.ts'
import { HIGHLIGHT_NAME } from '../constants.ts'
import { locateRange } from '../anchor.ts'
import type { BubbleBox, Note } from '../types.ts'

/** 气泡右侧至少留多少像素，不够就翻到左边。 */
const MIN_SPACE_RIGHT = 250

/** CSS Custom Highlight API 在当前浏览器里是否可用。 */
function highlightRegistry(): { set: (name: string, value: unknown) => void; delete: (name: string) => void } | undefined {
  const registry = (CSS as unknown as { highlights?: unknown } | undefined)?.highlights
  return registry as { set: (name: string, value: unknown) => void; delete: (name: string) => void } | undefined
}

/**
 * 维护批注的高亮与气泡落点。
 * @param docRef - 正文容器的 ref（定位上下文）。
 * @param notes - 当前文档的批注。
 * @param docKey - 文档身份（路径或名字）；变化时重算。
 * @returns 每条批注气泡的落点。
 */
export function useNoteLayer(docRef: { current: HTMLDivElement | null }, notes: Note[], docKey: string | null): BubbleBox[] {
  const [boxes, setBoxes] = useState<BubbleBox[]>([])

  // 高亮：整组一次性替换，避免残留上一批的 Range。
  useEffect(() => {
    const root = docRef.current
    const registry = highlightRegistry()
    const HighlightCtor = (window as unknown as { Highlight?: new () => { add: (range: Range) => void } }).Highlight
    if (root === null || registry === undefined || HighlightCtor === undefined) return undefined
    const group = new HighlightCtor()
    for (const note of notes) {
      const range = locateRange(root, note.anchor)
      if (range !== null) group.add(range)
    }
    registry.set(HIGHLIGHT_NAME, group)
    return () => registry.delete(HIGHLIGHT_NAME)
  }, [notes, docKey])

  /**
   * 定位：坐标相对 `.readnote__doc`（它是 position: relative 的定位上下文），
   * 所以父级滚动时气泡自然跟随，不必监听 scroll。
   */
  useEffect(() => {
    const docEl = docRef.current
    if (docEl === null || notes.length === 0) {
      setBoxes([])
      return
    }
    const docRect = docEl.getBoundingClientRect()
    const next: BubbleBox[] = []
    for (const note of notes) {
      const range = locateRange(docEl, note.anchor)
      if (range === null) continue
      const rects = Array.from(range.getClientRects())
      if (rects.length === 0) continue
      const first = rects[0]
      // 右侧放得下就挂右边，否则挂左边。
      const spaceRight = docEl.clientWidth - (first.right - docRect.left)
      const side: 'right' | 'left' = spaceRight > MIN_SPACE_RIGHT ? 'right' : 'left'
      next.push({
        note,
        top: first.top - docRect.top,
        left: side === 'right' ? first.right - docRect.left + 10 : first.left - docRect.left - 10,
        side,
      })
    }
    setBoxes(next)
  }, [notes, docKey])

  return boxes
}
