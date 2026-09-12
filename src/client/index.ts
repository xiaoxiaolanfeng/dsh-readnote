/**
 * client 半边入口：把「阅读」注册成会话里的一个页签。
 *
 * 这个文件是**唯一**接触宿主 `ctx` 的地方 —— 往里都只是普通 React 组件和 hooks。
 * 它只做三件事：注入样式、注册 slot、把 `App` 挂上去。
 * @module dsh-readnote/client
 */
import { BUILD_TAG } from './constants.ts'
import { copy } from './copy.ts'
import { ensureStyles } from './styles.ts'
import { App } from './ui/App.ts'

/** 必须与 package.json 的 name 一致；client-modules 用它认领 bundle。 */
export const name = 'dsh-readnote'

/** 依赖的 client 服务。 */
export const inject = ['slots']

/** slot 服务的最小形状。 */
interface SlotsService {
  inject: (name: string, setup: () => unknown) => void
  register: (options: Record<string, unknown>, component: unknown) => unknown
}

/** client 根上下文（只用到 slots）。 */
interface ClientContext {
  slots?: SlotsService
}

/**
 * 注册阅读页签。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientContext): void {
  if (typeof document !== 'undefined') ensureStyles()
  if (typeof ctx?.slots?.inject !== 'function') {
    console.warn('[readnote] slots 服务不可用，阅读页签未注册')
    return
  }

  const t = copy()
  // order 20：排在官方 Chat(0) 与 Trajectory(10) 之后。
  ctx.slots.inject('conversation.view', () =>
    ctx.slots?.register({ name: 'conversation.view', id: 'readnote', order: 20, label: t.label }, App),
  )
  console.log(`[readnote] conversation.view tab registered (${BUILD_TAG})`)
}
