/**
 * dsh-readnote · client half。
 *
 * 三条机制并存：
 *   1. 挂载 —— dsh 社区主流的 ModuleLoader 手写包装（零额外构建步骤）。
 *   2. 视图 —— 注册进 conversation.view 槽，与「对话 / 轨迹」并列的原生页签。
 *   3. 渲染 —— 复用 dsh 自己的 MarkdownText（baseline external），风格天然一致。
 *
 * 硬约束（见 BUILDING.md 第三节）：
 *   - id 必须与 package.json 的 "name" 完全一致。
 *   - 本文件不能出现 import / export 语句（被 shell 当普通脚本加载）。
 *   - React / ui-slots / ui-primitives 都是 baseline external，不需要声明。
 */

interface ModuleLoaderDef {
  id: string
  factory: (require: (specifier: string) => unknown) => unknown
}

const STYLE_ID = 'readnote-style'
const LIST_PATH = '/__readnote/list'
const READ_PATH = '/__readnote/read'
const NOTES_READ_PATH = '/__readnote/notes'
const NOTES_SAVE_PATH = '/__readnote/notes/save'
const ASK_PATH = '/__readnote/ask'
const HIGHLIGHT_NAME = 'readnote-notes'

/**
 * 版本标记：每次改 client 就递增。
 * 用途是排查「改了代码但行为没变」—— 先确认浏览器到底加载了哪一版。
 */
