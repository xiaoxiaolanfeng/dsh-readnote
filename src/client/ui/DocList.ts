/**
 * 文件列表：最近打开 + 面包屑 + 当前目录条目。
 * @module dsh-readnote/client/ui/DocList
 */
import { h } from '../react.ts'
import { humanSize } from './TopBar.ts'
import type { Copy, DirEntry, RecentEntry } from '../types.ts'

/** 组件的 props。 */
export interface DocListProps {
  /** 文案表。 */
  t: Copy
  /** 当前目录（相对工作区），空串表示根。 */
  cwd: string
  /** 当前目录的条目；null 表示还没加载出来。 */
  entries: DirEntry[] | null
  /** 最近打开列表。 */
  recent: RecentEntry[]
  /** 切目录。 */
  onLoadDir: (dir: string) => void
  /** 打开一个目录条目。 */
  onOpenEntry: (entry: DirEntry) => void
  /** 从最近列表打开。 */
  onOpenRecent: (item: RecentEntry) => void
}

/**
 * 文件列表视图。
 * @param props - 见 {@link DocListProps}。
 * @returns 列表元素。
 */
export function DocList(props: DocListProps): unknown {
  const { t, cwd, entries, recent } = props
  const crumbs = cwd.length > 0 ? cwd.split('/') : []
  const list = entries ?? []

  return h(
    'div',
    { className: 'readnote__list' },
    // 最近打开在每个目录都显示 —— 「返回列表」回到的是文档所在目录，
    // 只在根显示的话用户永远看不到它（踩过）。
    recent.length > 0
      ? h(
          'div',
          { className: 'readnote__recent' },
          h('p', { className: 'readnote__section' }, t.recent),
          ...recent.map((item) =>
            h(
              'button',
              {
                key: `recent-${item.doc}`,
                className: 'readnote__item',
                type: 'button',
                onClick: () => props.onOpenRecent(item),
              },
              h('span', { className: 'readnote__item-icon' }, '🕘'),
              h('span', { className: 'readnote__item-name' }, item.doc),
            ),
          ),
        )
      : null,
    h(
      'div',
      { className: 'readnote__crumbs' },
      h('button', { className: 'readnote__crumb', type: 'button', onClick: () => props.onLoadDir('') }, `🏠 ${t.workspace}`),
      ...crumbs.map((segment, index) =>
        h(
          'span',
          { key: `${segment}-${index}`, className: 'readnote__crumb-sep' },
          '/',
          h(
            'button',
            {
              className: 'readnote__crumb',
              type: 'button',
              onClick: () => props.onLoadDir(crumbs.slice(0, index + 1).join('/')),
            },
            segment,
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
          onClick: () => (entry.type === 'dir' ? props.onLoadDir(entry.path) : props.onOpenEntry(entry)),
        },
        h('span', { className: 'readnote__item-icon' }, entry.type === 'dir' ? '📁' : entry.readable ? '📄' : '·'),
        h('span', { className: 'readnote__item-name' }, entry.name),
        h('span', { className: 'readnote__item-meta' }, entry.type === 'dir' ? '' : humanSize(entry.size)),
      ),
    ),
  )
}
