/**
 * host 端点的客户端封装。
 *
 * 每个函数只做一件事：发请求、解析、把 host 的 `{ ok: false, reason }` 转成一个
 * 可读的失败值。**不抛异常给调用方做流程控制** —— 调用方只需要看 `ok`。
 * @module dsh-readnote/client/api
 */
import {
  ANSWER_PATH,
  ASK_PATH,
  LIST_PATH,
  MESSAGES_PATH,
  NOTES_READ_PATH,
  NOTES_SAVE_PATH,
  READ_PATH,
} from './constants.ts'
import type { ChatMessage, DirEntry, Note } from './types.ts'

/**
 * POST 一个 JSON 到 host 端点。
 * @param path - 端点路径。
 * @param payload - 请求体。
 * @returns 解析后的响应体。
 * @throws 响应为空（通常意味着端点没注册）或不是 JSON 时抛出，附带 HTTP 状态码。
 */
async function post(path: string, payload: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (text.length === 0) {
    throw new Error(`空响应 HTTP ${res.status} ← 端点 ${path} 可能未注册（host 半边没加载？）`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`非 JSON 响应 HTTP ${res.status}: ${text.slice(0, 180)}`)
  }
}

/** 一层目录的列表结果。 */
export interface ListResult {
  ok: boolean
  dir?: string
  entries?: DirEntry[]
  reason?: string
  error?: string
}

/**
 * 列出工作区内某一层。
 * @param sessionId - 会话 id。
 * @param dir - 相对工作区的目录，空串表示根。
 * @returns 列表结果。
 */
export async function listDir(sessionId: string, dir: string): Promise<ListResult> {
  return (await post(LIST_PATH, { sessionId, dir })) as ListResult
}

/** 读取一篇文档的结果。 */
export interface ReadResult {
  ok: boolean
  name?: string
  content?: string
  size?: number
  reason?: string
  error?: string
}

/**
 * 读取工作区内某个 markdown 文件。
 * @param sessionId - 会话 id。
 * @param path - 相对工作区的路径。
 * @returns 读取结果。
 */
export async function readDoc(sessionId: string, path: string): Promise<ReadResult> {
  return (await post(READ_PATH, { sessionId, path })) as ReadResult
}

/**
 * 取某篇文档的批注。
 * @param sessionId - 会话 id。
 * @param doc - 文档相对路径。
 * @returns 批注数组（取不到时为空数组）。
 */
export async function loadNotes(sessionId: string, doc: string): Promise<Note[]> {
  const data = await post(NOTES_READ_PATH, { sessionId, doc })
  return data.ok === true && Array.isArray(data.notes) ? (data.notes as Note[]) : []
}

/**
 * 覆盖写某篇文档的批注。失败只记日志，不回滚本地状态。
 * @param sessionId - 会话 id。
 * @param doc - 文档相对路径。
 * @param notes - 完整批注数组（空数组表示清空这篇）。
 */
export async function saveNotes(sessionId: string, doc: string, notes: Note[]): Promise<void> {
  try {
    const data = await post(NOTES_SAVE_PATH, { sessionId, doc, notes })
    if (data.ok !== true) console.warn('[readnote] save notes failed', data)
  } catch (error) {
    console.warn('[readnote] save notes error', error)
  }
}

/** 提问的结果。 */
export interface AskResult {
  ok: boolean
  reason?: string
  message?: string
  error?: string
}

/**
 * 把选区 + 问题发进当前会话。
 * @param sessionId - 会话 id。
 * @param doc - 文档相对路径。
 * @param quote - 选中的原文。
 * @param question - 用户的问题。
 * @returns 提问结果。
 */
export async function ask(sessionId: string, doc: string, quote: string, question: string): Promise<AskResult> {
  return (await post(ASK_PATH, { sessionId, doc, quote, question })) as AskResult
}

/** 取最后一条助手回答的结果。 */
export interface AnswerResult {
  ok: boolean
  text?: string
  reason?: string
  message?: string
}

/**
 * 取会话里最后一条助手文本回答。
 * @param sessionId - 会话 id。
 * @returns 回答结果。
 */
export async function lastAnswer(sessionId: string): Promise<AnswerResult> {
  return (await post(ANSWER_PATH, { sessionId })) as AnswerResult
}

/**
 * 取会话最近的消息（给右侧对话栏用）。
 * @param sessionId - 会话 id。
 * @param limit - 最多几条。
 * @returns 消息数组；会话不在内存里时为空。
 */
export async function loadMessages(sessionId: string, limit: number): Promise<ChatMessage[]> {
  const data = await post(MESSAGES_PATH, { sessionId, limit })
  return data.ok === true && Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : []
}
