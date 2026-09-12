/**
 * localStorage 读写：全部失败静默。
 *
 * 这是「这台机器这个人上次看到哪」的本地状态 —— 丢了顶多重新点一次，
 * 不值得为它引入网络往返，也不值得为它弹错误。隐私模式、配额满、脏数据
 * 都不该影响阅读。
 * @module dsh-readnote/client/storage
 */

/**
 * 读 localStorage。
 * @param key - 键名。
 * @param fallback - 取不到或解析失败时的默认值。
 * @returns 解析后的值或默认值。
 */
export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/**
 * 写 localStorage。
 * @param key - 键名。
 * @param value - 要序列化的值。
 */
export function lsSet(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 配额满或隐私模式：缓存写不进去不是错误。
  }
}
