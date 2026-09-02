/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Patch @langchain/langgraph-sdk's async_caller.cjs which contains hardcoded
 * pnpm virtual-store paths that don't exist when packaged with ASAR.
 *
 * The rolldown-bundled async_caller.cjs references:
 *   ../node_modules/.pnpm/p-retry@7.1.1/node_modules/p-retry/index.cjs
 *   ../node_modules/.pnpm/p-queue@9.1.0/node_modules/p-queue/dist/index.cjs
 *
 * This script replaces those require() calls inline:
 *   - p-retry (ESM-only) → dynamic import() wrapper
 *   - p-queue (CJS)       → require('p-queue')
 */
const fs = require('fs')
const path = require('path')

const TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@langchain',
  'langgraph-sdk',
  'dist',
  'utils',
  'async_caller.cjs'
)

if (!fs.existsSync(TARGET)) {
  console.log('[patch-langgraph-sdk] async_caller.cjs not found, skipping.')
  process.exit(0)
}

let content = fs.readFileSync(TARGET, 'utf8')

// Idempotent: skip if already patched
if (content.includes('[PATCHED]')) {
  console.log('[patch-langgraph-sdk] Already patched, skipping.')
  process.exit(0)
}

const OLD_LINES =
  'const require_index = require("../node_modules/.pnpm/p-retry@7.1.1/node_modules/p-retry/index.cjs");\n' +
  'const require_index$1 = require("../node_modules/.pnpm/p-queue@9.1.0/node_modules/p-queue/dist/index.cjs");'

const NEW_LINES =
  '// [PATCHED] p-retry is ESM-only → dynamic import wrapper; p-queue is CJS → require directly\n' +
  'var _pRetry;\n' +
  'import("p-retry").then(function(m){ _pRetry = m.default; });\n' +
  'const require_index = { get default() { return function(input, options) { return _pRetry ? _pRetry(input, options) : import("p-retry").then(function(m){ return m.default(input, options); }); }; } };\n' +
  'const require_index$1 = require("p-queue");'

if (!content.includes(OLD_LINES)) {
  // 修复：此前失配时静默 exit 0——依赖升级后补丁失效无人感知,打包产物里硬编码的
  // pnpm 虚拟路径在运行期 MODULE_NOT_FOUND。改为显式失败并给出排查指引。
  console.error(
    '[patch-langgraph-sdk] Target lines not found — @langchain/langgraph-sdk was upgraded and ' +
      'this patch no longer applies. Please update OLD_LINES/NEW_LINES in scripts/patch-langgraph-sdk.js ' +
      '(or pin the dependency version) and reinstall.'
  )
  process.exit(1)
}

content = content.replace(OLD_LINES, NEW_LINES)
// 修复：pnpm 的 node_modules 是 store 硬链接,writeFileSync 直写会连坐改写共享 store 内
// 的文件（同 store 其他项目被污染）。经「临时文件 + rename」替换,只在本项目目录内
// 断链生成新文件,store 内容保持不变。
const tmpFile = `${TARGET}.patch-tmp`
fs.writeFileSync(tmpFile, content, 'utf8')
fs.renameSync(tmpFile, TARGET)

// Clean up old wrapper files from previous approach
const oldDirs = [path.join(path.dirname(path.dirname(TARGET)), 'node_modules')]
for (const dir of oldDirs) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

console.log('[patch-langgraph-sdk] Inline-patched async_caller.cjs successfully.')
