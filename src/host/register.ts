/**
 * host 端点的统一注册入口。
 * @module dsh-readnote/host/register
 */
import {
  ANSWER_PATH,
  ASK_PATH,
  DIAG_PATH,
  LIST_PATH,
  MESSAGES_PATH,
  NOTES_READ_PATH,
  NOTES_SAVE_PATH,
  READ_PATH,
} from './constants.ts'
import { registerChatRoutes } from './routes/chat.ts'
import { registerDiagRoute } from './routes/diag.ts'
import { registerFileRoutes } from './routes/files.ts'
import { registerNoteRoutes } from './routes/notes.ts'
import type { HostServices } from './types.ts'

/**
 * 注册全部 host 端点。
 * @param services - 宿主服务集合；`host` 必须可用。
 */
export function registerRoutes(services: HostServices): void {
  registerFileRoutes(services)
  registerNoteRoutes(services)
  registerChatRoutes(services)
  registerDiagRoute(services)

  console.log(
    '[readnote] host 端点已注册:',
    LIST_PATH,
    READ_PATH,
    NOTES_READ_PATH,
    NOTES_SAVE_PATH,
    ASK_PATH,
    ANSWER_PATH,
    MESSAGES_PATH,
    DIAG_PATH,
  )
}
