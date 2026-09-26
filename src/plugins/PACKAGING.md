# 插件打包与物理卸载（方案 B，2026-09-26 用户选定）

> 用户要求：「内置的插件，可以完全卸载的形式，不是直接用开关形式」。
> 卸载口径（用户澄清）：**卸载时询问是否保留数据——选择「保留数据」就不卸载；选择「不保留」才卸载并清除该插件的数据。**
>
> 本文是分轮实施的方案书。第一步（打包管线 `scripts/build-plugins.mjs`）已完成并验证。

## 目标形态

```
应用包内（随应用分发，只读）        首次启动安装到（可读写、可删除）
resources/plugins/<id>/      ──▶   userData/plugins/<id>/
  plugin.json                        plugin.json
  main.cjs                           main.cjs
  renderer.mjs                       renderer.mjs
```

- **运行时不再有「内置插件」**：应用里没有对插件代码的静态 import，所有插件（含这四个）都从
  `userData/plugins/<id>/` 按现有外部插件链路加载（`loadExternalMain` + `plugin://` 渲染模块）。
- 「内置」只表示**随应用分发、可随时重装**；「第三方」是用户自己放进去的。二者在列表里区分，卸载行为一致
  （删目录），区别是内置的可以从应用包重新安装。
- 插件的数据**不在插件目录里**（表在 core 的 schema、行在同一个 PGlite 库），所以「卸载」与「清数据」是两件事，
  分开询问（见下）。

## 宿主运行时契约（方案的核心约束）

插件包必须**通过宿主拿 core 与宿主 UI 的能力**，否则会打出第二份 PGlite 连接 / React / i18n。
做法：打包时把插件源码里指向 core（`../../main/**`）与宿主 UI（`@renderer/**`）的导入改写成 `@host/**` 外部依赖，
**源码一行不用改**（仍按真实 core 类型做 typecheck），运行期由宿主注入同一份模块实例。

打包后统计出的接口面（去重，2026-09-26 实测）：

**主进程 20 个**：`@host/main/` 下的 `context`（settingsStore）、`database/{instance,orm,schema,schema/common,workspace-context}`、
`database/mapper/provider`、`i18n`、`i18n/tool-results-{agent,docs,fs,planner}`、`plugins/{app-events,app-hooks,contributions,tool-contract}`、
`provider/{cache,service}`、`safe-send`、`shared/weather-utils`。

**渲染层 15 个**：`@host/renderer/` 下的 `i18n`、`hooks/{useMessage,useNotification,useTheme}`、
`components/markdown/{MarkdownView,MarkdownLoad,TipTapMarkdownEditor}`、`components/system/{Skeleton,settings/SettingsUI}`、
`components/{effects/ShinyText,provider/provider-mark}`、`route/RouteSkeleton`、`utils/{document,formatTime,providerMeta}`。

**渲染层 vendor 8 个**：`@host/vendor/` 下的 `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、
`antd`、`@remixicon/react`、`@ant-design/icons`、`dayjs`（宿主里已有唯一实例的第三方；`vendor()` 用 `Object.keys`
枚举命名导出，dayjs 只有默认导出因此显式写名单）。P2 实测：未把 dayjs 放进 vendor 时 planner 的渲染产物里
带了一份独立的 dayjs（41.3KB → 走桥后 33.2KB），`isDayjs()` 与 antd DatePicker 的受控值会跨实例分裂。

### 主进程交接方式

宿主在加载任何插件前挂上运行时表（实际实现见 `src/main/plugins/runtime.ts`）：

```js
// 打包时插件里的 core/裸模块导入被改写成一句 require 垫片，最终落到这个全局函数：
globalThis.__RB_HOST_RESOLVE__(spec) // '@host/main/database/orm' → 宿主那一份实例（单例保住）
// 其它裸模块（electron / langchain / zod / drizzle…）
// → 按宿主自身的解析路径（应用根）require 同一实例
```

### 渲染层交接方式

渲染层插件包是 ESM（`plugin://` + blob import 加载），宿主 UI 以 **ESM 桥**提供：
`plugin://host/ui.js`（由协议处理器生成，内容是 `const H = globalThis.__RB_HOST_UI__; export const X = H.X;` 形式的具名导出）。
需要：

