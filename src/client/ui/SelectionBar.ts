/**
 * 划词工具条：显示引用原文、写批注、问 AI。
 * @module dsh-readnote/client/ui/SelectionBar
 */
import { h } from '../react.ts'
import type { Copy, Pending } from '../types.ts'

/** 组件的 props。 */
export interface SelectionBarProps {
  /** 文案表。 */
  t: Copy
  /** 当前待落笔的选区；null 表示不显示工具条。 */
  pending: Pending | null
  /** 输入框内容。 */
  draft: string
  onDraft: (value: string) => void
  onSave: () => void
  onAsk: () => void
  onCancel: () => void
}

/**
 * 浮在选区旁的划词工具条。
 * @param props - 见 {@link SelectionBarProps}。
 * @returns 工具条元素或 null。
 */
export function SelectionBar(props: SelectionBarProps): unknown {
  const { t, pending, draft } = props
  if (pending === null) return null
  return h(
    'div',
    {
      className: 'readnote-sel',
      style: {
        // 两个方向都夹进视口：选区靠底/靠右时，浮层不能跑到屏幕外（踩过）。
        left: `${Math.max(12, Math.min(pending.x, window.innerWidth - 320))}px`,
        top: `${Math.max(12, Math.min(pending.y, window.innerHeight - 240))}px`,
      },
    },
    h('p', { className: 'readnote-sel__quote' }, pending.anchor.quote.slice(0, 120)),
    h('textarea', {
      className: 'readnote-sel__ta',
      placeholder: t.placeholder,
      value: draft,
      autoFocus: true,
      onChange: (event: { target: { value: string } }) => props.onDraft(event.target.value),
    }),
    h(
      'div',
      { className: 'readnote-sel__row' },
      h('span', { className: 'readnote-sel__spacer' }),
      h('button', { className: 'readnote-sel__cancel', type: 'button', onClick: props.onCancel }, t.cancel),
      h('button', { className: 'readnote-sel__go', type: 'button', onClick: props.onSave }, t.save),
      h('button', { className: 'readnote-sel__ask', type: 'button', onClick: props.onAsk }, t.ask),
    ),
  )
}
