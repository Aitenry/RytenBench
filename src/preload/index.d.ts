import { ElectronAPI } from '@electron-toolkit/preload'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'
import type { PluginListEntry } from '../shared/plugin/types'

/**
 * preload 暴露给渲染层的 core 能力（`window.api`）。
 *
 * 各插件的命名空间（music / planner / home 的六个键 / harness 的
 * harness·agents·mainAgent·workspace）已全部删除——插件渲染层经自己目录下的
 * `renderer/api.ts` 走**通用桥** `window.api.plugin.invoke/on`（通道 `plugin:<ns>:*`），
 * 类型由插件自己的 `shared/types.ts` 提供。这里只声明 core 的外壳能力。
 */
interface Api {
  file: {
    selectImageFile: (
      allowImages?: boolean
    ) => Promise<{ dataUrl: string; fileName: string; isImage: boolean } | null>
    selectTextFile: () => Promise<{ fileName: string; filePath: string } | null>
    /** 取剪贴板/拖拽 File 的真实磁盘路径；无磁盘文件来源（如网页复制的图片）返回空串 */
    getPathForFile: (file: File) => string
  }
  setting: {
    getLockScreenCode: () => Promise<{ code: string; view: boolean }>
    setLockScreenView: (open: boolean) => Promise<void>
  }
  providers: {
    getAll: () => Promise<LlmProviderConfig[]>
    getById: (id: number) => Promise<LlmProviderConfig | null>
    getDefault: () => Promise<LlmProviderConfig | null>
    getEnabled: () => Promise<LlmProviderConfig[]>
    create: (input: LlmProviderInput) => Promise<number>
    createBatch: (inputs: LlmProviderInput[]) => Promise<{
      created: number
      skipped: number
    }>
    update: (id: number, updates: Partial<LlmProviderInput>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    deleteBatch: (ids: number[]) => Promise<number>
    setDefault: (id: number) => Promise<boolean>
    lookupProfile: (modelId: string) => Promise<Record<string, unknown> | null>
    fetchModels: (
      providerType: string,
      baseUrl?: string,
      apiKey?: string
    ) => Promise<{ id: string; metadata: Record<string, unknown> | null }[]>
    /** 供应商配置变化推送（启用/停用/改默认后） */
    onChanged: (callback: () => void) => () => void
  }
  systemSettings: {
    getAll: () => Promise<SystemSettings>
    update: (updates: Partial<SystemSettings>) => Promise<boolean>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximized: (callback: (maximized: boolean) => void) => () => void
  }
  weather: {
    getCurrent: (force?: boolean) => Promise<WeatherData>
    onUpdate: (callback: (data: WeatherData) => void) => () => void
  }
  plugin: {
    /** 已发现插件与启用态（内置目录 + 外部扫描合并） */
    list: () => Promise<PluginListEntry[]>
    /** 启用/停用插件（写入持久化并广播，渲染层即时装载/卸载） */
    setEnabled: (id: string, enabled: boolean) => Promise<PluginListEntry[]>
    /** 安装外部插件（弹目录选择；返回 ok/error） */
    install: () => Promise<{ ok: boolean; id?: string; error?: string }>
    /** 卸载外部插件（删除用户插件目录，返回最新列表） */
    uninstall: (id: string) => Promise<PluginListEntry[]>
    /** 插件启用态变化推送（含安装/卸载） */
    onStateChanged: (callback: () => void) => () => void
    /** 外部插件通道调用（plugin:<id>: 前缀；经主进程权威校验） */
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    /** 订阅外部插件事件通道（白名单缓存门控） */
    on: (channel: string, callback: (data: unknown) => void) => () => void
    /**
     * 只读诊断：主进程里各插件贡献的宿主生命周期钩子（标签）+ 工作区事件订阅数。
     * 用于验证「停用插件后 app.preload / app.before-quit / app.renderer-memory-dump
     * 与工作区订阅都不再存在」（见 src/main/ipc/misc.ts）。
     */
    lifecycleHooks: () => Promise<{
      preload: string[]
      beforeQuit: string[]
      memoryDump: string[]
      workspaceListeners: number
    }>
  }
  mermaid: {
    /** 全屏窗口预览 SVG（可拖拽/缩放画布） */
    preview: (svg: string) => Promise<void>
  }
}

interface WeatherData {
  location: string
  current: {
    temp: string
    weatherCode: number
    weatherDesc: string
    windSpeed: string
    humidity: number
    apparentTemp: string
  }
  daily: {
    label: string
    weatherDesc: string
    tempMax: string
    tempMin: string
    precipProb: number
  }[]
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
