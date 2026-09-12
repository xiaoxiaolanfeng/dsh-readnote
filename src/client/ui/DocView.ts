/**
 * 文档正文：markdown 渲染 + 批注气泡层。
 * @module dsh-readnote/client/ui/DocView
 */
import { h } from '../react.ts'
import { MAX_RENDER_CHARS } from '../constants.ts'
import { MarkdownText, labelsFor } from '../markdown.ts'
import { RenderBoundary } from './RenderBoundary.ts'
import type { BubbleBox, Copy, OpenDoc } from '../types.ts'

/** 组件的 props。 */
export interface DocViewProps {
  /** 文案表。 */
  t: Copy
  /** 当前文档。 */
  doc: OpenDoc
  /** 批注气泡的落点（相对 `.readnote__doc`）。 */
  boxes: BubbleBox[]
  /** 正文容器的 ref，划词定位和气泡定位都要读它。 */
  docRef: { current: HTMLDivElement | null }
  /** 鼠标抬起 —— 触发划词判定。 */
  onMouseUp: () => void
  /** 删除一条批注。 */
  onDeleteNote: (id: string) => void
}

/**
 * 文档正文视图。
 * @param props - 见 {@link DocViewProps}。
 * @returns 正文元素。
 */
export function DocView(props: DocViewProps): unknown {
  const { t, doc, boxes } = props
  const over = doc.content.length > MAX_RENDER_CHARS
  const text = over ? doc.content.slice(0, MAX_RENDER_CHARS) : doc.content

  return h(
    'div',
    { className: 'readnote__doc', ref: props.docRef, onMouseUp: props.onMouseUp },
    over
      ? h(
          'p',
          { className: 'readnote__hint' },
          `文档过长（${doc.content.length.toLocaleString()} 字符），只渲染了前 ${MAX_RENDER_CHARS.toLocaleString()} 字符`,
        )
      : null,
    h(
      RenderBoundary,
      { fileName: doc.name },
      MarkdownText ? h(MarkdownText, { text, streaming: false, labels: labelsFor(t) }) : h('pre', null, text),
    ),
    // 批注气泡层：绝对定位在 .readnote__doc 内，直接挂在高亮文字旁边。
    ...boxes.map(({ note, left, top, side }) =>
      h(
        'div',
        {
          key: note.id,
          className: 'readnote-bubble',
          style: {
            left: `${left}px`,
            top: `${top}px`,
            transform: side === 'left' ? 'translateX(-100%)' : undefined,
          },
        },
        h(
          'div',
          {
            className: note.text.length === 0 ? 'readnote-bubble__text readnote-bubble__empty' : 'readnote-bubble__text',
          },
          note.text.length > 0 ? note.text : t.markOnly,
        ),
        h(
          'button',
          {
            className: 'readnote-bubble__del',
            type: 'button',
            title: t.remove,
            onClick: () => props.onDeleteNote(note.id),
          },
          '✕',
        ),
      ),
    ),
  )
}
