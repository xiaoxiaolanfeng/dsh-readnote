/**
 * 构建 client 半边。
 *
 * 背景：client 插件必须以 `window.__ModuleLoader__.load({ id, factory })` 的形式
 * 出现在浏览器里 —— 它被 shell 当**普通脚本**加载，不是一个 ES 模块。所以源码
 * 可以（也应该）拆成多个带 import/export 的文件，但**产物必须是可以直接 eval 的
 * 单文件脚本**。
 *
 * 这里用 esbuild 做这件事：bundle 成 CJS（保留 `require` 调用），再用 banner/footer
 * 把整包塞进 ModuleLoader 的 factory 里。`react` 与 `@deepseek-ai/dsh-client-ui-primitives`
 * 标记为 external —— 它们是 shell 的 baseline module，由宿主的 `require` 提供。
 */

import { build } from 'esbuild'

/** 与 package.json 的 name 必须完全一致，否则 client-modules 拒绝挂载。 */
const PLUGIN_ID = 'dsh-readnote'

/** shell 共享的模块，不能打进产物。 */
const EXTERNAL = ['react', '@deepseek-ai/dsh-client-ui-primitives']

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: EXTERNAL,
  legalComments: 'none',
  banner: {
    js: [
      '/* dsh-readnote · client bundle（由 scripts/build-client.mjs 生成，请勿手改）。',
      '   源码在 src/client/，拆成多个 ES 模块；这里 bundle 成 CJS 再包进 ModuleLoader 的 factory。',
      '   `require("react")` 等保持原样，由 shell 注入 —— 插件绝不能自带第二份 React。 */',
      'window.__ModuleLoader__.load({',
      `  id: ${JSON.stringify(PLUGIN_ID)},`,
      '  factory: (require) => {',
      // esbuild 的 CJS 产物会在结尾写 `module.exports = __toCommonJS(...)`，
      // 所以这里只要准备好一个 module 壳子，最后把它交出去即可。
      '    var module = { exports: {} };',
    ].join('\n'),
  },
  footer: {
    js: ['    return module.exports;', '  },', '});'].join('\n'),
  },
})

console.log('[build-client] lib/client.js 已生成')
