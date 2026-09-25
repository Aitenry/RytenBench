import { ElectronAPI } from '@electron-toolkit/preload'
import { HarnessTopicRow, HarnessDialogueRow } from '../main/database/mapper/harness'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'
import type {
  PaginatedResult,
  StructuredMessage,
  ToolInfo,
  QueuedMessageView
} from '../renderer/resource/types/window'
import type { StartMemoryAgentResult } from '../main/harness/runtime/memory-agent'
import type { FileChangeView, FileChangeContent } from '../main/workspace/file-history'
import type { WorkspaceFsChange } from '../main/workspace/watcher'
import type { PluginListEntry } from '../shared/plugin/types'

interface HarnessOptions {
  tools?: string[]
  images?: string[]
  documents?: { fileName: string; filePath: string }[]
}

/** 后台子代理会话行（顶部栏列表视图） */
interface SubagentSessionRowView {
  id: string
  name: string
  label: string
  status: 'running' | 'idle'
  queuedMessages: number
  createdAt: number
  lastRunAt?: number
  lastStatus?: 'completed' | 'failed' | 'killed'
}

/** 后台子代理会话输出视图（点开查看结果） */
interface SubagentSessionOutputView {
  text: string
  status: 'running' | 'idle'
  lastStatus?: 'completed' | 'failed' | 'killed'
  /** 启动时的原始任务指令（弹窗顶部展示） */
  prompt: string
}

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
  harness: {
    sendMessage: (
      message: string,
      options?: HarnessOptions & { providerId?: number }
    ) => Promise<StructuredMessage[]>
    startMessageStream: (
      message: string,
      options?: HarnessOptions & { topicId?: number; providerId?: number; messageId?: string }
    ) => void
    getTools: () => Promise<ToolInfo[]>
    selectSkillsDirectory: () => Promise<string | null>
    listSkills: () => Promise<{ id: string; name: string; description: string }[]>
    onStreamChunk: (callback: (chunk: StructuredMessage) => void) => () => void
    onStreamDone: (
      callback: (result: {
        topicId: number
        userDialogueId?: number
        assistantDialogueId?: number
        segments?: { messageId: string; dialogueId?: number }[]
        /** 本轮终局标记（最终答复边界 + 目标是否收口，见 main/harness/service/answer-boundary.ts） */
        turnFinal?: {
          settled: boolean
          goalRound: boolean
          round?: number
          goalClosed?: boolean
          goalWillContinue?: boolean
          answerFrom: number | null
          answerBlocks: number
        }
      }) => void
    ) => () => void
    // ── 生成中的插话队列 ────────────────────────────────────────────────
    /** 生成中发消息：主进程裁决——有回合在跑则入队，否则直接开新一轮 */
    enqueueMessage: (payload: {
      topicId: number
      text: string
      attachments?: {
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    }) => Promise<{ queued: boolean }>
    listQueuedMessages: (topicId: number) => Promise<QueuedMessageView[]>
    removeQueuedMessage: (topicId: number, itemId: string) => Promise<boolean>
    updateQueuedMessage: (topicId: number, itemId: string, text: string) => Promise<boolean>
    /** 立即插话：把这条排队消息注入正在运行的回合 */
    steerQueuedMessage: (topicId: number, itemId: string) => Promise<{ accepted: boolean }>
    onQueueUpdated: (
      callback: (data: { topicId: number; queue: QueuedMessageView[] }) => void
    ) => () => void
    onQueueSteered: (
      callback: (data: { topicId: number; itemId: string; text: string }) => void
    ) => () => void
    // 后台子代理会话（顶部栏列表）
    listAgents: (topicId: number) => Promise<SubagentSessionRowView[]>
    agentOutput: (
      topicId: number,
      agentId: string
    ) => Promise<SubagentSessionOutputView | undefined>
    /** 存入记忆：起一个后台记忆整理子代理（自己总结后写入 Mnemon），立即返回 */
    startMemoryAgent: (payload: {
      topicId: number
      answer: string
      dialogueId?: number
      providerId?: number
    }) => Promise<StartMemoryAgentResult>
    onAgentsUpdated: (
      callback: (data: { topicId: number; rows: SubagentSessionRowView[] }) => void
    ) => () => void
    /**
     * 文档被聊天工具修改/删除（首页编辑器据此同步，防覆盖工具写入）。
     * 消费方是 home 插件的 DocEditorPane——**跨插件订阅**：harness 的 preload 命名空间
     * 迁移时要一并处理（见 test/plugin-coupling-notes.md）。
     */
    onDocChanged: (
      callback: (data: { docId: number; action: 'updated' | 'deleted' }) => void
    ) => () => void
    /** 监听/停止监听某 agent 的输出推送（打开弹窗 watch，关闭取消） */
    watchAgentOutput: (topicId: number, agentId: string, watch: boolean) => void
    /** 后端推送：agent 输出有更新（运行中增量 / 终态最终输出），弹窗据此自动刷新 */
    onAgentOutputUpdated: (
      callback: (data: {
        topicId: number
        agentId: string
        output: SubagentSessionOutputView
      }) => void
    ) => () => void
    // 话题管理
    getAllTopics: (workspaceId: number) => Promise<HarnessTopicRow[]>
    getAllTopicsPaginated: (
      page: number,
      pageSize: number
    ) => Promise<PaginatedResult<HarnessTopicRow>>
    getTopicById: (id: number) => Promise<HarnessTopicRow[]>
    createTopic: (title: string, model?: string, selectedTools?: string) => Promise<number>
    updateTopic: (
      id: number,
      updates: Partial<Pick<HarnessTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => Promise<boolean>
    deleteTopic: (id: number) => Promise<boolean>
    // 消息管理
    getDialoguesByTopic: (topicId: number) => Promise<HarnessDialogueRow[]>
    getDialoguesByTopicPaginated: (
      topicId: number,
      page: number,
      pageSize: number
    ) => Promise<PaginatedResult<HarnessDialogueRow>>
    addDialogue: (dialogue: Omit<HarnessDialogueRow, 'id' | 'created_at'>) => Promise<number>
    deleteDialoguesByTopic: (topicId: number) => Promise<boolean>
    /** 工具结果按需读取（卡片点开 ls/glob/grep/execute 详情时；未保存返回 null） */
    getToolOutput: (topicId: number, callId: string) => Promise<string | null>
    /** 按虚拟路径读取文本文件（卡片「打开文件」；工作区与记忆挂载都可读） */
    readVirtualFile: (virtualPath: string) => Promise<{ content: string } | { error: string }>
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
  }
  workspace: {
    listDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
    readFile: (filePath: string) => Promise<string>
    saveFile: (filePath: string, content: string) => Promise<boolean>
    /** 当前工作区待审查的文件改动 */
    pendingChanges: () => Promise<FileChangeView[]>
    /** 单个文件的改动历史（倒序，最新在前） */
    fileChanges: (filePath: string) => Promise<FileChangeView[]>
    /** 某次改动的前后正文（差异视图数据源） */
    changeContent: (id: number) => Promise<FileChangeContent | null>
    /** 审查：保留（清除待审查标记，磁盘不动） */
    keepChanges: (ids: number[]) => Promise<number>
    /** 审查：撤销到某次改动之前 */
    revertChange: (
      id: number
    ) => Promise<{ path: string; content: string | null } | { error: string }>
    /** 审查：把差异视图里取舍后的内容落盘并标记已保留 */
    applyReview: (filePath: string, content: string) => Promise<{ ok: true } | { error: string }>
    /** 磁盘变化推送（模型写入 / 命令执行 / 外部编辑器） */
    onFsChanged: (callback: (data: { changes: WorkspaceFsChange[] }) => void) => () => void
    /** 新增改动记录推送 */
    onChangeRecorded: (callback: (change: FileChangeView) => void) => () => void
    /** 改动审查状态变化推送 */
    onChangesUpdated: (
      callback: (data: { ids: number[]; status: string; path?: string; obsolete?: number }) => void
    ) => () => void
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
