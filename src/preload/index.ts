import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { HarnessTopicRow, HarnessDialogueRow, WorkspaceRow } from '../main/database/mapper/harness'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { AgentConfigRow, AgentConfigInput } from '../main/database/mapper/agent'
import type { PaginatedResult as AgentPaginatedResult } from '../main/database/mapper/agent'
import type { TodoItem } from '../main/harness/runtime/todo'
import type { GoalView } from '../main/harness/runtime/goal'
import type { JobSnapshot } from '../main/harness/runtime/jobs'
import type { SubagentSessionRow } from '../main/harness/runtime/subagent-sessions'
import type { PendingQuestionView, AskAnswer } from '../main/harness/runtime/ask'
import type { QueuedMessageView } from '../main/harness/queue-store'
import type { FileChangeView, FileChangeContent } from '../main/workspace/file-history'
import type { WorkspaceFsChange } from '../main/workspace/watcher'

type AskAnswerItem = AskAnswer['answers'][number]
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

// 使用 Set 管理多个监听器，支持多会话并发流式输出
const streamChunkHandlers = new Set<(chunk: Record<string, unknown>) => void>()
const streamDoneHandlers = new Set<(result: { topicId: number }) => void>()
const streamErrorHandlers = new Set<(error: { error: string; topicId?: number }) => void>()

// 注册全局 IPC 监听器，分发到所有注册的回调
ipcRenderer.on('harness-stream-chunk', (_event, chunk) => {
  for (const handler of streamChunkHandlers) {
    handler(chunk)
  }
})

ipcRenderer.on('harness-stream-done', (_event, result) => {
  for (const handler of streamDoneHandlers) {
    handler(result)
  }
})

ipcRenderer.on('harness-stream-error', (_event, error) => {
  for (const handler of streamErrorHandlers) {
    handler(error)
  }
})

