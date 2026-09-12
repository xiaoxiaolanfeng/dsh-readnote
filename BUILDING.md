# 构建手记 · Building readnote

> 这份文档记录 readnote 从零到跑通的全过程：做过哪些判断、踩过哪些坑、dsh 的真实机制是什么。
>
> 两个用途：**自己回头看**，以及**面试时讲**。所有结论都来自本机实测，不是读文档猜的。
>
> 环境：dsh `0.1.5-rc.1` · Node 22.20 · Windows · pnpm 12.4.1

---

## 一、立项：为什么不缺一个「划词问 AI」的插件

### 1.1 先做生态扫描（数据，不是印象）

DSH 插件生态已经很热闹（`awesome-dsh-plugin` 收录数百个）。把跟本项目相关的全部拉出来对比：

| 插件 | star | GitHub 标称语言 | 有 `tsconfig.json`？ |
|---|---|---|---|
| DSH-better-sidebar | 3531 | TypeScript | ✅ |
| dsh-genui | 439 | TypeScript | ✅ |
| dsh-mnemon | 364 | TypeScript | ✅ |
| dsh_workflow | 121 | TypeScript | ✅ |
| **dsh-annotation** | **114** | HTML | ✅ |
| dsh-notification | 83 | JavaScript | ✅ |
| dsh-focus-chat | 22 | TypeScript | ✅ |
| dsh-web-preview | 5 | JavaScript | ❌ |
| dsh-ask-in-sidebar | 1 | JavaScript | ❌ |
| dsh-inline-comments | 1 | JavaScript | ❌ |

**两个发现：**

1. **`tsconfig.json` 的有无是一条干净的分界线**——有的最低 83★，没有的最高 5★。
   （注意 GitHub 的"语言"字段会骗人：`dsh-annotation` 标成 HTML，但它有 tsconfig。**别信 language 字段，看 tsconfig。**）
   这是**相关不是因果**：愿意配构建链的人本来就做得更认真。但技术理由也真实存在——dsh 的 API 类型极其复杂，没有类型提示很容易用错。

2. **划词/批注赛道没有强竞品**：唯一过 30★ 的是 `dsh-annotation`（114★），其余全在个位数。

### 1.2 再实测（装 7 个插件亲自用）

装了 `dsh-annotation`、`dsh-inline-comments`、`dsh-focus-overlay`、`dsh-ask-in-sidebar`、`dsh-web-preview-panel`、`dshmarket` 等，实测结论两条：

- **A · 入口不可发现**：插件装上了、产物完整、进程正常，但**找不到入口**。产品上等于不存在。
- **B · 对象错了**：所有能触发的插件，划词对象**全是「AI 回复」**——够不着你真正在读的东西。

### 1.3 提炼出的定位

> **生态里所有划词插件都围着「对话」做，没有一个从「我在读一份文档」出发。**

这不是技术做不到，是**设计起点不同**：dsh 是 agent harness，世界中心是对话。

于是 readnote 的差异化就三条：

| | 已有插件 | readnote |
|---|---|---|
| 划词对象 | AI 的回复 | **你打开的文档** |
| 批注是什么 | 对话的燃料（发出去就清空） | **文档上的资产**（永久留在原文上） |
| AI 的回答 | 沉在对话里 | **可以钉回原文** |

并且从别人的失败里拿到两条设计铁律：

1. **入口必须显眼**（治 A）→ 所以做成 `conversation.view` 原生页签，而不是浮动小按钮
2. **对象必须是文档**（治 B）

---

## 二、技术决策与取舍

### 2.1 走「第三条路」：零构建 + 原生页签

生态里有两个流派：

| | 纯 DOM 派（5 个插件） | React + slot 派（focus-chat） |
|---|---|---|
| 构建 | 零构建，手写 CJS 包装 | TypeScript + tsdown + **40 个依赖** |
| client 体积 | 几十 KB | **478 KB** |
| 能注册原生页签 | ❌ | ✅ |

我们两者都要，于是找到了第三条路：

```js
window.__ModuleLoader__.load({
  id: 'dsh-readnote',
  factory: (require) => {
    const React = require('react')                                  // baseline external
    const { MarkdownText } = require('@deepseek-ai/dsh-client-ui-primitives')  // 同上
    // …注册 conversation.view 槽
  },
})
```

关键依据是 dsh 源码里的 `packages/client/web/src/platform.ts`：

```ts
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const
```

这些是 **shell 静态打进页面的共享模块**，任何插件都能 `require` 到，**不需要写进 manifest**。

**结果**：client bundle **10 KB**（对比 focus-chat 的 478 KB），同时拿到了原生页签。

### 2.2 渲染复用 dsh 自己的 MarkdownText

