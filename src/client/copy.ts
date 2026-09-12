/**
 * 界面文案：跟随浏览器语言在 zh / en 之间切换。
 * @module dsh-readnote/client/copy
 */
import type { Copy } from './types.ts'

/**
 * 取当前语言的文案表。
 * @returns 文案表。
 */
export function copy(): Copy {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh')
  return zh
    ? {
        label: '阅读',
        workspace: '工作区',
        pick: '挑一份 markdown 开始读',
        back: '← 返回列表',
        reload: '刷新',
        empty: '这个目录里没有可读的文件',
        loading: '加载中…',
        save: '保存',
        cancel: '取消',
        placeholder: '写点什么…（可留空，仅做标记）',
        notes: '批注',
        remove: '删除',
        markOnly: '仅标记（无文字）',
        copyCode: '复制',
        copiedCode: '已复制',
        ask: '问 AI',
        sentToChat: '已发进对话',
        pin: '钉回答',
        recent: '最近打开',
        chat: '对话',
        chatEmpty: '还没有对话 —— 选中一段文字点「问 AI」，回答会出现在这里。',
        you: '我',
        ai: 'AI',
        dragHint: '拖动调整宽度（双击复位）',
      }
    : {
        label: 'Read',
        workspace: 'Workspace',
        pick: 'Pick a markdown file to read',
        back: '← Back to list',
        reload: 'Reload',
        empty: 'Nothing readable in this folder',
        loading: 'Loading…',
        save: 'Save',
        cancel: 'Cancel',
        placeholder: 'Write something… (empty = just mark it)',
        notes: 'Notes',
        remove: 'Remove',
        markOnly: 'Marker only',
        copyCode: 'Copy',
        copiedCode: 'Copied',
        ask: 'Ask AI',
        sentToChat: 'Sent into the chat',
        pin: 'Pin answer',
        recent: 'Recent',
        chat: 'Chat',
        chatEmpty: 'No conversation yet — select text and hit "Ask AI"; the answer lands here.',
        you: 'You',
        ai: 'AI',
        dragHint: 'Drag to resize (double-click to reset)',
      }
}
