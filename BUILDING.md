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

### 2.4 目录浏览：分层，而不是递归扫描

第一版让 host **递归扫描整个工作区**、一次返回所有 markdown（带 300 条上限）。结果是「阅读页签一直转圈打不开」。

**错在哪**：只限制了**结果数量**，没限制**遍历成本**——在一棵几十万文件的目录树上，它得走完整棵树才知道凑够没有。后来加「1.5 秒时间预算」只是**限制伤害**，不是解决问题。

**更好的方案（由用户提出）**：像文件管理器一样**分层**——先列一层目录，点进去再列下一层。

| | 递归扫描 | 分层浏览 |
|---|---|---|
| 单次请求成本 | 整棵树的遍历 | 一个 `readdir` |
| 会不会卡 | 会，取决于目录树规模 | 不会 |
| 交互 | 一屏倒出全部（还未必找得到） | 符合直觉的钻取 |

**收益**：成本从「与目录树规模成正比」变成「与当前层条目数成正比」，而且顺带得到了面包屑导航。

**通用教训**：遇到性能问题，「加个上限」往往是错觉式的修复。**先问数据模型/访问模型对不对** —— 换成按需分层，问题整个消失，而不是被压住。

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
| **改了 client 代码、刷新浏览器，行为完全没变** | 浏览器缓存了 `lib/client.js`。**更坑的是它会让人误判成「修复无效」** —— 我因此在错误的结论上白查了两轮，新代码其实从未被加载 | 硬刷新 `Ctrl+Shift+R`；开发期在 DevTools → Network 勾 **Disable cache** 并保持开着。**并且给 client 加 `BUILD_TAG` 把版本显示在界面上**：先确认版本，再怀疑代码 |

### 4.5 产品类

| 现象 | 教训 |
|---|---|
| 第一版做成右下角浮动按钮 | 用户直接指出"我们不是要放在轨迹旁边的嘛"——**入口形态本身就是需求**，A 类失败就是这么来的 |

### 4.6 性能类（两次「卡死」）| 现象 | 原因 | 解法 |
|---|---|---|
| **阅读页签打不开，一直转圈** | 代码只限制了「最多返回 300 个文件」，但**遍历成本不受结果数量约束** —— 在一棵几十万文件的目录树上会一直走不完。旁证：我这边等效的 PowerShell 扫描命令同样 180 秒超时 | 给遍历加**时间预算**（1.5 秒到点就带着已找到的结果返回）+ 递归深度 4→2 |
| **打开某些 markdown 直接卡死主线程** | 超长文档被全量交给 `MarkdownText` 渲染 | 渲染前截断到 12 万字符并显式提示 |

**通用教训：限制资源用量时，「结果数量」和「计算成本」是两件事，必须分别限制。**
只写 `limit: 300` 会给人一种"已经保护过了"的错觉，实际上一行都没防住 —— 因为瓶颈在遍历，不在结果。

### 4.7 复用 shell 组件类（三轮猜错，一行定位）

| 现象 | 原因 | 解法 |
|---|---|---|
| **打开含代码块的 markdown → 整个页签白屏**<br>`TypeError: Cannot read properties of undefined (reading 'code')` | shell 里的 `MarkdownText` 读的是 **`i.labels.code.copyLabel`**（嵌套、**无可选链**）；而源码 clone 里是 **`codeLabels?.copyLabel`**（扁平、带可选链）。照 clone 写 → `undefined.code` → 崩 | 传 `labels: { code: { copyLabel, copiedLabel } }` |
| **一个畸形输入就让整个页签看起来「坏了」** | React 渲染抛错会卸载整棵子树，而一开始没加错误边界 | 加 `RenderBoundary`（class 组件 + `getDerivedStateFromError`），异常显示成带**文件名 + 调用栈**的红框，而不是白屏 |

**方法论教训（比这个 bug 本身值钱）**

我花了三轮在**源码 clone** 里翻找根因，三次全猜错 —— 因为**实际运行的根本不是那份源码**：
用户装的是 dsh `0.1.5-rc.1`，而 clone 是早先写文章时留下的另一份快照。

**真正一次定位的做法**：浏览器报错信息里已经给了文件名和行列号 —— `index-BKQ_L1z6.js:96:51`。
那个文件就在磁盘上（`dsh-web-frontend/dist/assets/`），**直接读那一行**，答案就在眼前：

```js
`, lang: a, streaming: i.streaming,
   copyLabel: i.labels.code.copyLabel,      // ← 就是这里
   copiedLabel: i.labels.code.copiedLabel
