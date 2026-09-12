/**
 * 对话栏宽度：可拖拽、可复位、记得住。
 *
 * 拖拽期间只在 `window` 上挂监听，**不依赖被拖元素继续收到事件** ——
 * 指针滑出那 5px 手柄是常态，靠元素自身的 mousemove 会「拖一半就断」。
 * @module dsh-readnote/client/hooks/useChatWidth
 */
import { useEffect, useRef, useState } from '../react.ts'
import { CHAT_WIDTH_DEFAULT, CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, LS_CHAT_WIDTH } from '../constants.ts'
import { lsGet, lsSet } from '../storage.ts'

/** 拖拽所需的最小事件形状（React 合成事件与原生 PointerEvent 都满足）。 */
export interface PointerLike {
  clientX: number
  preventDefault: () => void
}

/** `useChatWidth` 的返回值。 */
export interface ChatWidthApi {
  /** 当前宽度（像素）。 */
  width: number
  /** 是否正在拖拽 —— 用来给手柄加高亮。 */
  dragging: boolean
  /** 手柄的 pointerdown 处理。 */
  onHandleDown: (event: PointerLike) => void
  /** 复位成默认宽度（双击手柄）。 */
  reset: () => void
}

/**
 * 夹到合法区间。
 * @param value - 任意宽度。
 * @returns 夹紧后的整数宽度。
 */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return CHAT_WIDTH_DEFAULT
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, Math.round(value)))
}

/**
 * 管理右侧对话栏的宽度。
 * @returns 宽度、拖拽状态与事件处理。
 */
export function useChatWidth(): ChatWidthApi {
  const [width, setWidth] = useState(() => clamp(lsGet<number>(LS_CHAT_WIDTH, CHAT_WIDTH_DEFAULT)))
  const [dragging, setDragging] = useState(false)
  /** 按下时的指针位置与当时的宽度 —— 用增量算，避免累计误差。 */
  const origin = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    if (!dragging) return undefined
    const move = (event: PointerEvent): void => {
      const start = origin.current
      if (start === null) return
      // 对话栏在右边：指针向左移 = 栏变宽。
      setWidth(clamp(start.w + (start.x - event.clientX)))
    }
    const stop = (): void => {
      origin.current = null
      setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging])

  // 落盘放在 effect 里：拖拽中每帧都写一次也无所谓（localStorage 写是同步的但极小），
  // 好处是「关掉浏览器时停在哪个宽度」一定被记住。
  useEffect(() => {
    lsSet(LS_CHAT_WIDTH, width)
  }, [width])

  return {
    width,
    dragging,
    onHandleDown: (event: PointerLike) => {
      origin.current = { x: event.clientX, w: width }
      setDragging(true)
      event.preventDefault()
    },
    reset: () => setWidth(CHAT_WIDTH_DEFAULT),
  }
}
