/**
 * 顶部信息栏：文件名、钉回答、批注数、构建标记、返回列表。
 * @module dsh-readnote/client/ui/TopBar
 */
import { h } from '../react.ts'
import { BUILD_TAG } from '../constants.ts'
import type { Copy } from '../types.ts'

/** 组件的 props。 */
export interface TopBarProps {
  /** 文案表。 */
  t: Copy
  /** 当前打开的文档；null 表示停在文件列表。 */
  docName: string | null
  /** 当前文档字节数。 */
  docSize: number
  /** 是否能钉回答（问过 AI 才有）。 */
  canPin: boolean
  /** 是否正在忙。 */
  busy: boolean
  /** 当前文档的批注条数。 */
  noteCount: number
  /** 提示文字（比如「已发进对话」）。 */
  notice: string
  onPin: () => void
  onBack: () => void
  onReload: () => void
}

/**
 * 人类可读的文件大小。
 * @param bytes - 字节数。
 * @returns 形如 `12 KB` 的字符串。
 */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 顶部信息栏。
 * @param props - 见 {@link TopBarProps}。
 * @returns 顶栏元素。
 */
export function TopBar(props: TopBarProps): unknown {
  const { t, docName, docSize, canPin, busy, noteCount, notice } = props
  return h(
    'div',
    { className: 'readnote__bar' },
    h('span', { className: 'readnote__name' }, docName ?? t.pick),
    docName !== null ? h('span', { className: 'readnote__meta' }, humanSize(docSize)) : null,
    // 「钉回答」放左侧：右缘被 dsh 的宽度拖拽手柄覆盖，放那儿点不到（实测，见 BUILDING.md 4.10）。
    docName !== null && canPin
      ? h('button', { className: 'readnote__btn', type: 'button', onClick: props.onPin, disabled: busy }, `✨ ${t.pin}`)
      : null,
    h('span', { className: 'readnote__spacer' }),
    notice.length > 0 ? h('span', { className: 'readnote__notice' }, notice) : null,
    docName !== null && noteCount > 0 ? h('span', { className: 'readnote__meta' }, `${t.notes} ${noteCount}`) : null,
    h('span', { className: 'readnote__meta', title: 'client build tag' }, BUILD_TAG),
    busy ? h('span', { className: 'readnote__meta' }, t.loading) : null,
    docName !== null
      ? h('button', { className: 'readnote__btn', type: 'button', onClick: props.onBack }, t.back)
      : h('button', { className: 'readnote__btn', type: 'button', onClick: props.onReload, disabled: busy }, t.reload),
  )
}