```

再往前后各读一点，还能拿到组件的完整 props 签名：

```js
I.memo(function({ text: r, streaming: i = !1, labels: s, fileMentions: a, pathImages: c })
```

> **源码 clone 只是参考，运行时的构建产物才是事实。** 排查框架内部行为时，
> 先拿报错的文件名+行列号去磁盘上读构建产物，比在源码里 grep 快一个数量级。
>
> 附带一条：`dsh-client-ui-primitives` 在 `node_modules` 里**根本不存在** ——
> 它是 `PLATFORM_MODULES` 里 shell 静态打入的，所以"找包看源码"这条路从一开始就不通。

**事后验证（拉对了版本之后）**：上面这个结论**一字不差地成立**。

```
旧 clone  dsh-v0.1.0-rc.8  render.tsx:326  copyLabel={context.codeLabels?.copyLabel}
新源码    dsh-v0.1.5-rc.1  render.tsx:395  copyLabel={context.labels.code.copyLabel}
新源码    MarkdownText props: { text, streaming?, labels: MarkdownLabels, ... }   ← labels 必填
```

也就是说：**在源码版本错的情况下，靠读 dist 得出的根因仍然是对的** —— 这条方法论经受住了事后验证。

### 4.12 源码版本必须钉住（本项目的踩坑前提）

| 事实 | 值 |
|---|---|
| 本机运行的 dsh | `0.1.5-rc.1` |
| 查运行行为要用的源码 | `D:\aitool\myself\temp\deepseek-harness-0151`（tag `dsh-v0.1.5-rc.1`，浅克隆） |
| 旧的源码 clone | `D:\aitool\myself\temp\deepseek-harness`（tag `dsh-v0.1.0-rc.8`）—— **只对应早期文章，不要用它推断运行行为** |

**为什么专门记这一条**：本手记里 4.7 那三次猜错，根因就是照着 `rc.8` 的源码去推断 `rc.1` 的运行行为。
**中间差 5 个 rc 版本**，API 形状会变（`codeLabels` → `labels` 就是活例）。

> **排查框架行为之前，第一件事是确认「我读的源码是不是跑着的那个版本」。**
> 一条命令就能确认：`git -C <clone> describe --tags` vs 安装包的 `version` 字段。
> 如果对不上，要么拉对版本，要么直接读构建产物 —— **别在错版本的源码里找答案**。

### 4.8 宿主安全类（插件能把 dsh 拖挂）

| 现象 | 原因 | 解法 |
|---|---|---|
| **改完代码，整个 dsh 实例连不上（`ERR_CONNECTION_REFUSED`）** | TypeScript 编译报错（`replace_all` 漏了两处调用），**但 tsc 默认仍然 emit** → `lib/index.js` 被写成带 `ReferenceError` 的坏产物 → dsh 热重载装进去 → 插件加载即抛错 → 实例挂掉 | tsconfig 加 **`noEmitOnError: true`**：编译失败就不产出，旧的可跑版本继续服务，而不是把宿主一起带下水 |

**这条和「不改 dsh 原生文件」是两件事。** 我们确实一行都没碰 dsh 的安装目录（插件全程靠 patch 挂载），
但**插件自身的崩溃同样能拖垮宿主** —— 因为它进了 profile，就是宿主进程的一部分。

> **写插件时，代码质量的下限不是「我的功能能不能用」，而是「我崩了会不会带上整个宿主」。**
> 构建产物必须是「要么正确，要么不更新」，绝不能出现「更新了一份错的」。

### 4.9 「活会话」陷阱（服务可用 ≠ 数据可查）

| 现象 | 原因 | 解法 |
|---|---|---|
| **打开很久没碰的旧会话 → 阅读页签报 `cwd-not-found`** | `SessionStore.get()` 的文档原文是 *"Look up a **live** session … undefined when **no live session** has that id"* —— store 里只放当前进程内活着的会话。刚交互过的会话查得到，**隔天的旧会话查不到** | 别把「拿工作目录」绑在会话生命周期上。铺三条路：活会话 header → `workspaceRegistry.list()` → 读 `$DSH_HOME/storages/workspace.json` 账本兜底 |
| **同一个服务，`ctx.get()` 前面拿不到、后面拿得到** | `workspaceRegistry` 是**懒发布**的可选能力，要等 `storageDomain` + `sessionPersistence` 就绪 | 别在 `apply()` 阶段 `ctx.get()` 定值 —— 那是启动最早期。在 handler 里按需取。（也不能改用 `inject`：inject 一个不存在的服务会让插件永远 pending） |

> **「服务拿到了」和「数据能查到」是两件事。** 前者是依赖注入的时序，后者是业务生命周期 ——
> 把两者混在一起设计接口，就会得到一个「上个厕所回来就打不开」的功能。

### 4.10 Agent 生命周期（想「替用户发消息」必读）

| 现象 | 原因 | 解法 |
|---|---|---|
| **划词提问永远返回 `agent-not-live`** | `agents.get(sessionId)` 拿不到 agent —— 和 4.9 的 `sessions.get()` 同源：**agent 只在会话「正在工作时」存在**，空闲即释放。实测：发完消息等 6 秒就不在了；`agents.resume(sessionId)` 也拉不回来 | ① 如实告诉用户「先在对话框发一句唤醒它」，而不是静默失败；② 用 `agents.list()` 自查当前到底哪个会话有活 agent |

**排查过程值得记**：我一度以为 `agents.get(sessionId)` 用法错了（因为 agent id 和 session id 看着不像一回事），
直到打印 `agents.list()` 才看清 —— **`agent.id` 就是 sessionId**，用法没错，
错的是「我发消息的那个会话根本没有 agent」。

```js
// 一次查明真相的探测（比读文档快十倍）
report._agentCount = agents.list().length
report._agentIds = agents.list().map(a => ({ id: a.id, keys: Object.keys(a).slice(0, 10) }))
// → [{ id: 'session-0a25c95d-...', keys: ['loopCtx','id','options','session','inbox','phase',...] }]
```

**顺带摸清了一条正路**：`agent.followup(message)` 确实能把一条用户消息送进会话。
消息形状是从 `session.deriveMessages()` 里**抄**来的（`{ role, content: [{type:'text',text}], source: {kind:'user'} }`），
因此**不需要 import `@deepseek-ai/dsh-llm` 的 `createUserMessage`** —— 独立包解析不到 dsh 的 node_modules，这条路本来就走不通。

> **想替用户做一件事之前，先问清楚「这件事依赖的那个东西，什么时候存在」。**
> dsh 里 session / agent / workspace 三者各有各的生命周期，把它们当成「一直都在」是这类插件最容易踩的坑。

### 4.11 点不到的按钮（宿主 UI 会盖住你）

| 现象 | 原因 | 解法 |
|---|---|---|
| **顶栏右侧的按钮点不动**（Playwright 报 `intercepts pointer events`） | dsh 有一个 **右缘面板宽度拖拽手柄**（`div[data-side="right"][data-width-handle="right"]`），它盖在最右侧一条竖带上。顶栏右上角的按钮正好落在它下面 | ① 给顶栏加 `position: relative; z-index: 20` 压过它；② **更重要的是把交互按钮挪离右缘**（放文件名旁边）——只靠 z-index 是在跟宿主抢层级，位置才是根本解 |

> 这条只有真去点才会发现：**DOM 里在、视觉上在、`count() > 0`，就是点不到。**
> 自己用 Playwright 跑一遍点击，比看截图可靠得多 —— 截图看不出"谁能接到 pointer events"。

---

## 五、最终开发工作流（两条都不用重启 dsh）

```sh
npm run build
```

| 改什么 | 生效方式 |
|---|---|
| **client 半边**（`src/client.ts`） | build → **硬刷新浏览器**（`Ctrl+Shift+R`；开着 DevTools 的 Disable cache 时普通刷新即可）。改完顺手递增 `BUILD_TAG` |
| **host 半边**（`src/index.ts`） | build → patch 里 `?v=` 递增 → 刷新浏览器（recompose 自动触发） |

patch 配置（`$DSH_HOME/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: readnote
      name: 'file:///D:/aitool/dsh-readnote/lib/index.js?v=N'   # N 每改一次 host 就递增
      config: {}
```

---

## 六、面试可以讲的几个点

1. **竞品调研不是看 star 排行，而是找"可信信号"** —— GitHub 的 `language` 字段会骗人，但 `tsconfig.json` 的有无把生态切成了 83★+ 和 5★- 两半。
2. **实测比推断值钱** —— 装 7 个插件亲自用，得出 A（入口不可发现）+ B（对象错了）两条结论，直接定了产品方向。
3. **技术选型可以做"第三条路"** —— 纯 DOM 派做不了原生页签，重方案要 40 个依赖；查到 `PLATFORM_MODULES` 后，用「手写 ModuleLoader + require baseline external」同时拿到了两者，client 只有 10 KB。
4. **理解框架的缓存语义** —— patchReload 只监听 patch 文件、ESM 模块缓存按 URL 记账，这两条决定了开发工作流怎么设计。
5. **`Model-visible ⟺ logged`** —— 这条铁律怎么反向决定了批注的数据模型（待实现，是下一个要讲的设计点）。
