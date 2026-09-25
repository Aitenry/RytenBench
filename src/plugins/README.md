# 插件目录契约（src/plugins/<id>/）

> 目标：**每个功能（内容）是一个自包含插件**——它的界面、IPC、数据表、业务服务、词条都在同一个目录里，
> 而不是按「层」散落在 `src/main/ipc`、`src/main/database`、`src/main/harness`、`src/renderer/src/i18n` 等处。
> core 只保留外壳（窗口/托盘/主题/i18n 内核）、插件宿主、DB 引擎（PGlite + drizzle 迁移器）、
> 模型 Provider 与 preload 通用桥。

## 目录形态

```
src/plugins/<id>/
  manifest.ts            三端共用的清单（id/name/version/description/icon/routes/menu/inject/provide）
  main/
    index.ts             主进程入口：export install(ctx: MainPluginContext): void | (() => void)
    ipc.ts               本插件的 IPC 通道（交给 ctx.registerIpc）
    db/schema.ts         本插件的 drizzle 表（由 core 的 database/schema/index.ts 汇总，供迁移与查询）
    db/mapper.ts         本插件的行类型与查询（统一走 withOrm）
    services/**.ts       本插件的业务服务（可被本插件的 ipc 与别的插件经 provide/inject 使用）
  renderer/
    plugin.tsx           渲染层入口：export default { manifest, install(ctx) }
    api.ts               本插件主进程通道的薄封装（window.api.plugin.invoke + 类型）
    Index.tsx            路由页面（懒加载目标）
    components/**        本插件的组件
    hooks/** utils/**    本插件的前端逻辑
  shared/**.ts           主/渲染共用的类型（跨进程 DTO，不得 import react/electron）
  locales/index.ts       本插件词条：{ 'zh-CN': {...}, 'en-US': {...} }，renderer install 时注册
```

## 主进程契约（内置 = 外部，同一套）

```ts
import type { MainPluginContext } from '../../main/plugins/context'

export function install(ctx: MainPluginContext): void | (() => void) {
  ctx.registerIpc({
    'plugin:music:get-folders': async () => {
      /* ... */
    }
  })
  // 主进程 → 渲染层的事件通道（只 send、无 handler）：必须声明才进 preload 白名单
  ctx.registerEvent('plugin:music:play-track')
  ctx.effect(() => {
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  })
}
```

- **通道命名空间**：`plugin:<命名空间>:<channel>`，命名空间 = 插件 id 去掉开头的 `plugin.` 段
  （`music` → `plugin:music:*`；外部插件 `plugin.demo` → `plugin:demo:*`）。宿主权威校验，
  重复占用报错。渲染层经 preload 通用桥 `window.api.plugin.invoke/on` 调用。
- **事件通道**：`ctx.registerEvent('plugin:<ns>:<channel>')` 声明只有发送方的通道
  （`webContents.send` 用）。preload 的白名单只收录插件**声明过**的通道，
  不声明则渲染层 `window.api.plugin.on(...)` 抛「插件通道未启用」。
  preload 启动时会用一次同步 IPC（`plugin-channels-sync`）把权威清单取回来，
  之后启停变化由 `pushPluginChannels()` 增量刷新——插件 Provider 在 useEffect 里的
  首个订阅因此不会撞上「推送还没到」的竞态。
- **可逆装配**：`ctx.effect` 的效果按 LIFO 回滚；`install` 返回的 dispose 最先执行；
  IPC 通道随 `ctx.dispose()` 全部摘除。停用插件 = 卸载它的全部内容。
- 插件的主进程代码可以照常 `import` core 模块（`@main/database/orm`、settings、workspace 等）；
  **禁止**再把通道登记进 `src/main/ipc/index.ts`（那是旧路径，只留给尚未迁移的插件）。

## 渲染层契约

```tsx
import manifest from '../manifest'
import { installMusicRenderer } from './install'

export default {
  manifest,
  install(ctx) {
    ctx.use('route').register({ path: '/music', skeleton: 'music', load: () => import('./Index') })
    ctx
      .use('menu')
      .register({ key: 'music', labelKey: 'shell.menu.music', icon: <RiDiscLine />, order: 30 })
    ctx.use('settingsSection').register({ tabKey: 'music' /* ... */ })
    ctx.use('appProvider').register({ Provider: AudioProvider, order: 20 })
    ctx.use('bottomBar').register({
      id: 'music',
      order: 10,
      isVisible: () => Boolean(getCurrentTrack()),
      subscribe: subscribeCurrentTrack,
      Tab: MusicBottomTab,
      Popup: MusicMiniPlayer
    })
    ctx.use('i18n').addResources('translation', locales) // 词条随插件注册，停用即消失
  }
}
```

