/**
 * shell 通过 `PLATFORM_MODULES` 注入的模块：包内不带类型，运行时的形状由宿主版本决定。
 *
 * 声明成简写环境模块（内容为 `any`），是为了不在插件里复制一份宿主类型 ——
 * 一旦宿主升级，重复的类型定义会先于运行时出错，反而掩盖真正的问题。
 * @module dsh-readnote/client/platform
 */

declare module '@deepseek-ai/dsh-client-ui-primitives'
