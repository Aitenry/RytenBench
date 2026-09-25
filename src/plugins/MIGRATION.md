# 内容插件化迁移清单（逐插件执行）

> 契约见 `src/plugins/README.md`；进度用 `node test/audit-plugin-layout.mjs` 量（退出码 = 未完成项数）。
> 迁移策略：**一次一个插件，绿测后提交**，任何时刻仓库都可运行。
> 顺序：music（参考实现）→ planner → home → harness（最大）。

## 现状盘点（2026-09-26 迁移前实测）

主进程共 153 个 ts 文件，其中 **104 个（68%）属于这四个插件**，却全部散在
`src/main/ipc`、`src/main/database/{schema,mapper}`、`src/main/harness`、`src/main/graph`、`src/main/workspace`。
IPC 通道共 126 个，全部是扁平名（`music-get-folders`、`harness-stream-chunk`…），没有任何命名空间。
preload 976 行单文件里装着全部插件的 API 命名空间。渲染层 17 个词条文件与壳文案混放。

| 插件 | 主进程旧位置（文件 / 行） | 通道前缀（个数） | preload 键 | core 里残留的渲染层内容 |
| --- | --- | --- | --- | --- |
| music | `ipc/music.ts`、`database/{schema,mapper}/music.ts`（3 / 882） | `music`（15） | `music` | `contexts/AudioContext.tsx`、`types/music.ts`、`i18n/locales/*/music{,Settings}.ts`、`BottomBar` 的音乐条目 |
| planner | `ipc/planner.ts`、`database/{schema,mapper}/planner.ts`（3 / 445） | `planner`（10） | `planner` | `types/planner.ts` |
| home | `ipc/{todo,document,wiki,node-position,graph}.ts`、`database/{schema,mapper}/*`、`graph/**`（28 / 5692） | `todo, task, doc, wiki, graph, node`（50） | `todoItems, taskDependencies, docs, wikis, graph, nodePositions` | `components/{graph,wiki,todo}/**`、首页词条 |
| harness | `ipc/{harness,harness-topic,mnemon}.ts`、`harness/**`(55)、`workspace/**`(4)、`database/{schema,mapper}/*`（70 / 17370） | `harness, mnemon, agent, main`（41） | `harness, mnemon, agents, mainAgent` | `types/harness.ts`、harness 词条 |

## 每个插件的固定动作

1. **主进程**：`main/index.ts` 导出 `install(ctx)`，把原 `ipcMain.handle('x-y', …)` 收成
   `ctx.registerIpc({ 'plugin:<ns>:x-y': … })`；表与查询搬到 `main/db/{schema,mapper}.ts`；
   服务搬到 `main/services/**`；从 `src/main/ipc/index.ts` 的 `builtinIpcGroups` 删除该组，
   在 `src/main/plugins/builtin.ts` 登记主模块。
2. **通道命名**：`<prefix>-<rest>` → `plugin:<ns>:<rest>`；主进程 → 渲染层的事件通道同样改名，
   并确认 `pushPluginChannels()` 会把它们推给 preload（内置插件的 `on` 订阅也走白名单）。
3. **preload**：删除该插件的命名空间；类型声明同步删除（`src/preload/index.d.ts`、
   `src/renderer/resource/types/window.d.ts`）。渲染层改用插件自己的 `renderer/api.ts`（通用桥 + 类型）。
4. **渲染层**：`renderer/**` 收进插件目录；**插件自己的 Provider/状态随插件注册**
   （`ctx.use('appProvider')`），外壳组件不得 import 插件模块——需要数据就给外壳加插槽
   （参照 music 的 `bottomBar` 挂载点）。
5. **词条**：`locales/{zh-CN,en-US}.ts` + `locales/index.ts`，在 renderer install 里
   `ctx.use('i18n').addResources('translation', locales)`；从中央 locales 的 index 摘掉。
6. **单一真源**：`manifest.ts` 只写一份，主进程目录（`src/plugins/manifests.ts`）与渲染层
   `plugin.tsx` 都 import 它。
7. **验证与提交**：`pnpm run typecheck` → `node test/audit-plugin-layout.mjs`（该插件项归零）→
   6 个离线工装 → `node test/verify-plugin-host.mjs`（真实 Electron + CDP）→ 英文 conventional commit。

## 已知陷阱（踩过的）

- **drizzle**：插件 schema 由 core 的 `database/schema/index.ts` 用**相对路径** re-export，
  并把插件 schema 文件加进 `drizzle.config.ts` 的 `schema`（drizzle-kit 不解析 tsconfig paths）；
  迁移照旧 `pnpm drizzle-kit generate`，历史迁移文件不能动。
- **构建**：`@plugins` 别名在 main / renderer 两边都要指到 `src/plugins`；`tsconfig.node.json`
  要 include `src/plugins/**`，`tsconfig.web.json` 要 include + paths。
- **Tailwind v4**：`src/renderer/src/assets/main.css` 只有 `@import 'tailwindcss'`，自动扫描基于
  Vite root。渲染层文件搬到 `src/plugins/**`（root 之外）后**必须实测**被搬走的组件里的工具类
  是否仍出现在产物 CSS 里，缺了就补 `@source '../../../plugins/**/*.{ts,tsx}'`。
- **Vite dev**：`server.fs.allow` 需允许仓库根下的 `src/plugins`（dev 下 import root 之外的文件）。
- **跨插件依赖**（不许偷偷 import 别的插件的实现）：
  - `src/main/harness/tools/music.ts` 直接读音乐的 mapper → 归属音乐的数据应由音乐提供主进程服务，
    harness 经 `provide/inject` 取用（迁移 harness 时处理；过渡期先改相对路径）。
  - `src/main/ipc/provider.ts` 里混着 `agent-*`/`main-*` 通道（属于 harness 的智能体配置）→
    迁移 harness 时一起搬走，provider.ts 只留模型 Provider。
  - 渲染层 `components/markdown/**`、`hooks/useMessage`、`utils/formatTime` 等被多个插件共用 →
    留在 core（共享 UI/工具），但**不得**反向 import 任何插件。
- **preload 白名单**：白名单推送早于窗口创建会丢包，已用 `did-finish-load` 补推（`pushPluginChannels`）；
  新增插件通道后不需要额外配置，但内置插件的**事件**订阅也受白名单门控，测试要覆盖。
