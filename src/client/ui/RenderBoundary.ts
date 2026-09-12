/**
 * 渲染错误边界。
 *
 * `MarkdownText` 遇到它不支持的 markdown 结构时会抛错，React 会把整棵子树卸载 ——
 * 表现就是「点某个文件整个页签变白」。这里把它拦下来，显示文件名和调用栈。
 * @module dsh-readnote/client/ui/RenderBoundary
 */
import { Component, h } from '../react.ts'
import type { ReactNode } from '../react.ts'

/** 组件的 props。 */
export interface RenderBoundaryProps {
  /** 出错时显示的文件名。 */
  fileName: string
  children?: ReactNode
}

/** 边界自身的 state。 */
interface RenderBoundaryState {
  error: unknown
}

/** 渲染错误边界。 */
export class RenderBoundary extends Component {
  constructor(props: RenderBoundaryProps) {
    super(props)
    this.state = { error: null } as RenderBoundaryState
  }

  static getDerivedStateFromError(error: unknown): RenderBoundaryState {
    return { error }
  }

  componentDidCatch(error: unknown, info: unknown): void {
    console.error('[readnote] markdown render failed', error, info)
  }

  render(): unknown {
    if ((this.state as RenderBoundaryState).error !== null) {
      const err = (this.state as RenderBoundaryState).error as { stack?: string }
      const stack = typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 8).join('\n') : '(no stack)'
      return h(
        'div',
        { className: 'readnote__error' },
        `渲染失败：${String((this.state as RenderBoundaryState).error)}\n\n文件：${this.props.fileName}\n\n${stack}`,
      )
    }
    return this.props.children
  }
}