// Custom APIs for renderer
// home 插件的六个命名空间（todoItems / taskDependencies / docs / wikis / graph /
// nodePositions）已删除：改由插件自己的 src/plugins/home/renderer/api.ts 走通用桥
// window.api.plugin.invoke/on（通道 plugin:home:*）。
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
  harness: {
    sendMessage: (
      message: string,
      options?: {
        providerId?: number
      }
    ) => ipcRenderer.invoke('harness-send-message', message, options),
    startMessageStream: (
      message: string,
      options?: {
        topicId?: number
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
        /** 编辑并重发：改写这条已存在的用户消息行，而不是插入新行 */
        reuseUserDialogueId?: number
        /** 本轮首段助手消息的前端临时 id（插话会切段，主进程按段回传 dialogueId） */
        messageId?: string
      }
    ) => {
      ipcRenderer.send('harness-start-stream', message, options)
    },
    // ── 生成中的插话队列 ──────────────────────────────────────────────
    /** 生成中发消息：主进程裁决——有回合在跑则入队（queued=true），否则直接开新一轮 */
    enqueueMessage: (payload: {
      topicId: number
      text: string
      attachments?: {
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    }) => ipcRenderer.invoke('harness-queue-enqueue', payload) as Promise<{ queued: boolean }>,
    listQueuedMessages: (topicId: number) =>
      ipcRenderer.invoke('harness-queue-list', topicId) as Promise<QueuedMessageView[]>,
    removeQueuedMessage: (topicId: number, itemId: string) =>
      ipcRenderer.invoke('harness-queue-remove', { topicId, itemId }) as Promise<boolean>,
    updateQueuedMessage: (topicId: number, itemId: string, text: string) =>
      ipcRenderer.invoke('harness-queue-update', { topicId, itemId, text }) as Promise<boolean>,
    /** 立即插话：把这条排队消息注入正在运行的回合（下一个工具节点边界生效） */
    steerQueuedMessage: (topicId: number, itemId: string) =>
      ipcRenderer.invoke('harness-queue-steer', { topicId, itemId }) as Promise<{
        accepted: boolean
      }>,
    onQueueUpdated: (callback: (data: { topicId: number; queue: QueuedMessageView[] }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { topicId: number; queue: QueuedMessageView[] }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-queue-updated', listener)
      return () => {
        ipcRenderer.removeListener('harness-queue-updated', listener)
      }
    },
    onQueueSteered: (
      callback: (data: { topicId: number; itemId: string; text: string }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { topicId: number; itemId: string; text: string }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-queue-steered', listener)
      return () => {
        ipcRenderer.removeListener('harness-queue-steered', listener)
      }
    },
    getTools: () => ipcRenderer.invoke('harness-get-tools'),
    onStreamChunk: (callback: (chunk: Record<string, unknown>) => void) => {
      streamChunkHandlers.add(callback)
      return () => {
        streamChunkHandlers.delete(callback)
      }
    },
    onStreamDone: (
      callback: (result: {
        topicId: number
        userDialogueId?: number
        assistantDialogueId?: number
        /** 助手段落表（无插话时只有一段）：messageId 对应一段助手气泡 */
        segments?: { messageId: string; dialogueId?: number }[]
      }) => void
    ) => {
      streamDoneHandlers.add(callback)
      return () => {
        streamDoneHandlers.delete(callback)
      }
    },
    onStreamError: (callback: (error: { error: string; topicId?: number }) => void) => {
      streamErrorHandlers.add(callback)
      return () => {
        streamErrorHandlers.delete(callback)
      }
    },
    // 文档被聊天工具修改/删除（编辑器据此同步或提示,防覆盖工具写入）
    onDocChanged: (callback: (data: { docId: number; action: 'updated' | 'deleted' }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { docId: number; action: 'updated' | 'deleted' }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-doc-changed', listener)
      return () => {
        ipcRenderer.removeListener('harness-doc-changed', listener)
      }
    },
    getHarnessTodos: (topicId: number) => ipcRenderer.invoke('harness-todos-get', topicId),
    onHarnessTodosUpdated: (callback: (data: { topicId: number; todos: TodoItem[] }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { topicId: number; todos: TodoItem[] }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-todos-updated', listener)
      return () => {
        ipcRenderer.removeListener('harness-todos-updated', listener)
      }
    },
    // 目标系统（goal）
    getGoal: (topicId: number) => ipcRenderer.invoke('harness-goal-get', topicId),
    onGoalUpdated: (callback: (data: { topicId: number; goal: GoalView | null }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { topicId: number; goal: GoalView | null }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-goal-updated', listener)
      return () => {
        ipcRenderer.removeListener('harness-goal-updated', listener)
      }
    },
    // 后台任务系统（jobs）
    onJobsUpdated: (callback: (data: { topicId: number; jobs: JobSnapshot[] }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { topicId: number; jobs: JobSnapshot[] }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-jobs-updated', listener)
      return () => {
        ipcRenderer.removeListener('harness-jobs-updated', listener)
      }
    },
    // 后台子代理会话（顶部栏列表：进行中 > 已完成，点开查看结果）
    listAgents: (topicId: number) => ipcRenderer.invoke('harness-agents-list', topicId),
    agentOutput: (topicId: number, agentId: string) =>
      ipcRenderer.invoke('harness-agent-output', topicId, agentId),
    /**
     * 存入记忆：起一个后台「记忆整理」子代理，由它自己总结后写入 Mnemon，立即返回。
     * 进度与结果走顶部栏后台代理入口（onAgentsUpdated / agentOutput），不等它跑完。
     */
    startMemoryAgent: (payload: {
      topicId: number
      answer: string
      dialogueId?: number
      providerId?: number
    }) => ipcRenderer.invoke('harness-memory-agent-start', payload),
    onAgentsUpdated: (
      callback: (data: { topicId: number; rows: SubagentSessionRow[] }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { topicId: number; rows: SubagentSessionRow[] }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-agents-updated', listener)
      return () => {
        ipcRenderer.removeListener('harness-agents-updated', listener)
      }
    },
    watchAgentOutput: (topicId: number, agentId: string, watch: boolean) => {
      ipcRenderer.send('harness-agent-watch', topicId, agentId, watch)
    },
    onAgentOutputUpdated: (
      callback: (data: {
        topicId: number
        agentId: string
        output: {
          text: string
          status: 'running' | 'idle'
          lastStatus?: 'completed' | 'failed' | 'killed'
          prompt: string
        }
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: {
          topicId: number
          agentId: string
          output: {
            text: string
            status: 'running' | 'idle'
            lastStatus?: 'completed' | 'failed' | 'killed'
            prompt: string
          }
        }
      ): void => {
        callback(data)
      }
      ipcRenderer.on('harness-agent-output-updated', listener)
      return () => {
        ipcRenderer.removeListener('harness-agent-output-updated', listener)
      }
    },
    // 向用户提问（ask_user_question）
    onQuestionAsked: (callback: (pending: PendingQuestionView) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, pending: PendingQuestionView): void => {
        callback(pending)
      }
      ipcRenderer.on('harness-question-asked', listener)
      return () => {
        ipcRenderer.removeListener('harness-question-asked', listener)
      }
    },
    answerQuestion: (requestId: string, answers: AskAnswerItem[]) =>
      ipcRenderer.invoke('harness-question-answer', requestId, answers),
    getQuestion: (topicId: number) => ipcRenderer.invoke('harness-question-get', topicId),
    cancelStream: () => {
      ipcRenderer.send('harness-cancel-stream')
    },
    selectSkillsDirectory: () => ipcRenderer.invoke('harness-select-skills-directory'),
    selectWorkspace: () => ipcRenderer.invoke('harness-select-workspace') as Promise<string | null>,
    listSkills: () => ipcRenderer.invoke('harness-list-skills'),
    // 记忆管理（Mnemon 三层记忆）
    selectMemoryDirectory: () => ipcRenderer.invoke('harness-select-memory-directory'),
    // Mnemon 记忆系统
    mnemonSnapshot: () => ipcRenderer.invoke('mnemon-snapshot'),
    mnemonRuntimeMutate: (request: {
      action: string
      target: string
      content?: string
      old_text?: string
      importance?: string
    }) => ipcRenderer.invoke('mnemon-runtime-mutate', request),
    mnemonBodies: () => ipcRenderer.invoke('mnemon-bodies'),
    mnemonBodyCreate: (name: string, description: string) =>
      ipcRenderer.invoke('mnemon-body-create', { name, description }),
    mnemonBodyUpdate: (
      id: string,
      request: { name?: string; description?: string; active?: boolean }
    ) => ipcRenderer.invoke('mnemon-body-update', id, request),
    mnemonBodyList: (memoryBodyIds?: string[]) =>
      ipcRenderer.invoke('mnemon-body-list', memoryBodyIds),
    mnemonDocumentSnapshot: () => ipcRenderer.invoke('mnemon-document-snapshot'),
    // 工作区管理
    getAllWorkspaces: () => ipcRenderer.invoke('workspace-get-all') as Promise<WorkspaceRow[]>,
    createWorkspace: (name: string, path: string) =>
      ipcRenderer.invoke('workspace-create', name, path) as Promise<number>,
    updateWorkspace: (id: number, updates: { name: string }) =>
      ipcRenderer.invoke('workspace-update', id, updates) as Promise<boolean>,
    deleteWorkspace: (id: number) => ipcRenderer.invoke('workspace-delete', id) as Promise<boolean>,
    // 话题管理
    getAllTopics: (workspaceId: number) => ipcRenderer.invoke('harness-topic-get-all', workspaceId),
    getAllTopicsPaginated: (workspaceId: number, page: number, pageSize: number) =>
      ipcRenderer.invoke('harness-topic-get-paginated', workspaceId, page, pageSize),
    getTopicById: (id: number) => ipcRenderer.invoke('harness-topic-get-by-id', id),
    createTopic: (workspaceId: number, title: string, model?: string, selectedTools?: string) =>
      ipcRenderer.invoke('harness-topic-create', workspaceId, title, model, selectedTools),
    updateTopic: (
      id: number,
      updates: Partial<Pick<HarnessTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => ipcRenderer.invoke('harness-topic-update', id, updates),
    deleteTopic: (id: number) => ipcRenderer.invoke('harness-topic-delete', id),
    // 消息管理
    getDialoguesByTopic: (topicId: number) =>
      ipcRenderer.invoke('harness-dialogue-get-by-topic', topicId),
    getDialoguesByTopicPaginated: (topicId: number, page: number, pageSize: number) =>
      ipcRenderer.invoke('harness-dialogue-get-by-topic-paginated', topicId, page, pageSize),
    addDialogue: (dialogue: Omit<HarnessDialogueRow, 'id' | 'created_at'>) =>
      ipcRenderer.invoke('harness-dialogue-add', dialogue),
    deleteDialoguesByTopic: (topicId: number) =>
      ipcRenderer.invoke('harness-dialogue-delete-by-topic', topicId),
    deleteDialogue: (id: number) => ipcRenderer.invoke('harness-dialogue-delete', id),
    // 对话真实用量（一条助手回复一行）
    getUsageByTopic: (topicId: number) => ipcRenderer.invoke('harness-usage-get-by-topic', topicId),
    // 工具结果按需读取：内置工具（read_file/execute 等）的结果不再随流下发，
    // 聊天卡片点开时才取（ls/glob/grep/execute 的详情按 topicId+callId 取回）
    getToolOutput: (topicId: number, callId: string) =>
      ipcRenderer.invoke('harness-tool-output-get', topicId, callId) as Promise<string | null>,
    // 按虚拟路径读取文本文件（卡片「打开文件」；工作区与记忆挂载都可读）
    readVirtualFile: (virtualPath: string) =>
      ipcRenderer.invoke('harness-vfs-read', virtualPath) as Promise<
        { content: string } | { error: string }
      >
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
  agents: {
    getAll: (workspaceId: number) =>
      ipcRenderer.invoke('agent-get-all', workspaceId) as Promise<AgentConfigRow[]>,
    getPaginated: (workspaceId: number, page: number, pageSize: number) =>
      ipcRenderer.invoke('agent-get-paginated', workspaceId, page, pageSize) as Promise<
        AgentPaginatedResult<AgentConfigRow>
      >,
    getById: (workspaceId: number, id: number) =>
      ipcRenderer.invoke('agent-get-by-id', workspaceId, id) as Promise<AgentConfigRow | null>,
    create: (input: AgentConfigInput) =>
      ipcRenderer.invoke('agent-create', input) as Promise<number>,
    update: (workspaceId: number, id: number, updates: Partial<AgentConfigInput>) =>
      ipcRenderer.invoke('agent-update', workspaceId, id, updates) as Promise<boolean>,
    delete: (workspaceId: number, id: number) =>
      ipcRenderer.invoke('agent-delete', workspaceId, id) as Promise<boolean>
  },
  mainAgent: {
    get: () =>
      ipcRenderer.invoke('main-agent-get') as Promise<{ tools: string[]; skills: string[] }>,
    update: (config: { tools: string[]; skills: string[] }) =>
      ipcRenderer.invoke('main-agent-update', config) as Promise<boolean>
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
  workspace: {
    listDir: (dirPath: string) =>
      ipcRenderer.invoke('workspace-list-dir', dirPath) as Promise<
        { name: string; isDirectory: boolean; path: string }[]
      >,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('workspace-read-file', filePath) as Promise<string>,
    saveFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('workspace-save-file', filePath, content) as Promise<boolean>,
    // --- 文件改动史（可追溯 / 可回溯） ---
    /** 当前工作区待审查的改动 */
    pendingChanges: () =>
      ipcRenderer.invoke('workspace-changes-pending') as Promise<FileChangeView[]>,
    /** 单个文件的改动历史（倒序） */
    fileChanges: (filePath: string) =>
      ipcRenderer.invoke('workspace-changes-file', filePath) as Promise<FileChangeView[]>,
    /** 某次改动的前后正文 */
    changeContent: (id: number) =>
      ipcRenderer.invoke('workspace-change-content', id) as Promise<FileChangeContent | null>,
    /** 审查：保留（清除待审查标记） */
    keepChanges: (ids: number[]) =>
      ipcRenderer.invoke('workspace-change-keep', ids) as Promise<number>,
    /** 审查：撤销到某次改动之前 */
    revertChange: (id: number) =>
      ipcRenderer.invoke('workspace-change-revert', id) as Promise<
        { path: string; content: string | null } | { error: string }
      >,
    /** 审查：把差异视图里取舍后的内容落盘并标记已保留 */
    applyReview: (filePath: string, content: string) =>
      ipcRenderer.invoke('workspace-apply-review', filePath, content) as Promise<
        { ok: true } | { error: string }
      >,
    /** 磁盘变化（模型写入 / 命令执行 / 外部编辑器）：刷新资源管理器与已打开页签 */
    onFsChanged: (callback: (data: { changes: WorkspaceFsChange[] }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { changes: WorkspaceFsChange[] }
      ): void => callback(data)
      ipcRenderer.on('workspace-fs-changed', handler)
      return () => {
        ipcRenderer.off('workspace-fs-changed', handler)
      }
    },
    /** 新增一条改动记录（模型改动了某个文件） */
    onChangeRecorded: (callback: (change: FileChangeView) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, change: FileChangeView): void =>
        callback(change)
      ipcRenderer.on('workspace-change-recorded', handler)
      return () => {
        ipcRenderer.off('workspace-change-recorded', handler)
      }
    },
    /** 改动审查状态变化（保留 / 撤销） */
    onChangesUpdated: (
      callback: (data: { ids: number[]; status: string; path?: string; obsolete?: number }) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { ids: number[]; status: string; path?: string; obsolete?: number }
      ): void => callback(data)
      ipcRenderer.on('workspace-changes-updated', handler)
      return () => {
        ipcRenderer.off('workspace-changes-updated', handler)
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
