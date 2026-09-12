/**
 * client 半边用到的类型。
 * @module dsh-readnote/client/types
 */

/** 工作区内一层目录里的一个条目。 */
export interface DirEntry {
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
export interface NoteAnchor {
  quote: string
  prefix: string
  suffix: string
}

/** 一条批注。 */
export interface Note {
  id: string
  anchor: NoteAnchor
  text: string
  createdAt: number
}

/** 待落笔的选区。 */
export interface Pending {
  anchor: NoteAnchor
  x: number
  y: number
}

/** 「上次读到哪儿」。 */
export interface LastState {
  doc: string
  dir: string
}

/** 最近打开的一条。 */
export interface RecentEntry {
  /** 相对工作区的文档路径。 */
  doc: string
  /** 打开它时所在的目录 —— 从列表点进去后能回到原来的位置。 */
  dir: string
  /** 打开时间（毫秒）。 */
  at: number
}

/** 对话栏里的一条消息。 */
export interface ChatMessage {
  role: string
  text: string
}

/** 当前打开的文档。 */
export interface OpenDoc {
  name: string
  content: string
  size: number
}

/** 文档里所有文本节点串成的一条「全局文本」，外加每个节点的起点偏移。 */
export interface TextIndex {
  text: string
  nodes: Array<{ node: Text; start: number }>
}

/** 批注气泡相对文档容器的落点。 */
export interface BubbleBox {
  note: Note
  left: number
  top: number
  side: 'right' | 'left'
}

/** 界面文案表。 */
export interface Copy {
  label: string
  workspace: string
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
  copyCode: string
  copiedCode: string
  ask: string
  sentToChat: string
  pin: string
  recent: string
  chat: string
  chatEmpty: string
  you: string
  ai: string
  dragHint: string
}
