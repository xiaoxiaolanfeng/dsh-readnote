/**
 * 对话栏的宽度拖拽手柄。
 *
 * 只负责「长出可拖的样子 + 把事件转出去」，宽度状态在 `useChatWidth` 里 ——
 * 手柄本身不知道宽度是多少，也就不会和文档布局耦合。
 * @module dsh-readnote/client/ui/ChatResizer
 */
import { h } from '../react.ts'
import type { PointerLike } from '../hooks/useChatWidth.ts'

/** 组件的 props。 */
export interface ChatResizerProps {
  /** 文案表（拿拖拽提示语）。 */
  dragHint: string
  /** 是否正在拖拽。 */
  dragging: boolean
  onHandleDown: (event: PointerLike) => void
  /** 双击复位。 */
  onReset: () => void
}

/**
 * 拖拽手柄。
 * @param props - 见 {@link ChatResizerProps}。
 * @returns 手柄元素。
 */
export function ChatResizer(props: ChatResizerProps): unknown {
  return h('div', {
    className: 'readnote__handle',
    role: 'separator',
    'aria-orientation': 'vertical',
    title: props.dragHint,
    'data-dragging': props.dragging ? 'true' : 'false',
    onPointerDown: props.onHandleDown,
    onDoubleClick: props.onReset,
  })
}
