/**
 * 会话端点：划词提问、取最后一条回答（「钉」的原料）、取最近消息（对话栏数据源）。
 * @module dsh-readnote/host/routes/chat
 */
import { ANSWER_PATH, ASK_PATH, DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT, MESSAGES_PATH } from '../constants.ts'
import { messageOf, registerRoute, sendJson } from '../http.ts'
import { buildUserMessage, projectMessages, textOf } from '../message.ts'
import type { HostServices } from '../types.ts'

/**
 * 取出会话里最后一条非空的助手文本。
 * @param session - 会话实例。
 * @returns 回答文本；没有则返回 null。
 */
function lastAssistantText(session: any): string | null {
  const messages = typeof session?.deriveMessages === 'function' ? session.deriveMessages() : []
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.role !== 'assistant') continue
    const text = textOf(list[i])
    if (text.length > 0) return text
  }
  return null
}

/**
 * 把「引用 + 问题」拼成发进会话的消息正文。
 * @param doc - 文档相对路径（可为空）。
 * @param quote - 选中的原文（可为空）。
 * @param question - 用户的问题。
 * @returns 消息正文。
 */
function composeQuestion(doc: string, quote: string, question: string): string {
  return [
    doc.length > 0 ? `【readnote】读《${doc}》时对这段话有疑问：` : '【readnote】对这段话有疑问：',
    '',
    quote.length > 0 ? `> ${quote.replace(/\n/g, '\n> ')}` : '',
    '',
    question,
  ].join('\n')
}

/**
 * 注册 `/ask`、`/last-answer`、`/messages`。
 * @param services - 宿主服务集合。
 */
export function registerChatRoutes(services: HostServices): void {
  // 划词提问：把问题作为一条**真实用户消息**发进当前会话。
  //
  // 为什么走会话而不是自己调模型（像 dsh-ask-in-sidebar 那样）：
  //   设计稿里「钉回原文」这个动作的前提，是回答本来就落在会话日志里。
  //   独立调模型的话，钉的是个游离于会话之外的回答，链路就断了。
  //
  // 消息形状是照会话里已有消息抄的（keys: role / content / source / id），
  // 不是读文档猜的 —— 见 BUILDING.md 4.7。
  registerRoute(services, ASK_PATH, async (payload, res, { ctx }) => {
    const sessionId = payload?.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      sendJson(res, 400, { error: 'sessionId required' })
      return
    }
    const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
    if (question.length === 0) {
      sendJson(res, 400, { error: 'question required' })
      return
    }
    const quote = typeof payload?.quote === 'string' ? payload.quote : ''
    const doc = typeof payload?.doc === 'string' ? payload.doc : ''

    const agents = ctx.get('agents')
    let agent = agents?.get?.(sessionId)
    let resumed = false
    if ((agent === undefined || agent === null) && typeof agents?.resume === 'function') {
      // agent 只在「正在工作」时留在 store 里，空闲就被释放。
      // 先试着自己唤醒它 —— 失败了再如实告诉用户，而不是让他猜。
      try {
        agent = await agents.resume(sessionId)
        resumed = true
      } catch {
        agent = undefined
      }
    }
    if (agent === undefined || agent === null) {
      // 会话没有活着的 agent 时**明确告诉前端**，而不是静默失败。
      sendJson(res, 200, {
        ok: false,
        reason: 'agent-not-live',
        message:
          '这个会话当前没有活跃 agent（dsh 只为正在工作的会话保留它，空闲即释放，resume 也没成功）。先在对话框里发一句话唤醒它，再回来提问。',
      })
      return
    }

    try {
      agent.followup(buildUserMessage(composeQuestion(doc, quote, question)))
      sendJson(res, 200, { ok: true, resumed })
    } catch (error) {
      sendJson(res, 500, { error: messageOf(error) })
    }
  })

  // 「钉」的原料：把会话里最后一条助手回答取出来给前端。
  //
  // 为什么不在这里调模型做「提炼」：提炼要再花一次调用，而且用户多半更想自己删减
  // ——「先看能改」是设计稿写死的硬约束。所以这里只负责**取回原文**，
  // 前端的编辑框负责提炼，用户点头才落成笔记。
  registerRoute(services, ANSWER_PATH, async (payload, res, { ctx }) => {
    const sessionId = payload?.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      sendJson(res, 400, { error: 'sessionId required' })
      return
    }

    const session = ctx.get('sessions')?.get?.(sessionId)
    if (session === undefined || session === null || typeof session.deriveMessages !== 'function') {
      sendJson(res, 200, {
        ok: false,
        reason: 'session-not-live',
        message: '这个会话当前不在内存里（dsh 只为活跃会话保留），先回对话页看一眼再回来钉。',
      })
      return
    }

    try {
      const text = lastAssistantText(session)
      if (text === null) {
        sendJson(res, 200, { ok: false, reason: 'no-answer', message: '还没找到助手回答 —— 先在阅读页用「问 AI」提个问。' })
        return
      }
      sendJson(res, 200, { ok: true, text })
    } catch (error) {
      sendJson(res, 500, { error: messageOf(error) })
    }
  })

  // 阅读页右侧对话栏的数据源：按时间顺序返回会话里最近的若干条消息。
  //
  // 为什么走轮询而不是订阅：client 侧订阅会话事件流要摸 `useConversation` 那套
  // （用法未验证）；而这是一个「你问一句、它答一句」的低频面板，2 秒轮询足够，
  // 且不引入对宿主事件协议的依赖。真嫌慢再换订阅。
  registerRoute(services, MESSAGES_PATH, async (payload, res, { ctx }) => {
    const sessionId = payload?.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      sendJson(res, 400, { error: 'sessionId required' })
      return
    }
    const limit =
      typeof payload?.limit === 'number' && payload.limit > 0
        ? Math.min(payload.limit, MAX_MESSAGE_LIMIT)
        : DEFAULT_MESSAGE_LIMIT

    const session = ctx.get('sessions')?.get?.(sessionId)
    if (session === undefined || session === null || typeof session.deriveMessages !== 'function') {
      sendJson(res, 200, { ok: false, reason: 'session-not-live' })
      return
    }

    try {
      const all = projectMessages(session)
      sendJson(res, 200, { ok: true, total: all.length, messages: all.slice(-limit) })
    } catch (error) {
      sendJson(res, 500, { error: messageOf(error) })
    }
  })
}
