/**
 * 注入到页面的样式。
 *
 * 全部走 dsh 的主题 token（`--dsw-*`），所以深浅色跟随宿主，不需要自己判断主题。
 * @module dsh-readnote/client/styles
 */
import { STYLE_ID } from './constants.ts'

/** 样式文本。注意不能命名为 `CSS` —— DOM lib 里有同名全局（CSSOM 接口）。 */
export const STYLES = `
/* 根：高度由 useScrollportHeight 量出来后写成内联 style。
   sticky 是兜底 —— 宿主 scrollBody 里还有别的兄弟节点（实测多出 ~128px），
   万一外层仍能滚动，至少阅读器本身钉在顶部不会跟着跑。 */
.readnote {
  position: sticky; top: 0;
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  font-family: var(--dsw-font-family, system-ui);
  color: var(--dsw-alias-label-primary, #f5f5f7);
}

/* 顶栏：z-index 压过 dsh 的右缘宽度拖拽手柄，否则右侧按钮点不到 */
.readnote__bar {
  position: relative; z-index: 20;
  display: flex; align-items: center; gap: 10px; flex: none;
  min-height: 44px; padding: 0 16px;
  border-bottom: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.08));
  font-size: 12px;
}
.readnote__name { font-size: 13px; font-weight: 600; }
.readnote__meta { opacity: .5; }
.readnote__spacer { flex: 1; }
.readnote__notice { color: var(--dsw-alias-label-success, #5fd08a); opacity: .95; }
.readnote__btn {
  height: 26px; padding: 0 12px; border: none; border-radius: 13px;
  background: transparent; color: inherit; font-family: inherit;
  font-size: 12px; cursor: pointer; opacity: .8;
}
.readnote__btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1; }
.readnote__btn[disabled] { opacity: .35; cursor: default; }

/* 主体：左文档 + 拖拽手柄 + 右对话栏 */
.readnote__main { flex: 1; min-height: 0; display: flex; }
.readnote__body { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
.readnote__handle {
  flex: none; width: 5px; cursor: col-resize;
  background: transparent; transition: background .12s ease;
}
.readnote__handle:hover, .readnote__handle[data-dragging="true"] {
  background: var(--dsw-alias-button-primary-fill, #4c8dff);
}

/* 右侧对话栏 */
.readnote__chat {
  flex: none; min-width: 0; min-height: 0;
  display: flex; flex-direction: column;
  border-left: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.08));
  background: var(--dsw-alias-bg-base, rgba(0,0,0,.12));
}
.readnote__chat-head {
  flex: none; display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.08));
  font-size: 11px; letter-spacing: .04em; opacity: .55;
}
/* 内容独立滚动 */
.readnote__chat-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 10px 12px 16px; }
.readnote__msg { margin-bottom: 12px; font-size: 12px; line-height: 1.65; }
.readnote__msg-who { margin: 0 0 3px; font-size: 10px; letter-spacing: .04em; opacity: .4; }
.readnote__msg-body {
  padding: 8px 10px; border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.05));
  word-break: break-word; overflow-wrap: anywhere;
}
.readnote__msg--user .readnote__msg-body {
  background: var(--dsw-alias-button-primary-fill, #4c8dff);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  margin-left: 28px;
}
.readnote__chat-empty { padding: 18px 4px; font-size: 12px; line-height: 1.7; opacity: .45; }

/* 文档与文件列表 */
.readnote__doc { position: relative; max-width: 74ch; margin: 0 auto; padding: 28px 32px 80px; }
.readnote__list { max-width: 74ch; margin: 0 auto; padding: 14px 24px 60px; }
.readnote__hint { margin: 0 0 14px; font-size: 13px; opacity: .6; }
.readnote__crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; margin: 4px 0 12px; font-size: 12px; }
.readnote__recent {
  margin-bottom: 14px; padding-bottom: 10px;
  border-bottom: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.08));
}
.readnote__section { margin: 0 0 6px; font-size: 11px; letter-spacing: .04em; opacity: .45; }
.readnote__crumb {
  border: none; background: transparent; color: inherit;
  font-family: inherit; font-size: 12px; cursor: pointer;
  padding: 2px 6px; border-radius: 6px; opacity: .75;
}
.readnote__crumb:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1; }
.readnote__crumb-sep { opacity: .3; display: inline-flex; align-items: center; }
.readnote__item {
  display: flex; align-items: baseline; gap: 8px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 8px;
  background: transparent; color: inherit; font-family: inherit;
  font-size: 13px; text-align: left; cursor: pointer;
}
.readnote__item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.07)); }
.readnote__item[disabled] { opacity: .32; cursor: default; }
.readnote__item[disabled]:hover { background: transparent; }
.readnote__item-icon { flex: none; width: 16px; opacity: .8; font-size: 12px; }
.readnote__item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.readnote__item-meta { flex: none; font-size: 11px; opacity: .45; }
.readnote__empty, .readnote__error {
  padding: 34px 4px; max-width: 74ch; margin: 0 auto;
  font-size: 13px; line-height: 1.8; opacity: .7; white-space: pre-wrap;
}
.readnote__error { color: var(--dsw-alias-label-error, #ff6b6b); opacity: .95; }

/* 划词工具条 */
.readnote-sel {
  position: fixed; z-index: 1300;
  display: flex; flex-direction: column; gap: 8px;
  width: 300px; padding: 10px;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.14));
  border-radius: 12px;
  background: var(--dsw-specific-menu, #2c2c2e);
  color: var(--dsw-alias-label-primary, #f5f5f7);
  font-family: var(--dsw-font-family, system-ui);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 28px rgba(0,0,0,.35));
}
.readnote-sel__quote {
  margin: 0; max-height: 60px; overflow: hidden;
  font-size: 12px; line-height: 1.6; opacity: .6;
  border-left: 2px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.2));
  padding-left: 8px;
}
.readnote-sel__row { display: flex; align-items: center; gap: 6px; }
.readnote-sel__spacer { flex: 1; }
.readnote-sel__ta {
  width: 100%; min-height: 62px; resize: vertical; box-sizing: border-box;
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.16));
  background: var(--dsw-alias-bg-base, #1c1c1e);
  color: inherit; font-family: inherit; font-size: 13px; line-height: 1.6;
}
.readnote-sel__ta:focus { outline: none; border-color: var(--dsw-alias-button-primary-fill, #4c8dff); }
.readnote-sel__go {
  height: 28px; padding: 0 14px; border: none; border-radius: 14px;
  background: var(--dsw-alias-button-primary-fill, #4c8dff);
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font-family: inherit; font-size: 12px; cursor: pointer;
}
.readnote-sel__cancel, .readnote-sel__ask {
  height: 28px; padding: 0 12px; border: none; border-radius: 14px;
  background: transparent; color: inherit; opacity: .8;
  font-family: inherit; font-size: 12px; cursor: pointer;
}
.readnote-sel__ask { border: 1px solid var(--dsw-alias-border-inverted, rgba(255,255,255,.2)); }
.readnote-sel__cancel:hover, .readnote-sel__ask:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.08)); opacity: 1;
}

/* 批注气泡：挂在高亮文字的旁边，左/右择空 */
.readnote-bubble {
  position: absolute; z-index: 5;
  display: flex; align-items: flex-start; gap: 3px;
  max-width: 230px; padding: 6px 6px 6px 9px;
  border: 1px solid rgba(255, 214, 102, .38);
  border-radius: 9px;
  background: rgba(255, 214, 102, .13);
  color: var(--dsw-alias-label-primary, #f5f5f7);
  font-family: var(--dsw-font-family, system-ui);
  font-size: 12px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
}
.readnote-bubble__text { flex: 1; min-width: 0; }
.readnote-bubble__empty { opacity: .5; }
.readnote-bubble__del {
  flex: none; border: none; background: transparent; color: inherit;
  opacity: .4; cursor: pointer; font-size: 11px; line-height: 1; padding: 0 2px;
}
.readnote-bubble__del:hover { opacity: .95; }

/* 原文高亮（CSS Custom Highlight API，不改动 React 渲染的 DOM） */
::highlight(readnote-notes) {
  background-color: rgba(255, 214, 102, .28);
  text-decoration: underline;
  text-decoration-color: rgba(255, 214, 102, .7);
}
`

/**
 * 把样式注入文档，只注入一次。
 */
export function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.appendChild(style)
}
