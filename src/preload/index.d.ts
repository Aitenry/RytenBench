import { ElectronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'
import type {
  TaskDependencyRow,
  TaskWithDependencies
} from '../main/database/mapper/todo_dependencies'
import type {
  PlannerTaskRow,
  PlannerTreeNode,
  PlannerDependencyRow
} from '../main/database/mapper/planner'
import {
  DocRow,
  DocListItem,
  DocWithContent,
  PaginatedResult
} from '../main/database/mapper/document'
import { WikiRow, WikiDirectoryRow } from '../main/database/mapper/wiki'
import { HarnessTopicRow, HarnessDialogueRow } from '../main/database/mapper/harness'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'
import type {
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
  todoItems: {
    getById: (id: number) => Promise<TodoItemRow[]>
    getByTitle: (title: string) => Promise<TodoItemRow[]>
    getByPriority: (priority: number) => Promise<TodoItemRow[]>
    getByCompletedStatus: (status: number | boolean) => Promise<TodoItemRow[]>
    getAll: () => Promise<TodoItemRow[]>
    getAllPaginated: (page?: number, pageSize?: number) => Promise<PaginatedResult<TodoItemRow>>
    getByDueDate: (dueDate: string) => Promise<TodoItemRow[]>
    add: (todoItem: Omit<TodoItemRow, 'id'>) => Promise<number>
    update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
  }
  taskDependencies: {
    add: (taskId: number, dependsOnTaskId: number) => Promise<number>
    delete: (taskId: number, dependsOnTaskId: number) => Promise<boolean>
    getAll: () => Promise<TaskDependencyRow[]>
    getTasksWithDeps: () => Promise<TaskWithDependencies[]>
  }
  planner: {
    tasks: {
      getAll: () => Promise<PlannerTaskRow[]>
      getById: (id: number) => Promise<PlannerTaskRow | null>
      getTree: () => Promise<PlannerTreeNode[]>
      add: (task: Omit<PlannerTaskRow, 'id' | 'created_at' | 'updated_at'>) => Promise<number>
      update: (
        id: number,
        updates: Partial<Omit<PlannerTaskRow, 'id' | 'created_at'>>
      ) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
      reorder: (
        orderList: { id: number; sort_order: number; parent_id: number | null }[]
      ) => Promise<boolean>
    }
    deps: {
      add: (taskId: number, dependsOnTaskId: number) => Promise<number>
      delete: (taskId: number, dependsOnTaskId: number) => Promise<boolean>
      getAll: () => Promise<PlannerDependencyRow[]>
    }
  }
  docs: {
    getById: (id: number) => Promise<DocWithContent | null>
    getAll: (
      page?: number,
      pageSize?: number,
      excludeWikiId?: number,
      search?: string
    ) => Promise<PaginatedResult<DocListItem>>
    getPage: (
      query: string,
      page?: number,
      pageSize?: number
    ) => Promise<PaginatedResult<DocListItem>>
    add: (
      doc: Omit<DocRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
        image?: string | null
        content?: string | null
      }
    ) => Promise<number>
    update: (
      id: number,
      updates: Partial<Omit<DocRow, 'id' | 'created_at'>> & {
        image?: string | null
        content?: string | null
      }
    ) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    deleteByTimeRange: (startTime: string, endTime: string) => Promise<number>
    importDocument: () => Promise<{ title: string; content: string } | null>
    exportDocument: (id: number) => Promise<boolean>
  }
  wikis: {
    getById: (id: number) => Promise<WikiRow | null>
    getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<WikiRow>>
    add: (wiki: Omit<WikiRow, 'id' | 'doc_count' | 'created_at' | 'updated_at'>) => Promise<number>
    update: (
      id: number,
      updates: Partial<Omit<WikiRow, 'id' | 'doc_count' | 'created_at'>>
    ) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    getDirectories: (wikiId: number) => Promise<WikiDirectoryRow[]>
    addDirectory: (
      directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>
    ) => Promise<number>
    updateDirectory: (
      id: number,
      updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>
    ) => Promise<boolean>
    deleteDirectory: (id: number) => Promise<boolean>
    getNotesByDirectory: (directoryId: number) => Promise<{ doc_id: number; sort_order: number }[]>
    addNoteToDirectory: (directoryId: number, noteId: number, sortOrder?: number) => Promise<number>
    removeNoteFromDirectory: (directoryId: number, noteId: number) => Promise<boolean>
    getDirectoriesByNote: (noteId: number) => Promise<WikiDirectoryRow[]>
  }
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
  nodePositions: {
    getAll: () => Promise<{ node_id: string; x: number; y: number; updated_at: string }[]>
    save: (nodeId: string, x: number, y: number) => Promise<void>
    saveBatch: (positions: { node_id: string; x: number; y: number }[]) => Promise<void>
    delete: (nodeId: string) => Promise<boolean>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximized: (callback: (maximized: boolean) => void) => () => void
  }
  music: {
    selectDirectory: () => Promise<string | null>
    getFolders: () => Promise<
      {
        id: string
        path: string
        name: string
        description: string
        track_count: number
        coverDataUrl: string | null
        created_at: string
        updated_at: string
      }[]
    >
    getTracks: (folderId: string) => Promise<
      {
        id: string
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        liked: boolean
        coverDataUrl: string | null
      }[]
    >
    deleteFolder: (folderId: string) => Promise<void>
    createFolder: (
      name: string,
      description?: string
    ) => Promise<{
      id: string
      path: string
      name: string
      description: string
      track_count: number
      coverDataUrl: string | null
      created_at: string
      updated_at: string
    }>
    updateFolderDescription: (folderId: string, description: string | null) => Promise<void>
    updateFolderCover: (folderId: string) => Promise<string | null>
    saveFolderCover: (folderId: string, coverDataUrl: string | null) => Promise<void>
    selectImage: () => Promise<string | null>
    updateFolder: (
      folderId: string,
      fields: { name?: string; description?: string | null }
    ) => Promise<void>
    addTracks: (folderId: string) => Promise<{
      added: {
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        coverDataUrl: string | null
      }[]
      skipped: string[]
    } | null>
    updateTrack: (
      trackId: number,
      fields: { title?: string; artist?: string; album?: string }
    ) => Promise<void>
    updateTrackCover: (trackId: number) => Promise<string | null>
    deleteTrack: (trackId: number) => Promise<void>
    readFile: (filePath: string) => Promise<ArrayBuffer>
    toggleLike: (trackId: number) => Promise<boolean>
    updateLastPlayed: (trackId: number) => Promise<void>
    getLikedTracks: () => Promise<
      {
        id: string
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        liked: boolean
        coverDataUrl: string | null
      }[]
    >
    getRecentlyPlayed: () => Promise<
      {
        id: string
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        liked: boolean
        coverDataUrl: string | null
      }[]
    >
    /** 监听来自 AI 对话的播放请求，返回取消监听的函数 */
    onMusicPlay: (
      callback: (data: {
        track: {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }
        folderTracks: {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
        folderId: string
        targetIndex: number
      }) => void
    ) => () => void
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
