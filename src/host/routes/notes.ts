/**
 * 批注端点：读一篇的批注、覆盖写一篇的批注。
 * @module dsh-readnote/host/routes/notes
 */
import { MAX_NOTES_PER_DOC, NOTES_READ_PATH, NOTES_SAVE_PATH } from '../constants.ts'
import { messageOf, registerRoute, sendJson } from '../http.ts'
import { readNotes, writeNotes } from '../notes.ts'
import { resolveCwd } from '../workspace.ts'
import type { HostServices } from '../types.ts'

/**
 * 注册 `/notes` 与 `/notes/save`。
 * @param services - 宿主服务集合。
 */
export function registerNoteRoutes(services: HostServices): void {
  registerRoute(services, NOTES_READ_PATH, async (payload, res, { sessions, registry }) => {
    const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
    if (cwd === null) {
      sendJson(res, 200, { ok: false, reason: 'cwd-not-found' })
      return
    }
    const docs = await readNotes(cwd)
    const doc = typeof payload?.doc === 'string' ? payload.doc : ''
    sendJson(res, 200, { ok: true, doc, notes: docs[doc] ?? [] })
  })

  registerRoute(services, NOTES_SAVE_PATH, async (payload, res, { sessions, registry }) => {
    const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
    if (cwd === null) {
      sendJson(res, 200, { ok: false, reason: 'cwd-not-found' })
      return
    }
    if (typeof payload?.doc !== 'string' || payload.doc.length === 0) {
      sendJson(res, 400, { error: 'doc required' })
      return
    }
    if (!Array.isArray(payload?.notes)) {
      sendJson(res, 400, { error: 'notes must be an array' })
      return
    }
    const notes = payload.notes.slice(0, MAX_NOTES_PER_DOC)

    try {
      const docs = await readNotes(cwd)
      // 空数组 = 该文档已无批注，顺手把键删掉，别在库里留空壳。
      if (notes.length === 0) delete docs[payload.doc]
      else docs[payload.doc] = notes
      await writeNotes(cwd, docs)
      sendJson(res, 200, { ok: true, count: notes.length })
    } catch (error) {
      sendJson(res, 500, { error: messageOf(error) })
    }
  })
}
