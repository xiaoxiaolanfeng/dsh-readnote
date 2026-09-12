/**
 * 阅读器的状态机：目录浏览、打开文档、批注、提问、钉回答。
 *
 * 这里只有**数据与动作**，没有组件；高亮与气泡定位在 `useNoteLayer`，界面在 `ui/*`。
 * 分开的直接收益：这套流程能脱离渲染被读懂，也能单独测。
 * @module dsh-readnote/client/hooks/useReader
 */
import { useEffect, useRef, useState } from '../react.ts'
import { ask, lastAnswer, listDir, loadNotes, readDoc, saveNotes } from '../api.ts'
import { buildAnchor } from '../anchor.ts'
import { LS_LAST, LS_RECENT, MAX_RECENT } from '../constants.ts'
import { lsGet, lsSet } from '../storage.ts'
import type { Copy, DirEntry, LastState, Note, NoteAnchor, OpenDoc, Pending, RecentEntry } from '../types.ts'

/** `useReader` 的返回值。 */
export interface ReaderApi {
  /** 当前目录（相对工作区），空串表示根。 */
  cwd: string
  entries: DirEntry[] | null
  doc: OpenDoc | null
  error: string | null
  busy: boolean
  notes: Note[]
  pending: Pending | null
  draft: string
  notice: string
  recent: RecentEntry[]
  /** 能否「钉回答」：问过 AI 才有可钉的锚点。 */
  canPin: boolean
  setDraft: (value: string) => void
  loadDir: (dir: string) => void
  openEntry: (entry: DirEntry) => void
  openRecent: (item: RecentEntry) => void
  /** 鼠标抬起时判定划词；`root` 是正文容器。 */
  handleSelection: (root: HTMLElement | null) => void
  cancelPending: () => void
  saveNote: () => void
  askAi: () => void
  pinAnswer: () => void
  deleteNote: (id: string) => void
  backToDir: () => void
}

/**
 * 阅读器状态机。
 * @param sessionId - slot props 给的会话 id。
 * @param t - 文案表（提问成功后的提示语要用）。
 * @returns 状态与动作。
 */