不自己写 markdown 渲染器，直接 `require('@deepseek-ai/dsh-client-ui-primitives')` 拿 `MarkdownText`：

```jsx
<MarkdownText text={markdown源} streaming={false} />
```

它产出 **GFM + KaTeX 数学**，禁用了原始 HTML 和不安全协议——**这正是 dsh 渲染聊天消息用的那个组件**，所以阅读区的排版跟聊天区天然一致，不是仿的。

### 2.3 为什么先做「文档区」再做「批注」

风险排序：**最大风险在数据模型（会话事件 + 锚点定位），不在 UI 外壳**。所以先把「能读到文档」这条管道打通，再动批注。

---

## 三、dsh 机制笔记（能讲出来的部分）

### 3.1 一切皆插件（cordis）

插件 = 导出 `apply(ctx)` 的模块：

```ts
export const name = 'dsh-readnote'
export const inject = ['webServer', 'connection', 'sessions']   // 依赖的 cordis 服务
export function apply(ctx) { /* 注册能力 */ }
```

凡是经 `ctx` 注册的东西（事件、工具、定时器）**插件卸载时自动清理**；需要显式清理的资源用 `ctx.effect(() => disposer)`。

### 3.2 配置的三层组合

```
profile ($DSH_HOME/profiles/<name>)
  ├─ package.json 的 dsh.profile.bundles   →  按序应用每个 bundle 的 patch
  ├─ cordis.patch.yml                      →  用户补丁层
  └─ $DSH_HOME/cordis.patch.yml            →  机器级补丁层
后面覆盖前面（patch 是整行替换 config，不深合并）
```

### 3.3 两种挂载方式，行为完全不同（实测）

| 方式 | 改什么 | 生效方式 |
|---|---|---|
| `dsh plugin --profile web add <包>` | `package.json` 的 bundles | **必须重启**（recompose 不重读 bundles） |
| patch 里 `insert` 绝对路径 | `cordis.patch.yml` | **热重载**（`patchReload: live` 监听 patch 文件） |

**patch 的能力**（来自 `dsh-app-boot` README 原文）：

> Profiles with `patchReload: live` **watch both user patch files**: a valid edit recomposes without restart, while a rejected edit leaves the last good app running.

注意关键词 **"both user patch files"**——只监听那两个 patch 文件，**不监听 `package.json`**。

### 3.4 客户端插件的加载链

```
package.json 的 dsh.client 声明
        ↓
client-modules 扫描到它，去读 exports["./client"] 指向的 lib/client.js
        ↓
浏览器里 shell 执行这个文件，它调用 window.__ModuleLoader__.load({ id, factory })
        ↓
id 必须与 package.json 的 name 完全一致，否则报
"bundle loaded without registering <name>"
```

### 3.5 slot 系统：UI 组合的唯一途径

```js
ctx.slots.inject('conversation.view', () => ctx.slots.register(
  { name: 'conversation.view', id: 'readnote', order: 20, label: '阅读' },
  Component,
))
```

- `conversation.view` 是一个**标签环**（`kind: 'list'`, `scope: 'session'`），官方 Chat 是 `order: 0`，Trajectory 是 `order: 10`
- 官方 slot 目录里对它的描述：*"To **ADD** rather than replace, take a seat inside the flow instead: `conversation.view` for a whole tab."*
- 组件拿到的 props 是框架派生的"四份份额"（runtime props / renderSlots / store / inject）

### 3.6 两条硬约束（血的教训）

1. **`__ModuleLoader__.load({ id })` 必须等于包名** —— 否则拒绝挂载
2. **client 源码不能有 `import` / `export`** —— 它被当普通脚本加载，编译后必须保持 script 形态（所以用类型断言而不是 `declare global`）

### 3.7 host 半边怎么给前端供数据

```js
const host = ctx.get('webServer')
ctx.effect(() => host.register({
  kind: 'exact',
  path: '/__readnote/list',
  handler: async (req, res) => { /* Node http 风格 */ },
}))
```

**必须加跨站守卫**（否则任意网页都能读你机器上的文件）：

```js
const rejection = ctx.get('connection').requestRejection(req)
if (rejection !== undefined) { /* 401 / 403 */ }
```

### 3.8 "Model-visible ⟺ logged"

dsh 的架构铁律：**任何进入模型请求的东西，都必须能从会话日志重建。**

这条直接决定了后续批注的数据模型——批注一旦参与「划词问 AI」，选中的文本就进入了模型请求，因此**不能躺在自己的小数据库里，必须作为 session event 落进会话日志**。这是本项目后面最值得讲的设计约束。

---

## 四、踩坑清单（现象 → 原因 → 解法）

### 4.1 环境类