const BUILD_TAG = 'r15'

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
.readnote__main { flex: 1; min-height: 0; display: flex; }
.readnote__body { flex: 1; min-height: 0; overflow: auto; }
.readnote__doc { position: relative; max-width: 74ch; margin: 0 auto; padding: 28px 32px 80px; }
.readnote__list { max-width: 74ch; margin: 0 auto; padding: 14px 24px 60px; }
.readnote__hint { margin: 0 0 14px; font-size: 13px; opacity: .6; }
.readnote__crumbs {
  display: flex; align-items: center; flex-wrap: wrap; gap: 2px;
  margin: 4px 0 12px; font-size: 12px;
}
.readnote__crumb {
  border: none; background: transparent; color: inherit;
  font-family: inherit; font-size: 12px; cursor: pointer;
  padding: 2px 6px; border-radius: 6px; opacity: .75;
}
.readnote__crumb:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1; }
.readnote__crumb-sep { opacity: .3; display: inline-flex; align-items: center; }
.readnote__item {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 8px;
  background: transparent; color: inherit; font-family: inherit;
  font-size: 13px; text-align: left; cursor: pointer;
}
.readnote__item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.07)); }
.readnote__item[disabled] { opacity: .32; cursor: default; }
.readnote__item[disabled]:hover { background: transparent; }
.readnote__item-icon { flex: none; width: 16px; opacity: .8; font-size: 12px; }
.readnote__item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.readnote__item-meta { flex: none; font-size: 11px; opacity: .45; }
.readnote__empty, .readnote__error {
  padding: 34px 4px; max-width: 74ch; margin: 0 auto;
  font-size: 13px; line-height: 1.8; opacity: .7; white-space: pre-wrap;
}
.readnote__error { color: var(--dsw-alias-label-error, #ff6b6b); opacity: .95; }

/* 划词工具条 */
.readnote-sel {
  position: fixed; z-index: 1300;
  display: flex; flex-direction: column; gap: 8px;
  width: 300px; padding: 10px;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.14));
  border-radius: 12px;
  background: var(--dsw-specific-menu, #2c2c2e);
  color: var(--dsw-alias-label-primary, #f5f5f7);
  font-family: var(--dsw-font-family, system-ui);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 28px rgba(0,0,0,.35));
}
.readnote-sel__quote {
  margin: 0; max-height: 60px; overflow: hidden;
  font-size: 12px; line-height: 1.6; opacity: .6;
  border-left: 2px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.2));
  padding-left: 8px;
}
.readnote-sel__row { display: flex; align-items: center; gap: 6px; }
.readnote-sel__spacer { flex: 1; }
.readnote-sel__ta {
  width: 100%; min-height: 62px; resize: vertical; box-sizing: border-box;
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.16));
  background: var(--dsw-alias-bg-base, #1c1c1e);
  color: inherit; font-family: inherit; font-size: 13px; line-height: 1.6;
}
.readnote-sel__ta:focus { outline: none; border-color: var(--dsw-alias-button-primary-fill, #4c8dff); }
.readnote-sel__go {
  height: 28px; padding: 0 14px; border: none; border-radius: 14px;
  background: var(--dsw-alias-button-primary-fill, #4c8dff);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font-family: inherit; font-size: 12px; cursor: pointer;
}
.readnote-sel__cancel {
  height: 28px; padding: 0 10px; border: none; border-radius: 14px;
  background: transparent; color: inherit; opacity: .7;
  font-family: inherit; font-size: 12px; cursor: pointer;
}
.readnote-sel__cancel:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1; }
.readnote-sel__ask {
  height: 28px; padding: 0 14px; border: none; border-radius: 14px;
  background: transparent; color: inherit;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.2));
  font-family: inherit; font-size: 12px; cursor: pointer; opacity: .9;
}
.readnote-sel__ask:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1; }
.readnote__notice { color: var(--dsw-alias-label-success, #5fd08a); opacity: .95; }

/* 批注列表 */
/* 批注气泡：挂在高亮文字的旁边，左/右择空 */
.readnote-bubble {
  position: absolute; z-index: 5;
  display: flex; align-items: flex-start; gap: 3px;
  max-width: 230px; padding: 6px 6px 6px 9px;
  border: 1px solid rgba(255, 214, 102, .38);
  border-radius: 9px;
  background: rgba(255, 214, 102, .13);
  color: var(--dsw-alias-label-primary, #f5f5f7);
  font-family: var(--dsw-font-family, system-ui);
  font-size: 12px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
}
.readnote-bubble__text { flex: 1; min-width: 0; }
.readnote-bubble__empty { opacity: .5; }
.readnote-bubble__del {
  flex: none; border: none; background: transparent; color: inherit;
  opacity: .4; cursor: pointer; font-size: 11px; line-height: 1; padding: 0 2px;
}
.readnote-bubble__del:hover { opacity: .95; }
.readnote__notes-title { margin: 0 0 8px; font-size: 11px; letter-spacing: .04em; opacity: .45; }
.readnote__note {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 7px 8px; border-radius: 8px; font-size: 12px; line-height: 1.6;
}
.readnote__note:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06)); }
.readnote__note-quote { opacity: .5; }
.readnote__note-text { flex: 1; }
.readnote__note-del {
  flex: none; border: none; background: transparent; color: inherit;
  opacity: .35; cursor: pointer; font-size: 12px; padding: 0 4px;
}
.readnote__note-del:hover { opacity: .9; }

