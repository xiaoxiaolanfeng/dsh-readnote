/**
 * dsh-readnote · client half（v0.1 骨架）。
 *
 * 两条并存的机制：
 *   1. 挂载 —— dsh 社区主流的 ModuleLoader 手写包装（零额外构建步骤）。
 *   2. 视图 —— 注册进 conversation.view 槽，成为与「对话 / 轨迹」并列的原生页签。
 *
 * 硬约束（踩过就知道疼）：
 *   - id 必须与 package.json 的 "name" 完全一致，否则 client-modules 会以
 *     "bundle loaded without registering <name>" 拒绝挂载。
 *   - 本文件不能出现 import / export 语句（它是被 shell 当普通脚本加载的），
 *     所以用类型断言而不是 declare global。
 *   - React 与 ui-slots 属于 dsh 的 baseline externals，由 shell 提供，
 *     不需要写进 package.json 的 dsh.client.external。
 */

interface ModuleLoaderDef {
  id: string
  factory: (require: (specifier: string) => unknown) => unknown
}

const STYLE_ID = 'readnote-style'

/** 样式走 dsh 的主题 token，跟宿主保持一致的外观。 */
const STYLES = `
.readnote-view {
  display: flex; flex-direction: column; gap: 14px;
  height: 100%; padding: 28px 32px; overflow: auto;
  font-family: var(--dsw-font-family, system-ui);
  color: var(--dsw-alias-label-primary, #f5f5f7);
}
.readnote-view__title { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.readnote-view__lead {
  margin: 0; max-width: 62ch;
  font-size: 13px; line-height: 1.75; opacity: .74;
}
.readnote-view__steps {
  margin: 0; padding-left: 20px; max-width: 62ch;
  font-size: 13px; line-height: 1.9; opacity: .62;
}
.readnote-view__badge {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  height: 24px; padding: 0 10px; border-radius: 12px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.07));
  font-size: 12px; opacity: .8;
}
`

interface Copy {
  label: string
  title: string
  lead: string
  steps: string[]
  badge: string
}

/**
 * 跟随浏览器语言取文案（dsh 的产品文案是双语的）。
 * @returns 当前语言的文案表。
 */
function copy(): Copy {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  return zh
    ? {
        label: '阅读',
        title: 'readnote · 阅读视图',
        lead: '骨架已跑通：这个页签注册在 conversation.view 槽上，与「对话 / 轨迹」同级。',
        steps: [
          '文档区：渲染 markdown（下一步）',
          '划词 → 记一笔 / 问 AI',
          '回答 → 钉成笔记 → 插回原文',
        ],
        badge: 'v0.1 骨架',
      }
    : {
        label: 'Read',
        title: 'readnote · reading view',
        lead: 'Skeleton works: this tab is registered on the conversation.view slot, alongside Chat and Trajectory.',
        steps: [
          'Document pane: render markdown (next)',
          'Select text → annotate / ask AI',
          'Answer → pin as note → back into the passage',
        ],
        badge: 'v0.1 skeleton',
      }
}

/** style 元素只注入一次，插件重载时不重复。 */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.appendChild(style)
}

const loader = (
  window as unknown as { __ModuleLoader__?: { load: (def: ModuleLoaderDef) => void } }
).__ModuleLoader__

loader?.load({
  id: 'dsh-readnote',
  factory: (require) => {
    'use strict'
    const module = { exports: {} as Record<string, unknown> }
    const exports = module.exports

    // React 由 dsh shell 提供。两种模块形态都兼容（命名空间 / 默认导出）。
    const reactModule = require('react') as { default?: unknown } | undefined
    const React = (reactModule?.default ?? reactModule) as {
      createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
    }
    const h = React.createElement

    /** 阅读视图：conversation.view 槽里的页签内容。 */
    function ReadnoteView(): unknown {
      const t = copy()
      return h(
        'div',
        { className: 'readnote-view' },
        h('span', { className: 'readnote-view__badge' }, t.badge),
        h('h2', { className: 'readnote-view__title' }, t.title),
        h('p', { className: 'readnote-view__lead' }, t.lead),
        h('ul', { className: 'readnote-view__steps' }, ...t.steps.map((s, i) => h('li', { key: i }, s))),
      )
    }

    /**
     * Client 半边入口：把阅读视图注册成一个 conversation.view 页签。
     * @param ctx - client 根上下文，需提供 slots 服务。
     */
    function apply(ctx: {
      slots?: {
        inject: (name: string, setup: () => unknown) => void
        register: (options: Record<string, unknown>, component: unknown) => unknown
      }
    }): void {
      if (typeof document !== 'undefined') ensureStyles()
      if (typeof ctx?.slots?.inject !== 'function') return

      const t = copy()
      ctx.slots.inject('conversation.view', () =>
        ctx.slots?.register(
          {
            name: 'conversation.view',
            id: 'readnote',
            order: 20,
            label: t.label,
          },
          ReadnoteView,
        ),
      )
      console.log('[readnote] conversation.view tab registered')
    }

    exports.name = 'dsh-readnote'
    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
