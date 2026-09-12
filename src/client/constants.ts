/**
 * client 半边的常量。
 * @module dsh-readnote/client/constants
 */

/** 注入样式的 `<style>` id，避免重复注入。 */
export const STYLE_ID = 'readnote-style'

/** host 端点路径。与 `src/host/constants.ts` 一一对应。 */
export const LIST_PATH = '/__readnote/list'
export const READ_PATH = '/__readnote/read'
export const NOTES_READ_PATH = '/__readnote/notes'
export const NOTES_SAVE_PATH = '/__readnote/notes/save'
export const ASK_PATH = '/__readnote/ask'
export const ANSWER_PATH = '/__readnote/last-answer'
export const MESSAGES_PATH = '/__readnote/messages'

/** CSS Custom Highlight API 里这组高亮的名字。 */
export const HIGHLIGHT_NAME = 'readnote-notes'

/**
 * 版本标记：每次改 client 就递增。
 * 用途是排查「改了代码但行为没变」—— 先确认浏览器到底加载了哪一版。
 */
export const BUILD_TAG = 'r21'

/** 锚点前后各取多少字做校验。 */
export const CONTEXT_CHARS = 32

/**
 * 单次渲染的字符上限。
 * 超过就只渲染前一段并提示 —— 超长文档会把主线程堵死（实测踩过）。
 */
export const MAX_RENDER_CHARS = 120_000

/** 对话栏里单条消息最多渲染多少字符。 */
export const MAX_MESSAGE_CHARS = 6000

/** 对话栏轮询间隔（毫秒）。 */
export const POLL_INTERVAL_MS = 2000

/** 对话栏一次拉多少条消息。 */
export const MESSAGE_LIMIT = 24

/** localStorage 键名（带前缀，避免与宿主或别的插件撞）。 */
export const LS_LAST = 'readnote:last'
export const LS_RECENT = 'readnote:recent'
export const LS_CHAT_WIDTH = 'readnote:chatWidth'

/** 最近打开最多留几条。 */
export const MAX_RECENT = 8

/** 对话栏宽度的取值范围与默认值（像素）。 */
export const CHAT_WIDTH_DEFAULT = 340
export const CHAT_WIDTH_MIN = 240
export const CHAT_WIDTH_MAX = 720