/* 原文高亮（CSS Custom Highlight API，不改动 React 渲染的 DOM） */
::highlight(${HIGHLIGHT_NAME}) {
  background-color: rgba(255, 214, 102, .28);
  text-decoration: underline;
  text-decoration-color: rgba(255, 214, 102, .7);
}
`

/** 工作区内一层目录里的一个条目。 */
interface DirEntry {
  path: string
  name: string
  type: 'dir' | 'file'
  size: number
  mtime: number
  readable: boolean
}

/**
 * 批注锚点：用「选中的文本 + 前后缀」定位，而不是脆弱的字符偏移量。
 * 这是 W3C Web Annotation 的 TextQuoteSelector 思路 —— 文档重新渲染后依然能找回来。
 */
interface NoteAnchor {
  quote: string
  prefix: string
  suffix: string
}

/** 一条批注。 */
interface Note {
  id: string
  anchor: NoteAnchor
  text: string
  createdAt: number
}

/** 待落笔的选区。 */
interface Pending {
  anchor: NoteAnchor
  x: number
  y: number
}

/** 锚点前后各取多少字做校验。 */
const CONTEXT_CHARS = 32

/**
 * 单次渲染的字符上限。
 * 超过就只渲染前一段并提示 —— 超长文档会把主线程堵死（实测踩过：某些文件点开就卡死）。
 */
const MAX_RENDER_CHARS = 120_000

interface Copy {
  label: string
  workspace: string
  copyCode: string
  copiedCode: string
  pick: string
  back: string
  reload: string
  empty: string
  loading: string
  save: string
  cancel: string
  placeholder: string
  notes: string
  remove: string
  markOnly: string
  ask: string
  sentToChat: string
}

/**
 * 跟随浏览器语言取文案（dsh 的产品文案是双语的）。
 * @returns 当前语言的文案表。
 */
function copy(): Copy {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  return zh
    ? {
        label: '阅读', workspace: '工作区', pick: '挑一份 markdown 开始读', back: '← 返回列表',
        copyCode: '复制', copiedCode: '已复制',
        reload: '刷新', empty: '这个目录里没有可读的文件', loading: '加载中…',
        save: '保存', cancel: '取消', placeholder: '写点什么…（可留空，仅做标记）',
        notes: '批注', remove: '删除', markOnly: '仅标记（无文字）',
        ask: '问 AI', sentToChat: '已发进对话 —— 切到「对话」页签看回答',
      }
    : {
        label: 'Read', workspace: 'Workspace', pick: 'Pick a markdown file to read', back: '← Back to list',
        copyCode: 'Copy', copiedCode: 'Copied',
        reload: 'Reload', empty: 'Nothing readable in this folder', loading: 'Loading…',
        save: 'Save', cancel: 'Cancel', placeholder: 'Write something… (empty = just mark it)',
        notes: 'Notes', remove: 'Remove', markOnly: 'Marker only',
        ask: 'Ask AI', sentToChat: 'Sent into the chat — switch to the Chat tab for the answer',
      }
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

/**
 * 从当前选区构造锚点。
 * @param range - 选区对应的 Range。
 * @returns 锚点；选区跨节点时退化成纯 quote。
 */
function buildAnchor(range: Range): NoteAnchor {
  const quote = range.toString()
  const node = range.startContainer
  const full = node.textContent ?? ''
  const start = range.startOffset
  const end = range.endOffset
  const sameNode = range.startContainer === range.endContainer
  return {
    quote,
    prefix: sameNode ? full.slice(Math.max(0, start - CONTEXT_CHARS), start) : '',
    suffix: sameNode ? full.slice(end, end + CONTEXT_CHARS) : '',
  }
}

/**
 * 在已渲染的文档里把锚点找回来。
 * 优先「前后缀都对上」的那一处；找不到则退化为第一处纯文本匹配。
 * @param root - 文档容器。
 * @param anchor - 批注锚点。
 * @returns 命中的 Range，找不到返回 null。
 */
function locateRange(root: HTMLElement, anchor: NoteAnchor): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let fallback: Range | null = null
  let node = walker.nextNode() as Text | null
  while (node !== null) {
    const text = node.data
    let index = text.indexOf(anchor.quote)
    while (index !== -1) {
      const before = text.slice(Math.max(0, index - anchor.prefix.length), index)
      const after = text.slice(index + anchor.quote.length, index + anchor.quote.length + anchor.suffix.length)
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + anchor.quote.length)
      if (before.endsWith(anchor.prefix) && after.startsWith(anchor.suffix)) return range
      if (fallback === null) fallback = range
      index = text.indexOf(anchor.quote, index + 1)
    }
    node = walker.nextNode() as Text | null
  }
  return fallback
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

    const reactNs = require('react') as Record<string, unknown> | undefined
    const React = (reactNs?.default ?? reactNs) as any
    const useState = React.useState as <T>(initial: T) => [T, (next: T) => void]
    const useEffect = React.useEffect as (fn: () => void | (() => void), deps: unknown[]) => void
    const useRef = React.useRef as <T>(initial: T) => { current: T }
    const h = React.createElement as (type: unknown, props?: unknown, ...children: unknown[]) => unknown

    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const MarkdownText = pick<any>(primitives, 'MarkdownText')
    // 诊断：确认 shell 到底把什么共享给了插件（排查 MarkdownText 崩溃用，只打一次）。
    console.log('[readnote] primitives keys =', primitives ? Object.keys(primitives as object) : primitives)
    console.log('[readnote] MarkdownText =', typeof MarkdownText)
    console.log('[readnote] client build =', BUILD_TAG)

    /**
     * POST 一个 JSON 到 host 端点。
     * @param path - 端点路径。
     * @param payload - 请求体。
     * @returns 解析后的响应体。
     */
    async function post(path: string, payload: unknown): Promise<any> {
      console.log('[readnote] POST', path, JSON.stringify(payload))
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

    /**
     * 渲染错误边界。
     * MarkdownText 遇到它不支持的 markdown 结构时会抛错，React 会把整棵子树卸载 ——
     * 表现就是「点某个文件整个页签变白」。这里把它拦下来，显示文件名和错误原文。
     */
    class RenderBoundary extends (React.Component as any) {
      constructor(props: any) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error: unknown): { error: unknown } {
        return { error }
      }
      componentDidCatch(error: unknown, info: unknown): void {
        console.error('[readnote] markdown render failed', error, info)
      }
      render(): unknown {
        if (this.state.error !== null) {
          const err = this.state.error as { stack?: string }
          const stack = typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 8).join('\n') : '(no stack)'
          return h(
            'div',
            { className: 'readnote__error' },
            `渲染失败：${String(this.state.error)}\n\n文件：${this.props.fileName}\n\n${stack}`,
          )
        }
        return this.props.children
      }
    }

    /** 阅读视图：目录浏览 ⇄ 文档正文 + 划词批注。 */
    function ReadnoteView(props: { sessionId?: string }): unknown {
      const t = copy()
      const sessionId = props?.sessionId
      const loggedProps = useRef(false)
      if (!loggedProps.current) {
        loggedProps.current = true
        console.log('[readnote] slot props keys =', Object.keys(props ?? {}))
        console.log('[readnote] sessionId =', String(sessionId))
        // 探测输入接口：如果有「发消息」的动作，划词提问就能走正统路径而不是自造。
        const ia = (props as { inputActions?: Record<string, unknown> })?.inputActions
        console.log('[readnote] inputActions =', ia ? Object.keys(ia).join(',') : String(ia))
        const vi = (props as { viewRequest?: Record<string, unknown> })?.viewRequest
        console.log('[readnote] viewRequest =', vi ? Object.keys(vi).join(',') : String(vi))
      }

      const [cwd, setCwd] = useState('')
      const [entries, setEntries] = useState<DirEntry[] | null>(null)
      const [doc, setDoc] = useState<{ name: string; content: string; size: number } | null>(null)
      const [error, setError] = useState<string | null>(null)
      const [busy, setBusy] = useState(false)
      const [pending, setPending] = useState<Pending | null>(null)
      const [draft, setDraft] = useState('')
      const [notes, setNotes] = useState<Note[]>([])
      const [notice, setNotice] = useState('')

      const docRef = useRef<HTMLDivElement | null>(null)
      /** 每条批注气泡相对 .readnote__doc 的落点（向左时靠 translateX(-100%) 对齐）。 */
      const [boxes, setBoxes] = useState<Array<{ note: Note; left: number; top: number; side: 'right' | 'left' }>>([])

      const loadDir = (rel: string): void => {
        if (sessionId === undefined) {
          setError('no session id in slot props')
          return
        }
        setBusy(true)
        setError(null)
        void post(LIST_PATH, { sessionId, dir: rel })
          .then((data) => {
            if (data?.ok) {
              setCwd(data.dir ?? '')
              setEntries(data.entries ?? [])
            } else {
              setError(
                `list failed: ${data?.reason ?? data?.error ?? 'unknown'}\n` +
                  `receivedSessionId=${String(data?.receivedSessionId)} (${String(data?.receivedSessionIdType)})\n` +
                  `hasSessionsService=${String(data?.hasSessionsService)} hasSession=${String(data?.hasSession)}\n` +
                  `sessionKeys=${JSON.stringify(data?.sessionKeys ?? [])}`,
              )
            }
          })
          .catch((e: unknown) => setError(`list error: ${String(e)}`))
          .finally(() => setBusy(false))
      }

      const openDoc = (entry: DirEntry): void => {
        setBusy(true)
        setError(null)
        setPending(null)
        setNotes([])
        void post(READ_PATH, { sessionId, path: entry.path })
          .then(async (data) => {
            if (!data?.ok) {
              setError(`read failed: ${data?.error ?? data?.reason ?? 'unknown'}`)
              return
            }
            const name = data.name ?? entry.name
            setDoc({ name, content: data.content ?? '', size: data.size ?? entry.size })
            // 批注跟着文档走：打开时把这篇已有的批注一起取回来。
            try {
              const saved = await post(NOTES_READ_PATH, { sessionId, doc: name })
              if (saved?.ok && Array.isArray(saved.notes)) setNotes(saved.notes as Note[])
            } catch {
              // 批注取不到不影响阅读，静默降级成「这篇没有批注」。
            }
          })
          .catch((e: unknown) => setError(`read error: ${String(e)}`))
          .finally(() => setBusy(false))
      }

      useEffect(() => {
        loadDir('')
        // 只在会话切换时回到工作区根。
      }, [sessionId])

      /** 划词：选区落在文档正文里就浮出工具条。 */
      const handleSelection = (): void => {
        const root = docRef.current
        if (root === null) return
        const sel = window.getSelection()
        if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
          setPending(null)
          return
        }
        if (sel.toString().trim().length === 0) {
          setPending(null)
          return
        }
        const range = sel.getRangeAt(0)
        if (!root.contains(range.commonAncestorContainer)) return
        const rect = range.getBoundingClientRect()
        setDraft('')
        setPending({ anchor: buildAnchor(range), x: rect.left, y: rect.bottom + 8 })
      }

      /** 把批注锚点画到原文上（CSS Custom Highlight API）。 */
      useEffect(() => {
        const root = docRef.current
        const HighlightCtor = (window as any).Highlight
        const registry = (CSS as any).highlights
        if (root === null || HighlightCtor === undefined || registry === undefined) return
        const group = new HighlightCtor()
        for (const note of notes) {
          const range = locateRange(root, note.anchor)
          if (range !== null) group.add(range)
        }
        registry.set(HIGHLIGHT_NAME, group)
        return () => registry.delete(HIGHLIGHT_NAME)
      }, [notes, doc])

      /**
       * 把每条批注摆到它高亮文字的旁边。
       * 坐标相对 .readnote__doc（它是 position: relative 的定位上下文），
       * 所以父级滚动时气泡自然跟随，不必监听 scroll。
       */
      useEffect(() => {
        const docEl = docRef.current
        if (docEl === null || notes.length === 0) {
          setBoxes([])
          return
        }
        const docRect = docEl.getBoundingClientRect()
        const next: Array<{ note: Note; left: number; top: number; side: 'right' | 'left' }> = []
        for (const note of notes) {
          const range = locateRange(docEl, note.anchor)
          if (range === null) continue
          const rects = Array.from(range.getClientRects())
          if (rects.length === 0) continue
          const first = rects[0]
          // 右侧放得下就挂右边，否则挂左边。
          const spaceRight = docEl.clientWidth - (first.right - docRect.left)
          const side: 'right' | 'left' = spaceRight > 250 ? 'right' : 'left'
          next.push({
            note,
            top: first.top - docRect.top,
            left: side === 'right' ? first.right - docRect.left + 10 : first.left - docRect.left - 10,
            side,
          })
        }
        setBoxes(next)
      }, [notes, doc])

      /**
       * 把批注写回工作区。
       * 失败只记日志、不回滚本地状态 —— 让用户继续写，比为了强一致把界面弹回去友好。
       * @param next - 该文档的完整批注数组。
       * @param docName - 文档相对工作区的路径（批注库的键）。
       */
      const persistNotes = (next: Note[], docName: string): void => {
        void post(NOTES_SAVE_PATH, { sessionId, doc: docName, notes: next })
          .then((data) => {
            if (!data?.ok) console.warn('[readnote] save notes failed', data)
          })
          .catch((e: unknown) => console.warn('[readnote] save notes error', e))
      }

      const saveNote = (): void => {
        if (pending === null || doc === null) return
        const note: Note = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          anchor: pending.anchor,
          text: draft.trim(),
          createdAt: Date.now(),
        }
        const next = [...notes, note]
        setNotes(next)
        persistNotes(next, doc.name)
        setPending(null)
        setDraft('')
        window.getSelection()?.removeAllRanges()
      }

      /**
       * 把「当前选区 + 输入框里的问题」发进会话。
       * 走会话而不是自己调模型，是为了让回答落在会话日志里 —— 「钉回原文」的前提。
       */
      const askAi = (): void => {
        if (pending === null || doc === null || sessionId === undefined) return
        const question = draft.trim()
        if (question.length === 0) return
        setBusy(true)
        setError(null)
        setNotice('')
        void post(ASK_PATH, { sessionId, doc: doc.name, quote: pending.anchor.quote, question })
          .then((data) => {
            if (data?.ok) {
              setNotice(t.sentToChat)
              setPending(null)
              setDraft('')
              window.getSelection()?.removeAllRanges()
            } else {
              setError(`ask failed: ${data?.reason ?? data?.error ?? 'unknown'}\n${data?.message ?? ''}`)
              setPending(null)
            }
          })
          .catch((e: unknown) => setError(`ask error: ${String(e)}`))
          .finally(() => setBusy(false))
      }

      const backToDir = (): void => {
        setDoc(null)
        setNotes([])
        setPending(null)
        setNotice('')
      }

      const bar = h(
        'div',
        { className: 'readnote__bar' },
        h('span', { className: 'readnote__name' }, doc ? doc.name : t.pick),
        doc ? h('span', { className: 'readnote__meta' }, humanSize(doc.size)) : null,
        h('span', { className: 'readnote__spacer' }),
        notice.length > 0 ? h('span', { className: 'readnote__notice' }, notice) : null,
        doc !== null && notes.length > 0 ? h('span', { className: 'readnote__meta' }, `${t.notes} ${notes.length}`) : null,
        h('span', { className: 'readnote__meta', title: 'client build tag' }, BUILD_TAG),
        busy ? h('span', { className: 'readnote__meta' }, t.loading) : null,
        doc
          ? h('button', { className: 'readnote__btn', type: 'button', onClick: backToDir }, t.back)
          : h('button', { className: 'readnote__btn', type: 'button', onClick: () => loadDir(cwd), disabled: busy }, t.reload),
      )

      let body: unknown
      if (error !== null) {
        body = h('div', { className: 'readnote__error' }, error)
      } else if (doc !== null) {
        const over = doc.content.length > MAX_RENDER_CHARS
        const text = over ? doc.content.slice(0, MAX_RENDER_CHARS) : doc.content
        body = h(
          'div',
          { className: 'readnote__doc', ref: docRef, onMouseUp: handleSelection },
          over
            ? h(
                'p',
                { className: 'readnote__hint' },
                `文档过长（${doc.content.length.toLocaleString()} 字符），只渲染了前 ${MAX_RENDER_CHARS.toLocaleString()} 字符`,
              )
            : null,
          h(
            RenderBoundary,
            { fileName: doc.name },
            // 必须传 labels.code：shell 里的 MarkdownText 直接读 i.labels.code.copyLabel，
            // 没有可选链保护，缺了就是 "Cannot read properties of undefined (reading 'code')"。
            // 注意这与源码 clone 里的 codeLabels?（扁平 + 可选链）不是一回事 —— 版本差异见 BUILDING.md 4.7。
            MarkdownText
              ? h(MarkdownText, {
                  text,
                  streaming: false,
                  labels: { code: { copyLabel: t.copyCode, copiedLabel: t.copiedCode } },
                })
              : h('pre', null, text),
          ),
          // 批注气泡层：绝对定位在 .readnote__doc 内，直接挂在高亮文字旁边。
          ...boxes.map(({ note, left, top, side }) =>
            h(
              'div',
              {
                key: note.id,
                className: 'readnote-bubble',
                style: {
                  left: `${left}px`,
                  top: `${top}px`,
                  transform: side === 'left' ? 'translateX(-100%)' : undefined,
                },
              },
              h(
                'div',
                {
                  className:
                    note.text.length === 0 ? 'readnote-bubble__text readnote-bubble__empty' : 'readnote-bubble__text',
                },
                note.text.length > 0 ? note.text : t.markOnly,
              ),
              h(
                'button',
                {
                  className: 'readnote-bubble__del',
                  type: 'button',
                  title: t.remove,
                  onClick: () => {
                    const next = notes.filter((n) => n.id !== note.id)
                    setNotes(next)
                    if (doc !== null) persistNotes(next, doc.name)
                  },
                },
                '✕',
              ),
            ),
          ),
        )
      } else {
        const crumbs = cwd.length > 0 ? cwd.split('/') : []
        const list = entries ?? []
        body = h(
          'div',
          { className: 'readnote__list' },
          h(
            'div',
            { className: 'readnote__crumbs' },
            h('button', { className: 'readnote__crumb', type: 'button', onClick: () => loadDir('') }, `🏠 ${t.workspace}`),
            ...crumbs.map((seg, i) =>
              h(
                'span',
                { key: `${seg}-${i}`, className: 'readnote__crumb-sep' },
                '/',
                h(
                  'button',
                  { className: 'readnote__crumb', type: 'button', onClick: () => loadDir(crumbs.slice(0, i + 1).join('/')) },
                  seg,
                ),
              ),
            ),
          ),
          entries !== null && list.length === 0 ? h('div', { className: 'readnote__empty' }, t.empty) : null,
          ...list.map((entry) =>
            h(
              'button',
              {
                key: entry.path,
                className: 'readnote__item',
                type: 'button',
                disabled: entry.type === 'file' && !entry.readable,
                onClick: () => (entry.type === 'dir' ? loadDir(entry.path) : openDoc(entry)),
              },
              h('span', { className: 'readnote__item-icon' }, entry.type === 'dir' ? '📁' : entry.readable ? '📄' : '·'),
              h('span', { className: 'readnote__item-name' }, entry.name),
              h('span', { className: 'readnote__item-meta' }, entry.type === 'dir' ? '' : humanSize(entry.size)),
            ),
          ),
        )
      }

      const selBar =
        pending === null
          ? null
          : h(
              'div',
              {
                className: 'readnote-sel',
                style: {
                  // 两个方向都夹进视口：选区靠底/靠右时，浮层不能跑到屏幕外。
                  left: `${Math.max(12, Math.min(pending.x, window.innerWidth - 320))}px`,
                  top: `${Math.max(12, Math.min(pending.y, window.innerHeight - 240))}px`,
                },
              },
              h('p', { className: 'readnote-sel__quote' }, pending.anchor.quote.slice(0, 120)),
              h('textarea', {
                className: 'readnote-sel__ta',
                placeholder: t.placeholder,
                value: draft,
                autoFocus: true,
                onChange: (e: any) => setDraft(e.target.value),
              }),
              h(
                'div',
                { className: 'readnote-sel__row' },
                h('span', { className: 'readnote-sel__spacer' }),
                h('button', { className: 'readnote-sel__cancel', type: 'button', onClick: () => setPending(null) }, t.cancel),
                h('button', { className: 'readnote-sel__go', type: 'button', onClick: saveNote }, t.save),
                h('button', { className: 'readnote-sel__ask', type: 'button', onClick: askAi }, t.ask),
              ),
            )

      return h('div', { className: 'readnote' }, bar, h('div', { className: 'readnote__body' }, body), selBar)
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
