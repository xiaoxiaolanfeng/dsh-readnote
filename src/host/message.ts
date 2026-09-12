/**
 * 会话消息的读取与构造。
 * @module dsh-readnote/host/message
 */
import { randomUUID } from 'node:crypto'
import type { ChatMessage } from './types.ts'

/**
 * 深冻结一个值（对标 dsh `freezeMessage` 的处理）。
 * @param value - 待冻结的值。
 * @returns 同一个值，已被递归冻结。
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

/**
 * 造一条合法的用户消息。
 *
 * **`id` 不能省。** dsh 的 `Message` 要求每条消息带稳定身份，官方
 * `createUserMessage()` 用 `randomUUID()` 生成它；类型上的 `NewMessage`
 * 正是 `Omit<Message, 'id'>`，即「不含 id 的输入」。
 *
 * 手写对象绕过这一步的后果是**静默且致命**：消息发得出去、模型也回答，
 * 但落盘后加载校验会拒绝整份日志 —— 实测一条缺 id 的消息废掉了 2226 条事件、
 * 直接导致会话历史打不开。
 *
 * 这里不 import `@deepseek-ai/dsh-llm`（独立包解析不到 dsh 的 node_modules），
 * 所以按它的实现等价复刻：生成 uuid + 深冻结。
 *
 * @param text - 消息正文。
 * @returns 冻结后的用户消息。
 */
export function buildUserMessage(text: string): Record<string, unknown> {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })
}

/**
 * 取一条消息里的纯文本。
 * @param message - 会话消息。
 * @returns 拼接后的文本（已 trim）。
 */
export function textOf(message: any): string {
  const parts = Array.isArray(message?.content) ? message.content : []
  return parts
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim()
}

/**
 * 把会话消息投影成对话栏能直接渲染的列表。
 *
 * 过滤掉两类：非 user/assistant 的（工具调用等）、以及宿主注入的环境上下文
 * （`<system-reminder>` 那段 AGENTS.md 提醒之类）—— 它是给模型的，
 * 出现在用户的对话栏里就是噪声（实测踩过）。
 *
 * @param session - SessionStore 里的会话实例。
 * @returns 按时间顺序的消息；角色不是 user/assistant 的跳过。
 */
export function projectMessages(session: any): ChatMessage[] {
  const all = typeof session?.deriveMessages === 'function' ? session.deriveMessages() : []
  const out: ChatMessage[] = []
  for (const message of Array.isArray(all) ? all : []) {
    const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null
    if (role === null) continue
    const text = textOf(message)
    if (text.length === 0) continue
    if (text.startsWith('<system-reminder')) continue
    out.push({ role, text })
  }
  return out
}
