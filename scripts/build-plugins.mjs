/**
 * 把内置插件打成「可安装的插件包」（物理卸载方案的第一步）。
 *
 * 产物（随应用分发，electron-builder extraResources 的 `resources/plugins`）：
 *
 *   resources/plugins/<id>/plugin.json   清单（由插件的 manifest.ts 生成，单一真源）
 *   resources/plugins/<id>/main.cjs      主进程入口（CJS，install(ctx) 契约）
 *   resources/plugins/<id>/renderer.mjs  渲染层入口（ESM，default export { manifest, install(ctx) }）
 *
 * 关键约束（方案见 src/plugins/PACKAGING.md）：
 * - **宿主运行时必须外置**：插件源码里指向 core 的导入（`../../main/**`）与宿主 UI 的导入
 *   （`@renderer/**`）在打包时统一改成 `@host/*` 虚拟模块并标记 external——运行期由宿主注入
 *   （主进程经 globalThis 交接、渲染层经 plugin://host/ui 的 ESM 桥）。这样既能避免把
 *   PGlite 连接 / React / i18n 实例打成两份，又**不用改 288 处 import**，源码仍按真实 core 类型检查。
 * - 渲染层只外置宿主 UI 与 vendor（react/antd/图标）；自己的依赖（codemirror 等）打进包。
 *
 * 跑法：node scripts/build-plugins.mjs [--plugin music] [--out resources/plugins] [--dev]
 */
import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_IDS = ['music', 'planner', 'home', 'harness']

const args = process.argv.slice(2)
const onlyIndex = args.indexOf('--plugin')
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null
const outIndex = args.indexOf('--out')
const OUT_DIR = resolve(ROOT, outIndex >= 0 ? args[outIndex + 1] : 'resources/plugins')
const isDev = args.includes('--dev')

/** 插件源码里被解析到这些目录的导入 → 交给宿主运行时 */
const HOST_MAIN_DIR = resolve(ROOT, 'src/main')
const HOST_RENDERER_DIR = resolve(ROOT, 'src/renderer/src')
const SHARED_DIR = resolve(ROOT, 'src/shared')
const PLUGINS_DIR = resolve(ROOT, 'src/plugins')

/** tsconfig 里的路径别名（与 tsconfig.web/node 的 paths 保持一致） */
const ALIASES = [
  [/^@renderer\/(.*)$/, HOST_RENDERER_DIR],
  [/^@plugins\/(.*)$/, PLUGINS_DIR],
  [/^@shared\/(.*)$/, SHARED_DIR]
]

const isAbsoluteSpec = (spec) => /^[A-Za-z]:[\\/]/.test(spec) || spec.startsWith('/')
const isBare = (spec) => !spec.startsWith('.') && !isAbsoluteSpec(spec) && !spec.startsWith('@host/')

/**
 * 解析插件里的导入：
 * - `@renderer/**`（宿主 UI）、`../../main/**`（core）、`@shared/**` → `@host/<side>/<相对路径>`，标记 external；
 * - `@plugins/**` 与插件内部相对导入 → 正常打进包；
 * - 其它裸模块（react/antd/langchain/zod/drizzle/electron…）→ 一律 external，运行期由宿主解析
 *   （主进程经 require 垫片、渲染层经 ctx.require / 宿主 ESM 桥），避免每个插件包各带一份 langchain/zod。
 */
