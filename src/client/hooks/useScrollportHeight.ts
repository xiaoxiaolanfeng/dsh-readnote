/**
 * 量出宿主给阅读页签的可用高度。
 *
 * 为什么需要它：shell 在会话激活时会执行
 * `.root[data-phase='active'] .viewArea { flex: 1 0 auto; min-height: auto }` ——
 * 官方 Chat 视图是「内容有多高就多高，整段交给外层 `.scrollBody` 滚」的设计。
 * 也就是说宿主**不会**给视图一个确定高度，视图里的 `height: 100%` 会退化成 `auto`，
 * 于是内部所有 `overflow: auto` 都不生效（实测：对话栏 scrollHeight 等于 clientHeight，
 * 滚动条长在整页上）。
 *
 * 阅读器的形态和 Chat 不同：左侧正文和右侧对话栏各自滚，顶栏不动。
 * 所以这里量出最近的可滚动祖先的 clientHeight，交给根元素当固定高度用。
 * 找不到可滚动祖先时返回 null，调用方退回 `height: 100%`。
 * @module dsh-readnote/client/hooks/useScrollportHeight
 */
import { useEffect, useState } from '../react.ts'

/**
 * 向上找最近的可滚动祖先。
 * @param from - 起点元素。
 * @returns 可滚动祖先；没有则返回 null。
 */
function findScrollport(from: HTMLElement): HTMLElement | null {
  let node = from.parentElement
  while (node !== null) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

/**
 * 订阅最近可滚动祖先的高度。
 * @param ref - 挂在阅读器根元素上的 ref。
 * @returns 可用高度（像素）；还没量到或没有可滚动祖先时为 null。
 */
export function useScrollportHeight(ref: { current: HTMLElement | null }): number | null {
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return undefined
    const scroller = findScrollport(el)
    if (scroller === null) return undefined
    const measure = (): void => setHeight(scroller.clientHeight)
    measure()
    // 窗口缩放、侧栏开合、页签切换都会改这个高度，跟着它走。
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  return height
}