- CSP 的 `script-src` 加上 `plugin:`（现在是 `'self' blob:`）；
- 宿主的 `__RB_HOST_UI__` 表在渲染层启动时挂上（15 个模块 + 8 个 vendor，静态 import 后聚合）；
- 桥按 `?m=<键>` 逐个生成（键 = 打包产物里的说明符），导出名由渲染层一次性上报
  （`plugin-host-ui-exports`）——主进程因此仍然不认识任何宿主模块。

### 渲染层多文件产物（P3 落地）

渲染入口仍是**一个** `renderer.mjs`，但它不再是一个巨型单文件：插件自己的动态 import
（`lazy(() => import('./graph/GraphView'))`、codemirror 语言包…）会拆成 `chunk-<hash>.mjs`。

- 打包：`splitting: true` + `chunkNames: 'chunk-[hash]'` + `outExtension: { '.js': '.mjs' }`；
  不开 splitting 时 esbuild 会把动态 import **内联进入口**——P3 实测 home 的 `renderer.mjs`
  因此从 118.0KB 涨到 1310KB（把 ~1MB 的 echarts 带进首页首屏）。
- 为什么相对说明符必须绝对化：入口是 `fetch` 下来再以 **blob URL** import 的，blob 模块
  没有可解析的相对基准（`./chunk-x.mjs` → `blob:…/chunk-x.mjs`）。打包脚本因此把产物里
  「确实指向本次产物」的相对说明符改写成 `plugin://<id>/<文件>`。
- 铺包时按**模式**识别产物（`plugin.json` / `main.cjs` / `renderer.mjs` / `chunk-*.mjs`），
  升级时顺手清掉旧哈希的 chunk。
- chunk 只有真正 mount 时才取（P3 工装用 CDP Network 域实测：首屏只取入口 + 入口静态共享的
  那个 chunk，打开图谱才取 `chunk-IZPBTTMD.mjs`，即 echarts 那一个）。

## 安装 / 卸载 / 清数据

- **首次启动**：把 `resources/plugins/<id>/` copy 到 `userData/plugins/<id>/`；
  `plugins.json` 里记的 `uninstalled: string[]` 里的插件**跳过**（用户卸载过就不自动装回来）。
- **安装（重装）**：从 `resources/plugins/<id>/` 重新 copy，并清掉 `uninstalled` 记录。
- **卸载**：弹确认框问数据（用户口径）——
  - 选「保留数据」→ **取消卸载**（什么都不做）；
  - 选「不保留」→ ① 调插件的 `plugin.purge` 贡献（此时插件仍装载，能删自己的表数据/托管文件）
    → ② `disposePluginIpc` + `unloadExternalMain` → ③ 删除 `userData/plugins/<id>/` → ④ 写 `uninstalled`、清启用覆写 → 广播。
- **数据清除由插件自己实现**（`ctx.contribute(PLUGIN_PURGE, { run })`），core 不硬编码表名：
  - music：`music_folders` / `music_tracks` 行 + 应用托管的歌单目录（`musicDirectory/<uuid>`，**不删** `musicDirectory` 本身）
  - planner：`planner_tasks` / `planner_dependencies`
  - home：`graph_relations`/`graph_entities`/`graph_build_jobs`、`directory_documents`、`documents_content`、
    `wiki_directories`、`documents`、`wiki`、`task_dependencies`、`todo_items`、`node_positions`、
    `images`（只删本插件引用的那些行）、设置键 `graph`（**用户文档会被删，确认框必须写清楚**）
  - harness：topics / dialogues / goals / usage / agent configs + Mnemon 存储目录（按工作区）
- `PluginListEntry` 增 `bundled`/`installed`；面板分区：**已安装**（内置 / 第三方，各有「卸载」+ 开关）与
  **可安装的内置插件**（仅当有未安装项时出现，行内一个「安装」按钮）。

## 分轮实施