| 现象 | 原因 | 解法 |
|---|---|---|
| `dsh plugin add` 报 `'pnpm' is not recognized` | `dsh plugin` 子命令转发给 pnpm，而 Node 22 环境里没装 | `npm i -g pnpm`（装进 dsh 用的那个 Node 目录） |
| `git ls-remote` 连不上 github.com:443 | 网络需要代理 | `git config --global 'http.https://github.com.proxy' 'http://127.0.0.1:7890'` —— URL 特定配置，只影响 github.com，不动其他仓库 |
| PowerShell 读 UTF-8 文件乱码 / 正则匹配失败 | `Get-Content -Raw` 默认用系统编码（GBK） | 加 `-Encoding UTF8`（**本次踩了两次**） |
| `ConvertFrom-Json` 报 "传入的对象无效" | 同上，中文字符串被 GBK 解码破坏 | 同上 |

### 4.2 插件安装类

| 现象 | 原因 | 解法 |
|---|---|---|
| **装完某插件后 dsh 直接启动崩溃** | 从 GitHub 直装的**源码包没有 `lib/` 构建产物**：`main` 指向 `lib/xxx.js`，但 pnpm 装 git tarball 不会跑 build | ① 优先装 npm 上的包（带构建产物）；② 或 clone 下来 `npm install && npm run build` 后用**本地路径**装 |
| `dsh plugin add` 之后刷新浏览器没变化 | bundles 只在 boot 时读一次，recompose 不重读 `package.json` | 装/卸插件后**必须重启** |
| 低 star + GitHub 直装 = 高风险 | 那个崩溃的插件只有 2★ 且是纯源码包 | 优先 npm 包；装前看一眼有没有 `lib/` |

### 4.3 TypeScript 类

| 现象 | 原因 | 解法 |
|---|---|---|
| `TS2451: Cannot redeclare block-scoped variable 'CSS'` | **DOM lib 里有同名全局**（CSSOM 接口） | 常量改名（`STYLES`） |
| `TS2591: Cannot find name 'node:fs/promises'`（装了 `@types/node` 仍报） | `types` 字段控制全局类型包的自动加载 | tsconfig 里显式加 `"types": ["node"]`（`lib` 里的 DOM 不受影响，两者共存） |

### 4.4 热重载类（最有价值的一组）

| 现象 | 原因 | 解法 |
|---|---|---|
| 改 patch 触发 recompose 了，但新装的插件没生效 | recompose **不重读** `package.json` 的 bundles | 装插件要重启；改 patch 才能热生效 |
| **改了 host 代码，recompose 后端点仍然是旧的** | **Node 的 ESM 模块缓存按 URL 记账**：路径不变，`import()` 直接返回旧模块 | patch 里的路径加 query：`file:///D:/.../index.js?v=3`，每次改动 +1（构成新的模块身份） |
| 不确定端点到底注册没有 | 一开始用状态码判断，但 **dsh 对所有未知 POST 路径都返回 405**，无法区分 | **看响应体**：401 + `{"error":"unauthorized"}` 才是我们 handler 回的；405 + 空 body 是静态服务的默认回应 |

### 4.5 产品类

| 现象 | 教训 |
|---|---|
| 第一版做成右下角浮动按钮 | 用户直接指出"我们不是要放在轨迹旁边的嘛"——**入口形态本身就是需求**，A 类失败就是这么来的 |

---

## 五、最终开发工作流（两条都不用重启 dsh）

```sh
npm run build
```

| 改什么 | 生效方式 |
|---|---|
| **client 半边**（`src/client.ts`） | build → **刷新浏览器** |
| **host 半边**（`src/index.ts`） | build → patch 里 `?v=` 递增 → 刷新浏览器（recompose 自动触发） |

patch 配置（`$DSH_HOME/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: readnote
      name: 'file:///D:/aitool/dsh-readnote/lib/index.js?v=3'
      config: {}
```

---

## 六、面试可以讲的几个点

1. **竞品调研不是看 star 排行，而是找"可信信号"** —— GitHub 的 `language` 字段会骗人，但 `tsconfig.json` 的有无把生态切成了 83★+ 和 5★- 两半。
2. **实测比推断值钱** —— 装 7 个插件亲自用，得出 A（入口不可发现）+ B（对象错了）两条结论，直接定了产品方向。
3. **技术选型可以做"第三条路"** —— 纯 DOM 派做不了原生页签，重方案要 40 个依赖；查到 `PLATFORM_MODULES` 后，用「手写 ModuleLoader + require baseline external」同时拿到了两者，client 只有 10 KB。
4. **理解框架的缓存语义** —— patchReload 只监听 patch 文件、ESM 模块缓存按 URL 记账，这两条决定了开发工作流怎么设计。
5. **`Model-visible ⟺ logged`** —— 这条铁律怎么反向决定了批注的数据模型（待实现，是下一个要讲的设计点）。
