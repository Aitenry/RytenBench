import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'
import type { PluginListEntry } from '../shared/plugin/types'
import { PLUGIN_CHANNEL_RE } from '../shared/plugin/protocol'

/**
 * 已启用插件通道白名单缓存（主进程权威注册表 + plugin-channels-updated 推送刷新）。
 * 仅作 preload 侧快速门控：真正权威校验在主进程（通道归属插件且插件已启用）。
 */
const enabledPluginChannels = new Set<string>()
const applyPluginChannels = (list: unknown): void => {
  enabledPluginChannels.clear()
  if (Array.isArray(list)) {
    for (const channel of list) {
      if (typeof channel === 'string') enabledPluginChannels.add(channel)
    }
  }
}

ipcRenderer.on('plugin-channels-updated', (_event, list: unknown) => {
  applyPluginChannels(list)
})

// 启动竞态修复：推送（含 did-finish-load 补推）晚于渲染层首帧，插件 Provider 在
// useEffect 里订阅事件通道时会撞上「白名单还没到」。preload 先于页面脚本执行，
// 这里同步取一次权威清单，保证首个 window.api.plugin.on(...) 就能拿到正确结果。
try {
  applyPluginChannels(ipcRenderer.sendSync('plugin-channels-sync'))
} catch {
  // 主进程入口尚未注册（异常启动路径）：退回纯推送模式
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

// Custom APIs for renderer
// 各插件的命名空间（music / planner / home 六个键 / harness 的 harness·agents·mainAgent·workspace）
// 已全部删除：改由插件自己的 src/plugins/<id>/renderer/api.ts 走通用桥
// window.api.plugin.invoke/on（通道 plugin:<命名空间>:*）。这里只剩 core 的外壳能力 + 通用桥。
const api = {
  file: {
    selectImageFile: (allowImages?: boolean) =>
      ipcRenderer.invoke('select-image-file', allowImages),
    selectTextFile: () =>
      ipcRenderer.invoke('select-text-file') as Promise<{
        fileName: string
        filePath: string
      } | null>,
    // 取剪贴板/拖拽 File 的真实磁盘路径；无对应磁盘文件（如从网页复制的图片）返回空串
    getPathForFile: (file: File) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  setting: {
    getLockScreenCode: () => ipcRenderer.invoke('lock-screen-code'),
    setLockScreenView: (open: boolean) => ipcRenderer.invoke('lock-screen-view', open)
  },
  providers: {
    getAll: () => ipcRenderer.invoke('provider-get-all') as Promise<LlmProviderConfig[]>,
    getById: (id: number) =>
      ipcRenderer.invoke('provider-get-by-id', id) as Promise<LlmProviderConfig | null>,
    getDefault: () =>
      ipcRenderer.invoke('provider-get-default') as Promise<LlmProviderConfig | null>,
    getEnabled: () => ipcRenderer.invoke('provider-get-enabled') as Promise<LlmProviderConfig[]>,
    create: (input: LlmProviderInput) =>
      ipcRenderer.invoke('provider-create', input) as Promise<number>,
    createBatch: (inputs: LlmProviderInput[]) =>
      ipcRenderer.invoke('provider-create-batch', inputs) as Promise<{
        created: number
        skipped: number
      }>,
    update: (id: number, updates: Partial<LlmProviderInput>) =>
      ipcRenderer.invoke('provider-update', id, updates) as Promise<boolean>,
    delete: (id: number) => ipcRenderer.invoke('provider-delete', id) as Promise<boolean>,
    deleteBatch: (ids: number[]) =>
      ipcRenderer.invoke('provider-delete-batch', ids) as Promise<number>,
    setDefault: (id: number) => ipcRenderer.invoke('provider-set-default', id) as Promise<boolean>,
    lookupProfile: (modelId: string) =>
      ipcRenderer.invoke('provider-lookup-profile', modelId) as Promise<Record<
        string,
        unknown
      > | null>,
    fetchModels: (
      providerType: string,
      baseUrl?: string,
      apiKey?: string
    ): Promise<{ id: string; metadata: Record<string, unknown> | null }[]> =>
      ipcRenderer.invoke('provider-fetch-models', providerType, baseUrl, apiKey),
    onChanged: (callback: () => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('providers-changed', handler)
      return () => {
        ipcRenderer.off('providers-changed', handler)
      }
    }
  },
  systemSettings: {
    getAll: () => ipcRenderer.invoke('system-settings-get-all') as Promise<SystemSettings>,
    update: (updates: Partial<SystemSettings>) =>
      ipcRenderer.invoke('system-settings-update', updates) as Promise<boolean>
  },
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,
    onMaximized: (callback: (maximized: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window-maximized', handler)
      return () => {
        ipcRenderer.off('window-maximized', handler)
      }
    }
  },
  mermaid: {
    preview: (svg: string) => ipcRenderer.invoke('mermaid-preview', svg) as Promise<void>
  },
  weather: {
    getCurrent: (force?: boolean) =>
      ipcRenderer.invoke('weather-get', force) as Promise<WeatherData>,
    onUpdate: (callback: (data: WeatherData) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: WeatherData): void => callback(data)
      ipcRenderer.on('weather-update', handler)
      return () => {
        ipcRenderer.off('weather-update', handler)
      }
    }
  },
  plugin: {
    list: () => ipcRenderer.invoke('plugins-list') as Promise<PluginListEntry[]>,
    setEnabled: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('plugins-set-enabled', id, enabled) as Promise<PluginListEntry[]>,
    install: () =>
      ipcRenderer.invoke('plugins-install') as Promise<{
        ok: boolean
        id?: string
        error?: string
      }>,
    uninstall: (id: string) =>
      ipcRenderer.invoke('plugins-uninstall', id) as Promise<PluginListEntry[]>,
    onStateChanged: (callback: () => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('plugin-state-changed', handler)
      return () => {
        ipcRenderer.off('plugin-state-changed', handler)
      }
    },
    /** 外部插件通道调用：前缀格式强校验；未注册通道由主进程抛错 */
    invoke: (channel: string, ...args: unknown[]) => {
      if (typeof channel !== 'string' || !PLUGIN_CHANNEL_RE.test(channel)) {
        throw new Error(`非法插件通道名: ${String(channel)}`)
      }
      return ipcRenderer.invoke(channel, ...args) as Promise<unknown>
    },
    /** 订阅外部插件事件通道：白名单缓存门控（主进程为准） */
    on: (channel: string, callback: (data: unknown) => void) => {
      if (typeof channel !== 'string' || !PLUGIN_CHANNEL_RE.test(channel)) {
        throw new Error(`非法插件通道名: ${String(channel)}`)
      }
      if (!enabledPluginChannels.has(channel)) {
        throw new Error(`插件通道未启用: ${channel}`)
      }
      const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data)
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.off(channel, handler)
      }
    }
  }
}

// 将特定的 API 暴露给渲染进程
const loadingAPI = {
  // 添加主窗口就绪监听
  onMainWindowReady: (callback: () => void) => ipcRenderer.on('main-window-ready', callback),

  // 如果需要，添加初始化完成通知
  notifyInitComplete: () => ipcRenderer.send('init-complete'),

  // 应用版本（加载页展示,替代 loading.html 硬编码版本号）
  getAppVersion: () => ipcRenderer.invoke('app-version') as Promise<string>,

  // 添加初始化进度监听
  onInitProgress: (
    callback: (
      event: Electron.IpcRendererEvent,
      data: {
        currentTask: string
        progress: number
        taskIndex: number
        totalTasks: number
      }
    ) => void
  ) => ipcRenderer.on('init-progress', callback),

  // 添加初始化完成监听
  onInitComplete: (callback: () => void) => ipcRenderer.on('init-complete', callback),

  // 添加初始化错误监听
  onInitError: (callback: (event: Electron.IpcRendererEvent, errorMessage: string) => void) =>
    ipcRenderer.on('init-error', callback)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('loading', loadingAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.loading = loadingAPI
}
