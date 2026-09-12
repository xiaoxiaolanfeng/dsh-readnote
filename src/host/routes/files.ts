/**
 * 文件端点：列目录与读文档。
 * @module dsh-readnote/host/routes/files
 */
import { readFile, stat } from 'node:fs/promises'
import { extname, relative, sep } from 'node:path'
import { LIST_PATH, MAX_FILE_BYTES, MD_EXTENSIONS, READ_PATH } from '../constants.ts'
import { messageOf, registerRoute, sendJson } from '../http.ts'
import { listDirectory, resolveCwd, safeResolve } from '../workspace.ts'
import type { HostServices } from '../types.ts'

/**
 * 注册 `/list` 与 `/read`。
 * @param services - 宿主服务集合。
 */
export function registerFileRoutes(services: HostServices): void {
  registerRoute(services, LIST_PATH, async (payload, res, { sessions, registry }) => {
    const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
    if (cwd === null) {
      // 诊断字段：让前端能直接看到会话对象长什么样，便于定位 cwd 到底从哪来。
      sendJson(res, 200, {
        ok: false,
        reason: 'cwd-not-found',
        receivedSessionId: payload?.sessionId ?? null,
        receivedSessionIdType: typeof payload?.sessionId,
        hasSessions: Boolean(sessions),
        hasRegistry: Boolean(registry),
        registryWorkspaces: registry?.list?.()?.length ?? 0,
      })
      return
    }

    const rel = typeof payload?.dir === 'string' ? payload.dir.replace(/^\/+|\/+$/g, '') : ''
    try {
      const entries = await listDirectory(cwd, rel)
      sendJson(res, 200, { ok: true, workspace: cwd, dir: rel, entries })
    } catch (error) {
      sendJson(res, 404, { ok: false, error: messageOf(error) })
    }
  })

  registerRoute(services, READ_PATH, async (payload, res, { sessions, registry }) => {
    const cwd = await resolveCwd(sessions, registry, payload?.sessionId)
    if (cwd === null) {
      sendJson(res, 200, { ok: false, reason: 'cwd-not-found' })
      return
    }
    if (typeof payload?.path !== 'string' || payload.path.length === 0) {
      sendJson(res, 400, { error: 'path required' })
      return
    }

    const abs = safeResolve(cwd, payload.path)
    if (abs === null) {
      sendJson(res, 403, { error: 'path outside workspace' })
      return
    }
    if (!MD_EXTENSIONS.has(extname(abs).toLowerCase())) {
      sendJson(res, 415, { error: 'not a markdown file' })
      return
    }

    try {
      const info = await stat(abs)
      if (info.size > MAX_FILE_BYTES) {
        sendJson(res, 413, { error: `file too large (${info.size} bytes)` })
        return
      }
      const content = await readFile(abs, 'utf8')
      sendJson(res, 200, {
        ok: true,
        path: abs,
        // 名字统一用 / 分隔：它是批注库的键，跨平台必须稳定。
        name: relative(cwd, abs).split(sep).join('/'),
        size: info.size,
        content,
      })
    } catch (error) {
      sendJson(res, 404, { error: messageOf(error) })
    }
  })
}
