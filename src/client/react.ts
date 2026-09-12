/**
 * React 绑定层。
 *
 * 插件**不打包 React** —— 它由 shell 通过 `PLATFORM_MODULES` 种子提供，只能 `require` 到同一份实例
 * （打包第二份 React 会让 hooks 直接崩）。所以这里做两件事：
 *
 * 1. 把 `react` 的具名导出收口到一个文件，其它组件只 import 这里，不直接碰 `react`；
 * 2. 把类型放宽。shell 给的实例版本由宿主决定，用严格泛型标注反而会在升级时到处爆类型错，
 *    而插件真正需要保证的只是「运行时拿到的是宿主那一份」。
 * @module dsh-readnote/client/react
 */
import * as ReactNS from 'react'
import type { ReactNode } from 'react'

/** `createElement` 的宽签名。 */
export type H = (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => any

const React = ReactNS as unknown as Record<string, any>

/** 建元素。 */
export const h = React.createElement as H

/** `useState`，允许函数式更新。 */
export const useState = React.useState as <T>(
  initial: T | (() => T),
) => [T, (next: T | ((prev: T) => T)) => void]

/** `useEffect`。 */
export const useEffect = React.useEffect as (fn: () => void | (() => void), deps?: unknown[]) => void

/** `useRef`。 */
export const useRef = React.useRef as <T>(initial: T) => { current: T }

/** `useMemo`。 */
export const useMemo = React.useMemo as <T>(factory: () => T, deps: unknown[]) => T

/** `useCallback`。 */
export const useCallback = React.useCallback as <T extends (...args: any[]) => any>(fn: T, deps: unknown[]) => T

/** 组件基类，给错误边界用。 */
export const Component = React.Component as new (props: any) => {
  props: any
  state: any
  setState: (next: unknown) => void
}

export type { ReactNode }
