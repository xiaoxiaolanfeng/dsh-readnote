# dsh-readnote

> **阅读增强** —— 把 AI 的回答**钉回原文**的文档阅读器。DeepSeek Harness 插件。

**状态：开发中** · 设计见 [DESIGN.md](./DESIGN.md) · 构建手记（生态调研 / dsh 机制 / 踩坑清单）见 [BUILDING.md](./BUILDING.md)

---

## 它解决什么

读一份长文档时，有三个需求现在没人满足：

| 场景 | 现状 |
|---|---|
| 读到不懂的地方想问 AI | 得复制粘贴、切窗口，读的节奏断了 |
| 有个想法想记在这段文字边上 | 没地方记；记了下次也翻不到 |
| AI 给了个好答案 | 沉在对话历史里，翻不回来 |

**这三个都指向同一件事：读文档时产生的思考，没有落脚点。**

## 和已有插件的区别

生态里的划词 / 批注插件（`dsh-annotation` 等）都以「AI 回复」为划词对象，
**没有一个以「文档」为对象**。

| | 已有插件 | readnote |
|---|---|---|
| 划词对象 | AI 的回复 | **你打开的文档** |
| 批注是什么 | 对话的燃料（发出去就清空） | **文档上的资产**（永久留在原文上） |
| AI 的回答 | 沉在对话里 | **可以钉回原文** |

## 三个动作

| 图标 | 动作 | 说明 |
|---|---|---|
| 🖊️ | **记一笔** | 划词写批注；纯你自己的印记，AI 不插嘴 |
| 💬 | **问 AI** | 划词提问，回答进右侧面板 |
| ✨ | **钉成笔记** | 把 AI 的回答提炼成笔记，**由你决定**要不要插进原文 |

笔记保留你的**原始提问**——问题是你的，答案是 AI 的。只存答案，等于把自己那一半丢了。

## 规划

- [x] 设计稿（[DESIGN.md](./DESIGN.md)）
- [x] 插件骨架：`conversation.view` 阅读页签
- [x] 目录浏览 + markdown 渲染 + 划词批注
- [x] 批注持久化：旁挂 `.readnote/annotations.json`，重开还在
- [x] 划词提问：问题作为真实用户消息发进当前会话
- [x] 钉回答：把会话里的回答取回、编辑、落成原文旁的笔记
- [ ] 问答面板做成对话流的过滤器（只显示与本文相关的问答）
- [ ] 导出带批注的 md（旁挂 → 内联，给分享用）

## 开发方式（本机）

```sh
npm install && npm run build
```

插件用**本地绝对路径**挂进 dsh profile（走 patch 热重载，不装包）：

```yaml
# $DSH_HOME/profiles/web/cordis.patch.yml
- insert:
    - id: readnote
      name: 'D:/aitool/dsh-readnote/lib/index.js'
      config: {}
```

改代码 → `npm run build` → **刷新浏览器**即可，**无需重启 dsh**（host 与 client 半边均已验证热生效）。

两条实现约束记在这里，免得以后踩：

- client 的 `ModuleLoader.load({ id })` 必须与 `package.json` 的 `name` 完全一致，否则 client-modules 拒绝挂载
- `src/client.ts` 不能出现 `import` / `export`，编译后必须保持普通脚本形态

## License

MIT