const hostExternalPlugin = (side) => ({
  name: 'host-external',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args_) => {
      const spec = args_.path

      // 1) 先判 tsconfig 别名（否则 @renderer/* 会被当成裸模块直接外置，路径就漏给了宿主）
      let abs = null
      for (const [re, base] of ALIASES) {
        const m = re.exec(spec)
        if (m) {
          abs = join(base, m[1])
          break
        }
      }

      // 2) @host/* 与第三方裸模块（react/antd/langchain/zod/drizzle/electron…）一律外置，
      //    运行期由宿主解析（主进程 require 垫片、渲染层 ctx.require / 宿主 ESM 桥）
      if (!abs) {
        if (spec.startsWith('@host/')) return { path: spec, external: true }
        if (isBare(spec)) return { path: spec, external: true }
      }

      // 3) 相对/绝对路径 → 绝对路径
      if (!abs) {
        const from = args_.importer ? dirname(args_.importer) : ROOT
        abs = resolve(from, spec)
      }
      const withSep = (dir) => abs.startsWith(dir + sep)
      if (withSep(PLUGINS_DIR)) return null // 插件自己的代码：打进包

      if (withSep(HOST_MAIN_DIR)) {
        return { path: '@host/main/' + relOf(HOST_MAIN_DIR, abs), external: true }
      }
      if (side === 'renderer' && withSep(HOST_RENDERER_DIR)) {
        return { path: '@host/renderer/' + relOf(HOST_RENDERER_DIR, abs), external: true }
      }
      if (withSep(SHARED_DIR)) {
        return { path: '@host/shared/' + relOf(SHARED_DIR, abs), external: true }
      }
      return null
    })
  }
})

const relOf = (base, abs) =>
  relative(base, abs)
    .replace(/\\/g, '/')
    .replace(/\.(ts|tsx|js|jsx)$/, '')

/** 由 manifest.ts 生成 plugin.json（单一真源，不手写第二份） */
async function emitManifest(id, outDir) {
  const entry = join(ROOT, 'src/plugins', id, 'manifest.ts')
  const built = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent'
  })
  const code = built.outputFiles[0].text
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  const mod = await import(dataUrl)
  const manifest = mod.default ?? mod[Object.keys(mod)[0]]
  const json = { ...manifest, entry: { renderer: 'renderer.mjs', main: 'main.cjs' } }
  writeFileSync(join(outDir, 'plugin.json'), JSON.stringify(json, null, 2) + '\n')
  return json
}

async function buildPlugin(id) {
  const srcDir = join(ROOT, 'src/plugins', id)
  const outDir = join(OUT_DIR, id)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const manifest = await emitManifest(id, outDir)

  // 主进程入口：CJS，external 掉 electron / node 内置 / @host/**
  const mainEntry = join(srcDir, 'main/index.ts')
  if (existsSync(mainEntry)) {
    await build({
      entryPoints: [mainEntry],
      outfile: join(outDir, 'main.cjs'),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['electron'],
      plugins: [hostExternalPlugin('main')],
      minify: !isDev,
      sourcemap: isDev ? 'inline' : false,
      logLevel: 'warning'
    })
  }

  // 渲染层入口：ESM（blob import 加载），external 掉 react/antd/图标与 @host/**
  const rendererEntry = join(srcDir, 'renderer/plugin.tsx')
  if (existsSync(rendererEntry)) {
    await build({
      entryPoints: [rendererEntry],
      outfile: join(outDir, 'renderer.mjs'),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'chrome120',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'antd', '@remixicon/react'],
      plugins: [hostExternalPlugin('renderer')],
      loader: { '.css': 'css', '.svg': 'dataurl' },
      minify: !isDev,
      sourcemap: isDev ? 'inline' : false,
      logLevel: 'warning'
    })
  }

  const size = (f) => (existsSync(join(outDir, f)) ? readFileSync(join(outDir, f)).length : 0)
  console.log(
    `  ${id.padEnd(8)} manifest=${manifest.id} main.cjs=${(size('main.cjs') / 1024).toFixed(1)}KB renderer.mjs=${(size('renderer.mjs') / 1024).toFixed(1)}KB`
  )
}

console.log(`打包内置插件 → ${relative(ROOT, OUT_DIR)}${isDev ? '（dev：不压缩 + inline sourcemap）' : ''}`)
mkdirSync(OUT_DIR, { recursive: true })
for (const id of only ? [only] : PLUGIN_IDS) {
  try {
    await buildPlugin(id)
  } catch (err) {
    console.error(`  ${id} 打包失败：${err.message}`)
    process.exitCode = 1
  }
}
// 第三方示例插件也一起分发（演示用，卸载后可从同一处重装）
if (!only && existsSync(join(ROOT, 'examples/demo-plugin'))) {
  cpSync(join(ROOT, 'examples/demo-plugin'), join(OUT_DIR, 'demo-plugin'), { recursive: true })
  console.log('  demo-plugin 复制完成')
}
