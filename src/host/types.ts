/**
 * host 半边的类型。
 * @module dsh-readnote/host/types
 */

/** 一层目录里的一个条目。 */
export interface DirEntry {
  /** 相对工作区的路径，用 / 分隔。 */
  path: string
  /** 展示名。 */
  name: string
  /** 目录还是文件。 */
  type: 'dir' | 'file'
  /** 字节数（目录为 0）。 */
  size: number
  /** 最后修改时间（毫秒，目录为 0）。 */
  mtime: number
  /** 是否可以打开阅读（markdown 才是 true）。 */
  readable: boolean
}

/** 对话栏里的一条消息。 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

/**
 * 路由处理函数拿到的东西。
 *
 * 宿主服务用 `any`：dsh 的服务类没有随包发布的类型，而我们是**独立安装**的插件
 * （解析不到 dsh 的 node_modules）。对宿主对象做类型标注只能靠手抄，抄错了比不抄更危险，
 * 所以边界处一律 `any`，并在用之前做能力判断（`typeof x?.y === 'function'`）。
 */
export interface HostServices {
  /** cordis 根上下文，取可选服务用。 */
  ctx: any
  /** webServer：注册 HTTP 端点。 */
  host: any
  /** connection：跨站请求守卫。 */
  connection: any
  /** sessions：SessionStore。 */
  sessions: any
  /** workspaceRegistry：可选服务，本机实测缺失。 */
  registry: any
}
