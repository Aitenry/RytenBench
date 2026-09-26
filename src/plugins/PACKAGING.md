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

### 主进程交接方式

宿主在加载任何插件前挂上运行时表，并给插件 CJS 包注入 `require` 垫片：

```js
globalThis.__RB_HOST_RUNTIME__ = { '@host/main/database/orm': ormModule /* … 20 个 */ }
// 插件包里的 require('@host/main/x') → 命中的直接返回上表里的同一实例（单例保住）
// 其它裸模块（electron / langchain / zod / drizzle…）→ 按宿主自身的解析路径 require
```

### 渲染层交接方式

渲染层插件包是 ESM（`plugin://` + blob import 加载），宿主 UI 以 **ESM 桥**提供：
`plugin://host/ui.js`（由协议处理器生成，内容是 `const H = globalThis.__RB_HOST_UI__; export const X = H.X;` 形式的具名导出）。
需要：

- CSP 的 `script-src` 加上 `plugin:`（现在是 `'self' blob:`）；
- 宿主的 `__RB_HOST_UI__` 表在渲染层启动时挂上（15 个模块，静态 import 后聚合）；
- 版本化：桥文件带 `?v=<宿主版本>`，插件包与宿主版本不匹配时加载失败要给出可读错误。

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
  - home：documents / wiki / directories / todos / node positions / graph entities+relations（**用户文档会被删，确认框必须写清楚**）
  - harness：topics / dialogues / goals / usage / agent configs + Mnemon 存储目录（按工作区）
- `PluginListEntry` 增 `bundled`/`installed`；面板分区：**已安装**（内置 / 第三方，各有「卸载」+ 开关）与
  **可安装的内置插件**（仅当有未安装项时出现，行内一个「安装」按钮）。

## 分轮实施

| 轮    | 内容                                                                                                                                                                                  | 验收                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 ✅ | `scripts/build-plugins.mjs`：四插件打成 `resources/plugins/<id>/{plugin.json,main.cjs,renderer.mjs}`，`@host/**` 与第三方裸模块外置，manifest 由 `manifest.ts` 生成（单一真源）       | 四个包产出（dev：music 113/293KB、planner 107/221KB、home 666/898KB、harness 1722/2565KB），外置清单与本文契约一致                                                                                                                                                                        |
| P1 ✅ | 宿主运行时（main `globalThis` + require 垫片；renderer `plugin://host/ui.js` 桥 + CSP `plugin:`）+ 首次安装 copy + **用 music 端到端**跑通 + **首帧声明式预注册**（见下节）           | 应用里 music 从 `userData/plugins/music` 装载；首帧侧栏即为「首页/计划/音乐/助手」（`test/probe-first-frame-menu.mjs`）；卸载（不保留数据）后目录/表数据/菜单/通道全没了，重启不会自动铺回来，重装后原样回来；`verify-plugin-host` 61 条全绿、`verify-plugin-install-uninstall` 41 条全绿 |
| P2    | planner 同款                                                                                                                                                                          | 同上                                                                                                                                                                                                                                                                                      |
| P3    | home 同款（含 GraphView 懒加载 chunk 仍在）                                                                                                                                           | 同上 + 文档数据 purge 验证                                                                                                                                                                                                                                                                |
| P4    | harness 同款（含 workspace/mnemon 数据 purge）                                                                                                                                        | 同上                                                                                                                                                                                                                                                                                      |
| P5    | 去掉静态注册表（`src/plugins/*/renderer/plugin.tsx` 的应用内 import、`main/plugins/builtin.ts`）、`electron-builder.yml` 加 `resources/plugins` 到 extraResources、面板改造、文档收尾 | `node test/verify-plugin-restructure.mjs` 改为「应用内零插件 import」；全套工装 + CDP 全绿                                                                                                                                                                                                |

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
   的同一渲染周期内**（早于任何子组件）调用 `declare`。静态内置插件此刻已完成真实注册，声明是冗余的
   （合并时真实优先）；真正受益的是磁盘包插件。
4. 清理：`disable()`（含 withdrawal 连带卸载）与 `forgetPlugin()`/`removeExternal()` 都删掉该 id 的
   声明，否则停用/卸载后菜单会残留。
5. 图标：清单里 `menu.icon` 是**名字字符串**（`RiDiscLine`），声明项由
   `plugin-host/declared-icons.tsx` 显式映射成节点，未知名字回退通用图标；**真实注册仍由插件自己传
   组件**，不经过这张表。

**P5 之后**：声明机制保留（第一个插件搬走后每次都靠它撑首帧），删掉的只是过渡期的静态注册表与
`packaged.ts` 白名单。

### 卸载的边界（P1 实测踩到，P2~P4 同样适用）

- **卸载必须记 `uninstalled`**：内置插件走 `removeBundledPlugin()`（删目录 + 记账），不能复用第三方语义的
  `uninstallExternalPlugin()`（只删目录），否则下次启动 `ensureBundledPluginsInstalled()` 立刻把包铺回来。
- **未安装就不该有静态回退**：`builtin.ts` 的遮蔽规则是「已装包 **或** 用户卸载过」都遮住静态模块。
  否则卸载后重启时主进程通道被静态模块装回来（界面按未安装处理），之后从面板「安装」会撞
  Electron 的「Attempted to register a second handler」。
- **停用 ≠ 移除登记**：渲染层桥对「只是停用」的插件调 `host.disable()` 而不是 `forgetPlugin()`——登记一丢，
  没有磁盘包的静态内置插件重新启用时就再也回不来（会去 `plugin://<id>/renderer.js` 找不存在的文件）。

## 风险与既有约束

- **dev 模式**：`pnpm run dev` 下没有打包产物。方案：dev 启动时若 `resources/plugins` 不存在，就用同一个脚本
  临时打一份（`--dev`）再走安装流程；不保留「静态装载」回退，避免两套路径长期漂移。
- **主进程单例**：`globalThis` 交接必须发生在任何插件 `main.cjs` 被 `require` 之前（`initPluginHost()` 开头）。
- **数据库**：插件的表仍由 `src/main/database/schema/index.ts` 汇总（迁移统一由 core 应用）；卸载**不删表**（DDL 不变），
  只由 `plugin.purge` 删行，避免出现「卸载后迁移对不上」的库。
- **CSP**：渲染层插件包从 `plugin://` 加载 `<script type="module">` 需要在 CSP 里放行 `plugin:`；找不到桥时给出明确报错而不是白屏。
- **类型检查**：源码 import 不变，`typecheck` 仍能发现插件用错 core API；`@host/**` 只存在于构建产物里。