| 轮    | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                             | 验收                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 ✅ | `scripts/build-plugins.mjs`：四插件打成 `resources/plugins/<id>/{plugin.json,main.cjs,renderer.mjs}`，`@host/**` 与第三方裸模块外置，manifest 由 `manifest.ts` 生成（单一真源）                                                                                                                                                                                                                                                                  | 四个包产出（dev：music 113/293KB、planner 107/221KB、home 666/898KB、harness 1722/2565KB），外置清单与本文契约一致                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P1 ✅ | 宿主运行时（main `globalThis` + require 垫片；renderer `plugin://host/ui.js` 桥 + CSP `plugin:`）+ 首次安装 copy + **用 music 端到端**跑通 + **首帧声明式预注册**（见下节）                                                                                                                                                                                                                                                                      | 应用里 music 从 `userData/plugins/music` 装载；首帧侧栏即为「首页/计划/音乐/助手」（`test/probe-first-frame-menu.mjs`）；卸载（不保留数据）后目录/表数据/菜单/通道全没了，重启不会自动铺回来，重装后原样回来；`verify-plugin-host` 61 条全绿、`verify-plugin-install-uninstall` 44 条全绿（P1~P4 期间该工装的「哪些 id 已就绪」由 `packaged.ts` 驱动，P5 起恒为全集）                                                                                                                                                                                                                                                                                                                                                 |
| P2 ✅ | planner 同款（外加 planner 自己的 `plugin.purge`：`planner_dependencies` → `planner_tasks`；另把 **dayjs 纳入宿主 vendor 桥**，见上节）                                                                                                                                                                                                                                                                                                          | planner 从 `userData/plugins/planner` 装载（`loadedFrom().planner.source === 'package'`）；`plugin:planner:tasks-add` 由磁盘包应答并落库；卸载（不保留数据）后目录/两张表行/菜单/路由/`plugin:planner:*` 通道/harness 工具清单里的 `manage_planner` 全没了，且不碰 music 的数据；重启不会自动铺回来，重装后原样回来（数据仍为空）；`verify-plugin-planner-package` 43 条全绿，P1 工装（`verify-plugin-install-uninstall` 44 条 / `verify-plugin-host` 61 条 / 首帧与三个探针）仍全绿                                                                                                                                                                                                                                  |
| P3 ✅ | home 同款（含 GraphView 懒加载 chunk 仍在）+ **渲染层改成多文件产物**（入口 + `chunk-<hash>.mjs`，见上节）+ home 自己的 `plugin.purge`（文档/正文/目录/知识库/图谱/待办/画布坐标/图片 + 设置键 `graph`）                                                                                                                                                                                                                                         | home 从 `userData/plugins/home` 装载；入口 118.0KB（**不含 echarts**）+ 懒加载 `chunk-IZPBTTMD.mjs` 1134KB，首屏只取入口与入口静态共享的 chunk，打开图谱才取懒加载那个（CDP Network 域实测）；7 类数据经磁盘包 handler 落库；卸载（不保留数据）后目录/菜单/路由/通道/harness 工具清单与 8 张表行数全清（images 也归 0）、不碰 music 的行、默认落地页从 `#/home` 退到 `#/planner`，重启不会自动铺回来，重装后原样回来（数据仍为空）；`verify-plugin-home-package` 54 条全绿                                                                                                                                                                                                                                            |
| P4 ✅ | harness 同款 + harness 自己的 `plugin.purge`（7 张表 + 三处托管目录：`userData/file-history`、`userData/tool-output`、`<memoryPath>/workspace-<id>` 与 `spill`）；**新增离线契约审计** `test/audit-plugin-host-contract.mjs`                                                                                                                                                                                                                     | 四个插件全部从 `userData/plugins/<id>/` 装载（`loadedFrom().*.source === 'package'`）；harness 入口 111KB + 32 个 chunk（1712KB），打开助手只取 5/32 个 chunk；工作区/话题/子代理经磁盘包 handler 落库；卸载（不保留数据）后目录/菜单/路由/63 个通道/三个宿主钩子（preload·beforeQuit·memoryDump）与 7 张表行数全清，`<memoryPath>/workspace-<id>`、`spill`、`file-history`、`tool-output` 被删而 **`memoryPath` 本身、core 的 `workspace` 表、设置键 `harness` 保留**；重启不会自动铺回来，重装后原样回来（话题为空）；`verify-plugin-host` 61 条 / `verify-plugin-install-uninstall` 44 条 / `verify-plugin-planner-package` 43 条 / `verify-plugin-home-package` 54 条 / `verify-plugin-harness-package` 47 条全绿 |
| P5 ✅ | 删掉三处过渡物：应用内静态注册表（`main/plugins/builtin.ts`、`plugin-host/builtin.ts`）与白名单 `packaged.ts`；`stateSyncHook` / `syncBuiltinPluginIpcs` / `isPackageReady` 判断全部移除；`electron-builder.yml` 加 `resources/plugins` → `extraResources`；`build:win/mac/linux/unpack` 前置 `build:plugins`；**dev 下自动补打产物**（缺产物或产物落后于源码 → `--plugin <id> --dev`）；面板去掉「过渡期只有开关」的分支；README/MIGRATION 收尾 | `node test/verify-plugin-restructure.mjs` 断言「应用内零插件实现 import」+ 三处过渡物已删；`App.tsx` 的初始插件集合恒为空数组，四个插件的路由/菜单/设置页/provider 全靠清单元数据声明 + 磁盘包异步注册；`test/probe-dev-package-fallback.mjs` 实测「移走 `resources/plugins` → 启动即自动补打四个包并全部装上；只改一个插件的源码 mtime → 只重打那一个」；全套 CDP 工装（61/44/43/54/47 条断言 + 5 个探针）在**删掉静态注册表之后**仍全绿                                                                                                                                                                                                                                                                             |

