/**
 * 轮询当前会话最近的消息，喂给右侧对话栏。
 *
 * 只在「正打开着一篇文档」时轮询 —— 没在读书的时候没必要打扰宿主。
 * 轮询失败静默：网络抖一下不该在面板上刷红字。
 * @module dsh-readnote/client/hooks/useSessionMessages
 */
import { useEffect, useState } from '../react.ts'
import { MESSAGE_LIMIT, POLL_INTERVAL_MS } from '../constants.ts'
import { loadMessages } from '../api.ts'
import type { ChatMessage } from '../types.ts'

/**
 * 订阅会话消息。
 * @param sessionId - 会话 id；undefined 时不轮询。
 * @param enabled - 是否开启（没打开文档就传 false）。
 * @returns 最近的消息列表。
 */
export function useSessionMessages(sessionId: string | undefined, enabled: boolean): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    if (!enabled || sessionId === undefined) return undefined
    let alive = true
    const tick = (): void => {
      void loadMessages(sessionId, MESSAGE_LIMIT)
        .then((next) => {
          if (alive) setMessages(next)
        })
        .catch(() => {
          // 忽略：下一拍会重试。
        })
    }
    tick()
    const timer = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [sessionId, enabled])

  return messages
}
