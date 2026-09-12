/**
 * 阅读页签的根组件：把状态机、图层与各视图拼起来。
 *
 * 它**只做编排**：状态在 `useReader`，高亮/气泡在 `useNoteLayer`，消息在 `useSessionMessages`，
 * 宽度在 `useChatWidth`，每一块界面各有一个组件。想改哪一层就只动那一个文件。
 * @module dsh-readnote/client/ui/App
 */
import { h, useRef } from '../react.ts'
import { ChatPanel } from './ChatPanel.ts'
import { ChatResizer } from './ChatResizer.ts'
import { DocList } from './DocList.ts'
import { DocView } from './DocView.ts'
import { SelectionBar } from './SelectionBar.ts'
import { TopBar } from './TopBar.ts'
import { copy } from '../copy.ts'
import { logPlatform } from '../markdown.ts'
import { useChatWidth } from '../hooks/useChatWidth.ts'
import { useNoteLayer } from '../hooks/useNoteLayer.ts'
import { useReader } from '../hooks/useReader.ts'
import { useScrollportHeight } from '../hooks/useScrollportHeight.ts'
import { useSessionMessages } from '../hooks/useSessionMessages.ts'

/** slot 传给页签组件的 props（只用到 sessionId，其余仅用于诊断）。 */
export interface AppProps {
  sessionId?: string
}

/**
 * 打一次诊断日志：确认 shell 究竟往 slot 里塞了什么。
 *
 * 留着是因为「插件拿不到会话 id」这类问题，第一现场就是这几个字段；
 * 等真出问题再回来加日志，现场的 props 已经变了。
 * @param props - slot 传入的 props。
 */
function useSlotDiagnostics(props: AppProps): void {
  const done = useRef(false)
  if (!done.current) {
    done.current = true
    logPlatform()
    console.log('[readnote] slot props keys =', Object.keys(props ?? {}).join(','))
    console.log('[readnote] sessionId =', String(props?.sessionId))
    const extra = props as { inputActions?: unknown; viewRequest?: unknown }
    console.log('[readnote] inputActions =', extra.inputActions ? Object.keys(extra.inputActions as object).join(',') : 'n/a')
    console.log('[readnote] viewRequest =', extra.viewRequest ? Object.keys(extra.viewRequest as object).join(',') : 'n/a')
  }
}

/**
 * 阅读页签根组件。
 * @param props - 见 {@link AppProps}。
 * @returns 整个阅读界面。
 */
export function App(props: AppProps): unknown {
  const t = copy()
  useSlotDiagnostics(props)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const docRef = useRef<HTMLDivElement | null>(null)
  // 宿主不给确定高度（会话激活时 viewArea 是 flex: 1 0 auto），得自己量，
  // 否则正文和对话栏的 overflow 都不生效 —— 滚动条会长到整页上去。
  const viewportH = useScrollportHeight(rootRef)
  const reader = useReader(props?.sessionId, t)
  const boxes = useNoteLayer(docRef, reader.notes, reader.doc?.name ?? null)
  const open = reader.doc !== null
  // 对话栏只在读文档时出现：文件列表本来就是要挑一条，多一栏反而挤。
  // 轮询也跟着开关走 —— 没在读书就没必要一直敲宿主。
  const messages = useSessionMessages(props?.sessionId, open)
  const chat = useChatWidth()

  let body: unknown
  if (reader.error !== null) {
    body = h('div', { className: 'readnote__error' }, reader.error)
  } else if (reader.doc !== null) {
    body = h(DocView, {
      t,
      doc: reader.doc,
      boxes,
      docRef,
      onMouseUp: () => reader.handleSelection(docRef.current),
      onDeleteNote: reader.deleteNote,
    })
  } else {
    body = h(DocList, {
      t,
      cwd: reader.cwd,
      entries: reader.entries,
      recent: reader.recent,
      onLoadDir: reader.loadDir,
      onOpenEntry: reader.openEntry,
      onOpenRecent: reader.openRecent,
    })
  }

  return h(
    'div',
    {
      className: 'readnote',
      ref: rootRef,
      style: viewportH === null ? undefined : { height: `${viewportH}px` },
    },
    h(TopBar, {
      t,
      docName: reader.doc?.name ?? null,
      docSize: reader.doc?.size ?? 0,
      canPin: reader.canPin,
      busy: reader.busy,
      noteCount: reader.notes.length,
      notice: reader.notice,
      onPin: reader.pinAnswer,
      onBack: reader.backToDir,
      onReload: () => reader.loadDir(reader.cwd),
    }),
    h(
      'div',
      { className: 'readnote__main' },
      h('div', { className: 'readnote__body' }, body),
      // 对话栏只在读文档时出现：文件列表本来就是要挑一条，多一栏反而挤。
      open ? h(ChatResizer, { dragHint: t.dragHint, dragging: chat.dragging, onHandleDown: chat.onHandleDown, onReset: chat.reset }) : null,
      open ? h(ChatPanel, { t, messages, width: chat.width }) : null,
    ),
    h(SelectionBar, {
      t,
      pending: reader.pending,
      draft: reader.draft,
      onDraft: reader.setDraft,
      onSave: reader.saveNote,
      onAsk: reader.askAi,
      onCancel: reader.cancelPending,
    }),
  )
}