## 契约漂移的离线审计（P4 落地）

`node test/audit-plugin-host-contract.mjs`：不启动应用，直接读四个包的产物，抽出
主进程的 `__RB_HOST_RESOLVE__("…")` 说明符与渲染层入口/chunk 里的 `plugin://host/ui.js?m=…` 键，
跟 `src/main/plugins/runtime.ts`、`src/renderer/src/plugin-host/host-ui.ts` 两张表比对，
顺带核对裸模块都在 `package.json` 的 dependencies 里。

为什么非要有它（P4 实测）：给 harness 加 `plugin.purge` 时，purge **静态** import 了
`db/schema/**`，而这些 schema 模块 import 了 core 的 `@host/main/database/schema/workspace`——
那个键当时不在运行时表里。同样的导入以前只出现在 `await import('../db/mapper/…')` 里，
失败被推迟到「真的用到某个工具」；改成静态导入后变成**插件包整体装载失败**
（日志：`外部插件 'harness' 主模块启动装载失败`，现象：主进程通道一个不剩，界面菜单还在但
所有调用都报「无处理器」）。当时只能靠跑真实 Electron 才发现——本审计把这类漂移挡在启动之前。

## 首帧声明式预注册（P1 落地，P5 复用同一机制）

**问题**：磁盘包插件的渲染模块要 `fetch` + `import` 之后才 `install(ctx)`，而静态内置插件在宿主构造期
就同步注册完了。于是磁盘包插件的菜单/路由「晚几百毫秒才弹出来」，首帧侧栏缺它——点击侧栏还会导航到
空路由（`No routes matched`）。

**做法**（三端各一小步，没有新增协议）：

1. 主进程 `plugins-list` 的每个条目带上清单里的 `routes`/`menu`（`PluginListEntry.routes/menu`，
   与 `PluginManifest` 同形；磁盘包读 `plugin.json`，过渡期的静态内置插件直接用
   `BUILTIN_PLUGIN_MANIFESTS`）。
2. 渲染层 `PluginHost.declare(id, { menu?, routes? })` 把这份元数据记进**声明表**（按 id 记账）；
   `getMenus()`/`getRoutes()` 返回「真实注册 + 尚未被真实注册覆盖的声明」——同一 `key`/`path`
   **以真实注册为准**，顺序仍按 `order`。声明项只有元数据，路由落到 `MainRoutes` 的
   `PluginRouteView` 时会走「既无 `load` 也无 `Component`」分支，渲染 `<RouteSkeleton>`。
