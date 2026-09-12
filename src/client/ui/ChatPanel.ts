/**
 * 右侧对话栏：显示当前会话最近的消息。
 *
 * 它自己是 flex 列，列表部分 `overflow-y: auto` —— **滚动条在这一栏内部**，
 * 不跟文档正文抢同一根滚动条（用户明确要求）。
 * @module dsh-readnote/client/ui/ChatPanel
 */
import { h } from '../react.ts'
import { MAX_MESSAGE_CHARS } from '../constants.ts'
import { MarkdownText, labelsFor } from '../markdown.ts'
import type { ChatMessage, Copy } from '../types.ts'

/** 组件的 props。 */
export interface ChatPanelProps {
  /** 文案表。 */
  t: Copy
  /** 最近的消息（旧的在上）。 */
  messages: ChatMessage[]
  /** 栏宽（像素）。 */
  width: number
}

/**
 * 右侧对话栏。
 * @param props - 见 {@link ChatPanelProps}。
 * @returns 对话栏元素。
 */
export function ChatPanel(props: ChatPanelProps): unknown {
  const { t, messages, width } = props
  return h(
    'div',
    { className: 'readnote__chat', style: { width: `${width}px` } },
    h(
      'div',
      { className: 'readnote__chat-head' },
      `${t.chat} · ${messages.length}`,
      h('span', { className: 'readnote__spacer' }),
    ),
    h(
      'div',
      { className: 'readnote__chat-list' },
      messages.length === 0 ? h('div', { className: 'readnote__chat-empty' }, t.chatEmpty) : null,
      ...messages.map((message, index) =>
        h(
          'div',
          {
            key: `${index}-${message.role}`,
            className: message.role === 'user' ? 'readnote__msg readnote__msg--user' : 'readnote__msg',
          },
          h('p', { className: 'readnote__msg-who' }, message.role === 'user' ? t.you : t.ai),
          h(
            'div',
            { className: 'readnote__msg-body' },
            message.role === 'assistant' && MarkdownText
              ? h(MarkdownText, { text: message.text.slice(0, MAX_MESSAGE_CHARS), streaming: false, labels: labelsFor(t) })
              : message.text.slice(0, MAX_MESSAGE_CHARS),
          ),
        ),
      ),
    ),
  )
}
