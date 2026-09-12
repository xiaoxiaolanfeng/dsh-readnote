/**
 * dsh-readnote · client half。
 *
 * 三条机制并存：
 *   1. 挂载 —— dsh 社区主流的 ModuleLoader 手写包装（零额外构建步骤）。
 *   2. 视图 —— 注册进 conversation.view 槽，与「对话 / 轨迹」并列的原生页签。
 *   3. 渲染 —— 直接复用 dsh 自己的 MarkdownText（baseline external），
 *      风格与聊天区天然一致，不必自造轮子。
 *
 * 硬约束（踩过就知道疼）：
 *   - id 必须与 package.json 的 "name" 完全一致，否则 client-modules 会以
 *     "bundle loaded without registering <name>" 拒绝挂载。
 *   - 本文件不能出现 import / export 语句（被 shell 当普通脚本加载），
 *     所以用类型断言而不是 declare global。
 *   - React / ui-slots / ui-primitives 都是 baseline external，由 shell 提供，
 *     不需要写进 package.json 的 dsh.client.external。
 */

interface ModuleLoaderDef {
  id: string
  factory: (require: (specifier: string) => unknown) => unknown
}

const STYLE_ID = 'readnote-style'
const LIST_PATH = '/__readnote/list'
const READ_PATH = '/__readnote/read'

/** 样式走 dsh 的主题 token，跟宿主保持一致的外观。 */
const STYLES = `
.readnote {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  font-family: var(--dsw-font-family, system-ui);
  color: var(--dsw-alias-label-primary, #f5f5f7);
}
.readnote__bar {
  display: flex; align-items: center; gap: 10px; flex: none;
  min-height: 44px; padding: 0 16px;
  border-bottom: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.08));
  font-size: 12px;
}
.readnote__name { font-size: 13px; font-weight: 600; }
.readnote__meta { opacity: .5; }
.readnote__spacer { flex: 1; }
.readnote__btn {
  height: 26px; padding: 0 12px; border: none; border-radius: 13px;
  background: transparent; color: inherit; font-family: inherit;
  font-size: 12px; cursor: pointer; opacity: .8;
}
.readnote__btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1; }
.readnote__btn[disabled] { opacity: .35; cursor: default; }
.readnote__body { flex: 1; min-height: 0; overflow: auto; }
.readnote__doc { max-width: 74ch; margin: 0 auto; padding: 28px 32px 80px; }
.readnote__list { max-width: 74ch; margin: 0 auto; padding: 20px 32px 60px; }
.readnote__hint { margin: 0 0 14px; font-size: 13px; opacity: .6; }
.readnote__item {
  display: flex; align-items: baseline; gap: 10px; width: 100%;
  padding: 9px 12px; border: none; border-radius: 8px;
  background: transparent; color: inherit; font-family: inherit;
  font-size: 13px; text-align: left; cursor: pointer;
}
.readnote__item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.07)); }
.readnote__item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.readnote__item-meta { flex: none; font-size: 11px; opacity: .45; }
.readnote__empty, .readnote__error {
  padding: 40px 32px; max-width: 74ch; margin: 0 auto;
  font-size: 13px; line-height: 1.8; opacity: .7; white-space: pre-wrap;
}
.readnote__error { color: var(--dsw-alias-label-error, #ff6b6b); opacity: .95; }
`

/** 一个可读的 markdown 文件索引项。 */
interface DocEntry {
  name: string
  path: string
  size: number
  mtime: number
}

interface Copy {
  label: string
  pick: string
  back: string
  reload: string
  empty: string
  loading: string
}

/**
 * 跟随浏览器语言取文案（dsh 的产品文案是双语的）。
 * @returns 当前语言的文案表。
 */
function copy(): Copy {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  return zh
    ? { label: '阅读', pick: '挑一份 markdown 开始读', back: '← 返回列表', reload: '重新加载', empty: '工作区里没找到 markdown 文件', loading: '加载中…' }
    : { label: 'Read', pick: 'Pick a markdown file to read', back: '← Back to list', reload: 'Reload', empty: 'No markdown files found in this workspace', loading: 'Loading…' }
}

/**
 * 人类可读的文件大小。
 * @param bytes - 字节数。
 * @returns 形如 "12 KB" 的字符串。
 */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** style 元素只注入一次，插件重载时不重复。 */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.appendChild(style)
}

const loader = (
  window as unknown as { __ModuleLoader__?: { load: (def: ModuleLoaderDef) => void } }
).__ModuleLoader__