3. `App.tsx` 用已有的同步 `api.plugin.listSync()` 结果构造声明，`PluginHostProvider` 在**构造宿主
   的同一渲染周期内**（早于任何子组件）调用 `declare`。P5 起应用里没有静态插件，**所有**插件都靠
   这份声明撑住首帧（随后各自的渲染模块加载完成、真实注册按 key/path 覆盖声明项）。
4. 清理：`disable()`（含 withdrawal 连带卸载）与 `forgetPlugin()`/`removeExternal()` 都删掉该 id 的
   声明，否则停用/卸载后菜单会残留。
5. 图标：清单里 `menu.icon` 是**名字字符串**（`RiDiscLine`），声明项由
   `plugin-host/declared-icons.tsx` 显式映射成节点，未知名字回退通用图标；**真实注册仍由插件自己传
   组件**，不经过这张表。

**P5 之后**：声明机制成为首屏的**唯一**支撑（应用里已无静态插件注册表，删掉的正是过渡期的
`main/plugins/builtin.ts`、`plugin-host/builtin.ts` 与 `packaged.ts` 白名单）。
`test/probe-first-frame-menu.mjs` 断言的就是这条：首帧侧栏即含「首页/计划/音乐/助手」，
而四个磁盘包此时一个都还没加载完。

### 卸载的边界（P1 实测踩到，P2~P4 同样适用；P5 后第 2 条随静态回退一起作废）

- **卸载必须记 `uninstalled`**：内置插件走 `removeBundledPlugin()`（删目录 + 记账），不能复用第三方语义的
  `uninstallExternalPlugin()`（只删目录），否则下次启动 `ensureBundledPluginsInstalled()` 立刻把包铺回来。
- **未安装就不该有静态回退**（P1~P4）：`builtin.ts` 的遮蔽规则是「已装包 **或** 用户卸载过」都遮住静态模块。
  否则卸载后重启时主进程通道被静态模块装回来（界面按未安装处理），之后从面板「安装」会撞
  Electron 的「Attempted to register a second handler」。P5 删掉静态注册表后这一类问题从根上消失。
- **停用 ≠ 移除登记**：渲染层桥对「只是停用」的插件调 `host.disable()` 而不是 `forgetPlugin()`——登记一丢，
  重新启用时就再也回不来（会去 `plugin://<id>/renderer.js` 找一个已经不在加载路径里的模块）。

## 风险与既有约束

- **dev 模式已落地**：`pnpm dev` 下若 `resources/plugins/` 不存在、或某个插件的产物比源码旧
  （改了插件源码忘了重打包），`installer.ensureDevPackagesBuilt()` 会用同一个脚本
  `--plugin <id> --dev` 补打那一个（不压缩 + inline sourcemap），再走正常安装流程。
  只有 `app.isPackaged === false` 时生效；打包产物由 `pnpm build:win|mac|linux`
  前置的 `build:plugins` 保证。回归探针：`test/probe-dev-package-fallback.mjs`
  （移走产物目录 → 启动 → 断言四个包被补打且装上 → 只碰源码 mtime → 断言只重打那一个 → 恢复目录）。
- **主进程单例**：`globalThis` 交接必须发生在任何插件 `main.cjs` 被 `require` 之前（`initPluginHost()` 开头）。
- **数据库**：插件的表仍由 `src/main/database/schema/index.ts` 汇总（迁移统一由 core 应用）；卸载**不删表**（DDL 不变），
  只由 `plugin.purge` 删行，避免出现「卸载后迁移对不上」的库。
- **CSP**：渲染层插件包从 `plugin://` 加载 `<script type="module">` 需要在 CSP 里放行 `plugin:`；找不到桥时给出明确报错而不是白屏。
- **类型检查**：源码 import 不变，`typecheck` 仍能发现插件用错 core API；`@host/**` 只存在于构建产物里。
