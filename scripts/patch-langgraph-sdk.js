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
const fs = require('fs');
const path = require('path');

const TARGET = path.join(
  __dirname, '..', 'node_modules', '@langchain', 'langgraph-sdk', 'dist', 'utils', 'async_caller.cjs'
);

if (!fs.existsSync(TARGET)) {
  console.log('[patch-langgraph-sdk] async_caller.cjs not found, skipping.');
  process.exit(0);
}

let content = fs.readFileSync(TARGET, 'utf8');

// Idempotent: skip if already patched
if (content.includes('[PATCHED]')) {
  console.log('[patch-langgraph-sdk] Already patched, skipping.');
  process.exit(0);
}

const OLD_LINES =
  'const require_index = require("../node_modules/.pnpm/p-retry@7.1.1/node_modules/p-retry/index.cjs");\n' +
  'const require_index$1 = require("../node_modules/.pnpm/p-queue@9.1.0/node_modules/p-queue/dist/index.cjs");';

const NEW_LINES =
  '// [PATCHED] p-retry is ESM-only → dynamic import wrapper; p-queue is CJS → require directly\n' +
  'var _pRetry;\n' +
  'import("p-retry").then(function(m){ _pRetry = m.default; });\n' +
  'const require_index = { get default() { return function(input, options) { return _pRetry ? _pRetry(input, options) : import("p-retry").then(function(m){ return m.default(input, options); }); }; } };\n' +
  'const require_index$1 = require("p-queue");';

if (!content.includes(OLD_LINES)) {
  console.log('[patch-langgraph-sdk] Target lines not found (maybe already a different version?), skipping.');
  process.exit(0);
}

content = content.replace(OLD_LINES, NEW_LINES);
fs.writeFileSync(TARGET, content, 'utf8');

// Clean up old wrapper files from previous approach
const oldDirs = [
  path.join(path.dirname(path.dirname(TARGET)), 'node_modules'),
];
for (const dir of oldDirs) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('[patch-langgraph-sdk] Inline-patched async_caller.cjs successfully.');
