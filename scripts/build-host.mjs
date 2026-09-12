/**
 * 构建 host 半边。
 *
 * 为什么 host 也要 bundle（源码明明已经是能直接跑的 ESM）：
 *
 * dsh 用 `file:///.../lib/index.js?v=N` 这样的 URL 加载插件，靠**改 URL** 绕过
 * Node 的 ESM 模块缓存实现热重载。但 **query 不会被相对导入继承** —— 实测：
 *
 *   entry = file:///…/entry.mjs?v=23
 *   child = file:///…/child.mjs          ← query 没了
 *
 * 也就是说多文件产物里，只有入口那一份会被重新加载，`lib/host/*.js` 全部命中旧缓存。
 * 表现是「改了 host 代码、bump 了 ?v=、行为没变」，而且不报任何错。
 *
 * 所以这里把 host 半边也压成一个文件：整棵树只有入口一个 URL，?v= 才是真的有效。
 * 类型声明仍由 tsc 生成（tsconfig.host.json 只 emitDeclarationOnly）。
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // 只依赖 node: 内置模块；esbuild 在 platform:node 下自动保持它们为外部依赖。
  legalComments: 'none',
  banner: {
    js: '/* dsh-readnote · host bundle（由 scripts/build-host.mjs 生成，请勿手改）。源码在 src/。 */',
  },
})

console.log('[build-host] lib/index.js 已生成')
