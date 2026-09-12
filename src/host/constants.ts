/**
 * host 半边的常量。
 *
 * 端点路径**必须**与 `src/client/constants.ts` 一一对应 —— 两边是同一个协议的
 * 两端，改一个就要改另一个。这里不共享一份定义，是因为 client 半边要能被 esbuild
 * 单独打包进浏览器，引一个 host 模块会把 node 依赖拖进去。
 * @module dsh-readnote/host/constants
 */

/** 端点路径。 */
export const LIST_PATH = '/__readnote/list'
export const READ_PATH = '/__readnote/read'
export const NOTES_READ_PATH = '/__readnote/notes'
export const NOTES_SAVE_PATH = '/__readnote/notes/save'
export const ASK_PATH = '/__readnote/ask'
export const ANSWER_PATH = '/__readnote/last-answer'
export const MESSAGES_PATH = '/__readnote/messages'
export const DIAG_PATH = '/__readnote/diag'

/**
 * 批注库放在工作区里的位置。
 * 刻意「旁挂」而不是写进 markdown 正文：我们读的很可能是别人仓库里的文件，
 * 往里写东西会弄脏对方的工作区（本项目自己就是活例子）。
 */
export const NOTES_DIR = '.readnote'
export const NOTES_FILE = 'annotations.json'

/** 单个文档的批注条数上限，防止畸形数据把库撑爆。 */
export const MAX_NOTES_PER_DOC = 500

/** 单个文件大小上限（2 MB）—— 超过就不往浏览器送。 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

/** 单层目录最多返回多少条，防止某个目录里堆了几万个文件。 */
export const MAX_ENTRIES = 500

/** 请求体上限（1 MB），超了直接断开连接。 */
export const MAX_BODY_CHARS = 1_000_000

/** 对话栏一次最多要多少条消息。 */
export const MAX_MESSAGE_LIMIT = 60

/** 对话栏默认取多少条消息。 */
export const DEFAULT_MESSAGE_LIMIT = 24

/** 明确跳过的目录名。 */
export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.next',
  'dist',
  'build',
  'lib',
  'coverage',
  '__pycache__',
])

/** 认作可读 markdown 的扩展名。 */
export const MD_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])