export function useReader(sessionId: string | undefined, t: Pick<Copy, 'sentToChat'>): ReaderApi {
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const [recent, setRecent] = useState<RecentEntry[]>(() => lsGet<RecentEntry[]>(LS_RECENT, []))
  /** 最后一次提问用的锚点 —— 「钉」要把回答钉回**当时问的那段话**，而不是重新划一次。 */
  const [lastAsked, setLastAsked] = useState<NoteAnchor | null>(null)
  /** 当前文档名。异步回调里读它比读 state 变量可靠（闭包会过期）。 */
  const docNameRef = useRef<string | null>(null)

  const loadDir = (rel: string): void => {
    if (sessionId === undefined) {
      setError('no session id in slot props')
      return
    }
    setBusy(true)
    setError(null)
    void listDir(sessionId, rel)
      .then((data) => {
        if (data.ok) {
          setCwd(data.dir ?? '')
          setEntries(data.entries ?? [])
        } else {
          setError(`list failed: ${data.reason ?? data.error ?? 'unknown'}`)
        }
      })
      .catch((e: unknown) => setError(`list error: ${String(e)}`))
      .finally(() => setBusy(false))
  }

  /** 记住「上次读到哪儿」并进最近列表。 */
  const rememberDoc = (docPath: string, dir: string): void => {
    lsSet(LS_LAST, { doc: docPath, dir } as LastState)
    setRecent((prev) => {
      const next: RecentEntry[] = [
        { doc: docPath, dir, at: Date.now() },
        ...prev.filter((item) => item.doc !== docPath),
      ].slice(0, MAX_RECENT)
      lsSet(LS_RECENT, next)
      return next
    })
  }

  /** 按路径打开文档 —— 目录点击、最近列表、启动恢复都走这里。 */
  const openDocByPath = (docPath: string, fallbackName: string, dir: string): void => {
    if (sessionId === undefined) {
      setError('no session id in slot props')
      return
    }
    setBusy(true)
    setError(null)
    setPending(null)
    setNotes([])
    void readDoc(sessionId, docPath)
      .then(async (data) => {
        if (!data.ok) {
          setError(`read failed: ${data.error ?? data.reason ?? 'unknown'}`)
          return
        }
        const name = data.name ?? fallbackName
        docNameRef.current = name
        setDoc({ name, content: data.content ?? '', size: data.size ?? 0 })
        rememberDoc(name, dir)
        try {
          setNotes(await loadNotes(sessionId, name))
        } catch {
          // 批注取不到不影响阅读，静默降级成「这篇没有批注」。
        }
      })
      .catch((e: unknown) => setError(`read error: ${String(e)}`))
      .finally(() => setBusy(false))
  }

  useEffect(() => {
    // 恢复上次读到哪儿（用户要求：别每次都重新点）。一次 effect 内完成，
    // 免得「列目录」和「恢复文档」两个异步流程抢 cwd。
    const last = lsGet<LastState | null>(LS_LAST, null)
    const dir = last !== null && typeof last.dir === 'string' ? last.dir : ''
    loadDir(dir)
    if (last !== null && typeof last.doc === 'string' && last.doc.length > 0) {
      openDocByPath(last.doc, last.doc, dir)
    }
  }, [sessionId])

  /** 划词：选区落在文档正文里就浮出工具条。 */
  const handleSelection = (root: HTMLElement | null): void => {
    if (root === null) return
    const sel = window.getSelection()
    if (sel === null || sel.isCollapsed || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
      setPending(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    const rect = range.getBoundingClientRect()
    setDraft('')
    setPending({ anchor: buildAnchor(range), x: rect.left, y: rect.bottom + 8 })
  }

  const cancelPending = (): void => setPending(null)

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
    if (sessionId !== undefined) void saveNotes(sessionId, doc.name, next)
    setPending(null)
    setDraft('')
    window.getSelection()?.removeAllRanges()
  }

  const deleteNote = (id: string): void => {
    const name = docNameRef.current
    const next = notes.filter((note) => note.id !== id)
    setNotes(next)
    if (sessionId !== undefined && name !== null) void saveNotes(sessionId, name, next)
  }

  /**
   * 把「当前选区 + 输入框里的问题」发进会话。
   * 走会话而不是自己调模型，是为了让回答落在会话日志里 —— 「钉回原文」的前提。
   */
  const askAi = (): void => {
    if (pending === null || doc === null || sessionId === undefined) return
    const question = draft.trim()
    if (question.length === 0) return
    const anchor = pending.anchor
    setBusy(true)
    setError(null)
    setNotice('')
    void ask(sessionId, doc.name, anchor.quote, question)
      .then((data) => {
        if (data.ok) {
          setNotice(t.sentToChat)
          setLastAsked(anchor)
          setPending(null)
          setDraft('')
          window.getSelection()?.removeAllRanges()
        } else {
          setError(`ask failed: ${data.reason ?? data.error ?? 'unknown'}\n${data.message ?? ''}`)
          setPending(null)
        }
      })
      .catch((e: unknown) => setError(`ask error: ${String(e)}`))
      .finally(() => setBusy(false))
  }

  /**
   * 把会话里最后一条助手回答取回来，填进编辑框交给用户改。
   * 「先看能改」是设计里的硬约束 —— 这里只取原料，落不落成笔记由用户点保存决定。
   */
  const pinAnswer = (): void => {
    if (lastAsked === null || sessionId === undefined) return
    setBusy(true)
    setError(null)
    setNotice('')
    void lastAnswer(sessionId)
      .then((data) => {
        if (data.ok && typeof data.text === 'string') {
          setDraft(data.text.slice(0, 2000))
          setPending({ anchor: lastAsked, x: Math.round(window.innerWidth / 2) - 150, y: 140 })
        } else {
          setNotice(data.message ?? '没找到助手回答')
        }
      })
      .catch((e: unknown) => setError(`pin error: ${String(e)}`))
      .finally(() => setBusy(false))
  }

  const backToDir = (): void => {
    docNameRef.current = null
    setDoc(null)
    setNotes([])
    setPending(null)
    setNotice('')
    setLastAsked(null)
  }

  return {
    cwd,
    entries,
    doc,
    error,
    busy,
    notes,
    pending,
    draft,
    notice,
    recent,
    canPin: lastAsked !== null,
    setDraft,
    loadDir,
    openEntry: (entry: DirEntry) => openDocByPath(entry.path, entry.name, cwd),
    openRecent: (item: RecentEntry) => openDocByPath(item.doc, item.doc, item.dir),
    handleSelection,
    cancelPending,
    saveNote,
    askAi,
    pinAnswer,
    deleteNote,
    backToDir,
  }
}