- 挂载点（宿主上下文键）：`route` / `menu` / `settingsSection` / `appProvider` / `globalComponent` /
  `bottomBar` / `api` / `i18n` / `events` / `storage`。**插件自己的 Provider 与状态也随插件注册**
  （例如音乐播放器的 `AudioProvider`），不得再放进 `App.tsx` 的 core Provider 层或让外壳组件直接 import。
- 外壳组件只认注册表：`MainRoutes` / `CustomFrame` / `BottomBar` / `SettingsModal` / `AppContent`。
  如果某个外壳组件需要插件的数据（例：底栏的音乐条目），就给它加一个**插槽**，让插件来填。
- **`bottomBar` 插槽**（参考实现）：注册项是 `{ id, order, isVisible(), subscribe?, Tab, Popup }`。
  宿主在每次渲染时读 `isVisible()` 决定该项是否参与轮播，插件用 `subscribe(onChange)` 通知
  宿主重渲染；`Tab` 是底栏那一行，`Popup` 是悬停弹层。插件状态放模块级可订阅快照里
  （见 `src/plugins/music/renderer/audio/store.ts`），外壳因此完全不 import 插件模块。

## 装配入口（三份注册表，都在 core）

| 位置                                      | 内容                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `src/plugins/manifests.ts`                | 只 import 各插件的 `manifest.ts`（主/渲染共用，无 react/electron 依赖） |
| `src/main/plugins/builtin.ts`             | 内置插件主模块：`{ <id>: await import('./<id>/main') }`                 |
| `src/renderer/src/plugin-host/builtin.ts` | 内置插件渲染模块：`[home, planner, music, harness]` 显式导入            |

## 迁移状态

- [x] 宿主与注册表（渲染层 + 主进程 + 外部插件机制 + 设置面板）
- [x] music（参考实现：main/db/renderer/locales/preload 通道全量收进 src/plugins/music；
      通道 `plugin:music:*`、底栏 `bottomBar` 插槽、词条随插件注册）
- [x] planner（main/db/renderer/locales/preload 通道全量收进 src/plugins/planner；
      10 个 `plugin:planner:*` 通道、无事件通道、词条随插件注册、
      `window.api.planner` 命名空间删除并由 `renderer/api.ts` 的 `plannerApi` 取代）
- [x] home（含 graph / document / wiki / todo 与知识图谱组件）：main/db/renderer/shared/locales 全量收进
      `src/plugins/home/**`；preload 的六个命名空间（`todoItems` / `taskDependencies` / `docs` / `wikis` /
      `graph` / `nodePositions`）删除，渲染层改用 `renderer/api.ts` 的 `homeApi`（通用桥 `plugin:home:*`）；
      知识图谱视图仍由 HomeView `React.lazy` 按需加载（2.7MB chunk 不进外壳）
- [x] harness 主进程（含 runtime 32 / service 7 / tools 3 / workspace 文件历史 / 5 个 db schema+mapper /
      智能体配置）：`src/main/harness/**`、`src/main/workspace/**`、`ipc/{harness,harness-topic,mnemon,workspace}.ts`
      全量收进 `src/plugins/harness/main/**`；63 个 `plugin:harness:*` 通道（含从 core 组移出的 9 个
      `workspace-*`：实测只有 harness 渲染层在用）、15 个事件通道逐个 `ctx.registerEvent` 声明；
      `provider.ts` 只留模型 Provider（8 个 agent-* / main-agent-* 归位 harness）；
      启动接线（快照目录 + 工作区文件监听）搬进 `install(ctx)` 的 `ctx.effect`（停用即不再配置）
- [x] harness 渲染层：`src/renderer/src/plugins/harness/**`（58 个文件）→ `src/plugins/harness/renderer/**`；
      `types/harness.ts` 拆进 `shared/types.ts`（跨进程 DTO）+ `renderer/types.ts`（纯前端模型）；
      词条 `harness`/`agentSettings`/`memorySettings`/`skillsSettings` 收进 `locales/**` 并随插件注册；
      preload 五个命名空间（`harness` / `agents` / `mainAgent` / `mnemon` / `workspace`）删除，
      渲染层改用 `renderer/api.ts` 的 `harnessApi`（通用桥 `plugin:harness:*`）；
      「文档被 AI 改写」不再由 home 直接订阅 harness 通道，改由 harness 桥接成宿主事件总线的
      `doc:changed`（见 test/plugin-coupling-notes.md §6）；harness 视图仍是独立懒加载 chunk
- [ ] core 收尾：删除旧路径（`src/main/ipc/index.ts` 的 builtinIpcGroups、ipc-capture、preload 各插件命名空间、
      6 处过渡期 core → 插件 import）

每个插件迁移完成后：`pnpm run typecheck`（node+web）→ `node test/verify-*.mjs` →
`node test/verify-plugin-host.mjs`（真实 Electron + CDP）→ 英文 conventional commit。