loader?.load({
  id: 'dsh-readnote',
  factory: (require) => {
    'use strict'
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports

    /** 兼容命名空间对象与默认导出两种模块形态。 */
    function pick<T>(mod: unknown, key: string): T | undefined {
      const ns = mod as Record<string, unknown> | undefined
      if (!ns) return undefined
      if (ns[key] !== undefined) return ns[key] as T
      const def = ns.default as Record<string, unknown> | undefined
      return def?.[key] as T | undefined
    }

    const React = pick<any>(require('react'), 'default') ?? (require('react') as any)
    const useState = React.useState as <T>(initial: T) => [T, (next: T) => void]
    const useEffect = React.useEffect as (fn: () => void | (() => void), deps: unknown[]) => void
    const h = React.createElement as (type: unknown, props?: unknown, ...children: unknown[]) => unknown

    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const MarkdownText = pick<any>(primitives, 'MarkdownText')

    /**
     * POST 一个 JSON 到 host 端点。
     * @param path - 端点路径。
     * @param payload - 请求体。
     * @returns 解析后的响应体。
     */
    async function post(path: string, payload: unknown): Promise<any> {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      if (text.length === 0) {
        // 空响应通常意味着端点根本没注册 —— 请求落到了静态服务上。
        throw new Error(`空响应 HTTP ${res.status} ← 端点 ${path} 可能未注册（host 半边没加载？）`)
      }
      try {
        return JSON.parse(text)
      } catch {
        throw new Error(`非 JSON 响应 HTTP ${res.status}: ${text.slice(0, 180)}`)
      }
    }

    /** 阅读视图：文件列表 ⇄ 文档正文。 */
    function ReadnoteView(props: { sessionId?: string }): unknown {
      const t = copy()
      const sessionId = props?.sessionId

      const [files, setFiles] = useState<DocEntry[] | null>(null)
      const [doc, setDoc] = useState<{ name: string; content: string; size: number } | null>(null)
      const [error, setError] = useState<string | null>(null)
      const [busy, setBusy] = useState(false)

      const loadList = (): void => {
        if (sessionId === undefined) {
          setError('no session id in slot props')
          return
        }
        setBusy(true)
        setError(null)
        void post(LIST_PATH, { sessionId })
          .then((data) => {
            if (data?.ok) {
              setFiles(data.files ?? [])
            } else {
              setError(
                `list failed: ${data?.reason ?? data?.error ?? 'unknown'}\n` +
                  `hasSessionsService=${String(data?.hasSessionsService)} hasSession=${String(data?.hasSession)}\n` +
                  `sessionKeys=${JSON.stringify(data?.sessionKeys ?? [])}`,
              )
            }
          })
          .catch((e: unknown) => setError(`list error: ${String(e)}`))
          .finally(() => setBusy(false))
      }

      const openDoc = (entry: DocEntry): void => {
        setBusy(true)
        setError(null)
        void post(READ_PATH, { sessionId, path: entry.path })
          .then((data) => {
            if (data?.ok) setDoc({ name: data.name ?? entry.name, content: data.content ?? '', size: data.size ?? entry.size })
            else setError(`read failed: ${data?.error ?? data?.reason ?? 'unknown'}`)
          })
          .catch((e: unknown) => setError(`read error: ${String(e)}`))
          .finally(() => setBusy(false))
      }

      useEffect(() => {
        loadList()
        // 只在会话切换时重新拉列表。
      }, [sessionId])

      const bar = h(
        'div',
        { className: 'readnote__bar' },
        h('span', { className: 'readnote__name' }, doc ? doc.name : t.pick),
        doc ? h('span', { className: 'readnote__meta' }, humanSize(doc.size)) : null,
        h('span', { className: 'readnote__spacer' }),
        busy ? h('span', { className: 'readnote__meta' }, t.loading) : null,
        doc
          ? h('button', { className: 'readnote__btn', type: 'button', onClick: () => setDoc(null) }, t.back)
          : h('button', { className: 'readnote__btn', type: 'button', onClick: loadList, disabled: busy }, t.reload),
      )

      let body: unknown
      if (error !== null) {
        body = h('div', { className: 'readnote__error' }, error)
      } else if (doc !== null) {
        body = h(
          'div',
          { className: 'readnote__doc' },
          MarkdownText ? h(MarkdownText, { text: doc.content, streaming: false }) : h('pre', null, doc.content),
        )
      } else if (files !== null && files.length === 0) {
        body = h('div', { className: 'readnote__empty' }, t.empty)
      } else {
        body = h(
          'div',
          { className: 'readnote__list' },
          ...(files ?? []).map((entry) =>
            h(
              'button',
              { key: entry.path, className: 'readnote__item', type: 'button', onClick: () => openDoc(entry) },
              h('span', { className: 'readnote__item-name' }, entry.name),
              h('span', { className: 'readnote__item-meta' }, humanSize(entry.size)),
            ),
          ),
        )
      }

      return h('div', { className: 'readnote' }, bar, h('div', { className: 'readnote__body' }, body))
    }

    /**
     * Client 半边入口：把阅读视图注册成一个 conversation.view 页签。
     * @param ctx - client 根上下文，需提供 slots 服务。
     */
    function apply(ctx: {
      slots?: {
        inject: (name: string, setup: () => unknown) => void
        register: (options: Record<string, unknown>, component: unknown) => unknown
      }
    }): void {
      if (typeof document !== 'undefined') ensureStyles()
      if (typeof ctx?.slots?.inject !== 'function') return

      const t = copy()
      ctx.slots.inject('conversation.view', () =>
        ctx.slots?.register({ name: 'conversation.view', id: 'readnote', order: 20, label: t.label }, ReadnoteView),
      )
      console.log('[readnote] conversation.view tab registered')
    }

    exports.name = 'dsh-readnote'
    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
