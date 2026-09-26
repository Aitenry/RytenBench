import type {
  AgentConfigInput,
  AgentConfigRow,
  AgentPaginatedResult,
  AskAnswer,
  FileChangeContent,
  FileChangeView,
  GoalView,
  HarnessDialogueRow,
  HarnessDialogueUsageRow,
  HarnessTopicRow,
  JobSnapshot,
  MnemonBodiesView,
  MnemonBodyInsight,
  MnemonBodyRef,
  MnemonSnapshot,
  PaginatedResult,
  PendingQuestionView,
  QueuedMessageView,
  StartMemoryAgentResult,
  SubagentSessionRow,
  TodoItem,
  TurnFinal,
  WorkspaceFsChange,
  WorkspaceRow
} from '../shared/types'
import type { HarnessToolInfo } from './types'

/**
 * harness 插件主进程通道的薄封装。
 *
 * 原先散在 `src/preload/index.ts` 的四个命名空间（`harness` / `agents` / `mainAgent` /
 * `workspace`，其中 Mnemon 记忆的一组方法嵌在 `harness` 里）已整体删除；这里的方法分组与
 * **名称、参数、返回类型**逐一对应（分组结构保留，避免 `getAll` / `update` / `delete`
 * 在不同域之间重名），实现改为走 preload 唯一暴露的通用桥
 * （`window.api.plugin.invoke/on`，通道名 `plugin:harness:*`）。
 *
 * 事件订阅同样走通用桥：通道必须由插件主进程 `ctx.registerEvent` 声明才进 preload
 * 白名单，**插件停用时订阅调用会抛「插件通道未启用」**——调用方在 useEffect 里订阅时
 * 必须容忍这种失败（历史教训：异常从 useEffect 逃逸会卸载整棵渲染树，白屏）。
 *
 * 契约见 src/plugins/README.md；类型取自 shared/types.ts（跨进程 DTO，运行期零依赖）。
 */
const invoke = window.api.plugin.invoke

/** 主进程 → 渲染层事件通道的订阅（通用桥 + 白名单门控） */
const on = (channel: string, callback: (data: unknown) => void): (() => void) =>
  window.api.plugin.on(channel, callback)

/** 后台子代理会话输出视图（点开查看结果） */
export interface SubagentSessionOutputView {
  text: string
  status: 'running' | 'idle'
  lastStatus?: 'completed' | 'failed' | 'killed'
  /** 启动时的原始任务指令（弹窗顶部展示） */
  prompt: string
}

/** 本轮流式结束载荷（harness-stream-done） */
export interface StreamDoneResult {
  topicId: number
  userDialogueId?: number
  assistantDialogueId?: number
  /** 助手段落表（无插话时只有一段）：messageId 对应一段助手气泡 */
  segments?: { messageId: string; dialogueId?: number }[]
  /** 本轮终局标记（最终答复边界 + 目标是否收口） */
  turnFinal?: TurnFinal
}

type AskAnswerItem = AskAnswer['answers'][number]

export const harnessApi = {
  /* ── 助手主体（话题对话 / 流式 / 队列 / 目标 / 后台任务 / 子代理 / 提问 / VFS） ── */
  harness: {
    sendMessage: (message: string, options?: { providerId?: number }) =>
      invoke('plugin:harness:harness-send-message', message, options),
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
      // harness-start-stream 已从 ipcMain.on 改成 invoke 通道（见插件 main/index.ts）
      void invoke('plugin:harness:harness-start-stream', message, options)
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
    }) => invoke('plugin:harness:harness-queue-enqueue', payload) as Promise<{ queued: boolean }>,
    listQueuedMessages: (topicId: number) =>
      invoke('plugin:harness:harness-queue-list', topicId) as Promise<QueuedMessageView[]>,
    removeQueuedMessage: (topicId: number, itemId: string) =>
      invoke('plugin:harness:harness-queue-remove', { topicId, itemId }) as Promise<boolean>,
    updateQueuedMessage: (topicId: number, itemId: string, text: string) =>
      invoke('plugin:harness:harness-queue-update', { topicId, itemId, text }) as Promise<boolean>,
    /** 立即插话：把这条排队消息注入正在运行的回合（下一个工具节点边界生效） */
    steerQueuedMessage: (topicId: number, itemId: string) =>
      invoke('plugin:harness:harness-queue-steer', { topicId, itemId }) as Promise<{
        accepted: boolean
      }>,
    onQueueUpdated: (
      callback: (data: { topicId: number; queue: QueuedMessageView[] }) => void
    ): (() => void) =>
      on('plugin:harness:harness-queue-updated', (data) =>
        callback(data as { topicId: number; queue: QueuedMessageView[] })
      ),
    onQueueSteered: (
      callback: (data: { topicId: number; itemId: string; text: string }) => void
    ): (() => void) =>
      on('plugin:harness:harness-queue-steered', (data) =>
        callback(data as { topicId: number; itemId: string; text: string })
      ),

    getTools: () => invoke('plugin:harness:harness-get-tools') as Promise<HarnessToolInfo[]>,

    onStreamChunk: (callback: (chunk: Record<string, unknown>) => void): (() => void) =>
      on('plugin:harness:harness-stream-chunk', (chunk) =>
        callback(chunk as Record<string, unknown>)
      ),
    onStreamDone: (callback: (result: StreamDoneResult) => void): (() => void) =>
      on('plugin:harness:harness-stream-done', (result) => callback(result as StreamDoneResult)),
    onStreamError: (callback: (error: { error: string; topicId?: number }) => void): (() => void) =>
      on('plugin:harness:harness-stream-error', (error) =>
        callback(error as { error: string; topicId?: number })
      ),

    /**
     * 文档被聊天工具修改/删除（notes 插件的编辑器据此同步或提示，防覆盖工具写入）。
     * 渲染层不再有人直接订阅它——harness 的 renderer install 把它桥接成宿主事件总线的
     * 语义事件 `doc:changed`（见 renderer/plugin.tsx），消费方是 notes 的文档编辑器。
     */
    onDocChanged: (
      callback: (data: { docId: number; action: 'updated' | 'deleted' }) => void
    ): (() => void) =>
      on('plugin:harness:harness-doc-changed', (data) =>
        callback(data as { docId: number; action: 'updated' | 'deleted' })
      ),

    getHarnessTodos: (topicId: number) =>
      invoke('plugin:harness:harness-todos-get', topicId) as Promise<TodoItem[]>,
    onHarnessTodosUpdated: (
      callback: (data: { topicId: number; todos: TodoItem[] }) => void
    ): (() => void) =>
      on('plugin:harness:harness-todos-updated', (data) =>
        callback(data as { topicId: number; todos: TodoItem[] })
      ),

    // 目标系统（goal）
    getGoal: (topicId: number) =>
      invoke('plugin:harness:harness-goal-get', topicId) as Promise<GoalView | null>,
    onGoalUpdated: (
      callback: (data: { topicId: number; goal: GoalView | null }) => void
    ): (() => void) =>
      on('plugin:harness:harness-goal-updated', (data) =>
        callback(data as { topicId: number; goal: GoalView | null })
      ),

    // 后台任务系统（jobs）
    onJobsUpdated: (
      callback: (data: { topicId: number; jobs: JobSnapshot[] }) => void
    ): (() => void) =>
      on('plugin:harness:harness-jobs-updated', (data) =>
        callback(data as { topicId: number; jobs: JobSnapshot[] })
      ),

    // 后台子代理会话（顶部栏列表：进行中 > 已完成，点开查看结果）
    listAgents: (topicId: number) =>
      invoke('plugin:harness:harness-agents-list', topicId) as Promise<SubagentSessionRow[]>,
    agentOutput: (topicId: number, agentId: string) =>
      invoke('plugin:harness:harness-agent-output', topicId, agentId) as Promise<
        SubagentSessionOutputView | undefined
      >,
    /**
     * 存入记忆：起一个后台「记忆整理」子代理，由它自己总结后写入 Mnemon，立即返回。
     * 进度与结果走顶部栏后台代理入口（onAgentsUpdated / agentOutput），不等它跑完。
     */
    startMemoryAgent: (payload: {
      topicId: number
      answer: string
      dialogueId?: number
      providerId?: number
    }) =>
      invoke(
        'plugin:harness:harness-memory-agent-start',
        payload
      ) as Promise<StartMemoryAgentResult>,
    onAgentsUpdated: (
      callback: (data: { topicId: number; rows: SubagentSessionRow[] }) => void
    ): (() => void) =>
      on('plugin:harness:harness-agents-updated', (data) =>
        callback(data as { topicId: number; rows: SubagentSessionRow[] })
      ),
    watchAgentOutput: (topicId: number, agentId: string, watch: boolean) => {
      void invoke('plugin:harness:harness-agent-watch', topicId, agentId, watch)
    },
    onAgentOutputUpdated: (
      callback: (data: {
        topicId: number
        agentId: string
        output: SubagentSessionOutputView
      }) => void
    ): (() => void) =>
      on('plugin:harness:harness-agent-output-updated', (data) =>
        callback(data as { topicId: number; agentId: string; output: SubagentSessionOutputView })
      ),

    // 向用户提问（ask_user_question）
    onQuestionAsked: (callback: (pending: PendingQuestionView) => void): (() => void) =>
      on('plugin:harness:harness-question-asked', (pending) =>
        callback(pending as PendingQuestionView)
      ),
    answerQuestion: (requestId: string, answers: AskAnswerItem[]) =>
      invoke('plugin:harness:harness-question-answer', requestId, answers) as Promise<boolean>,
    getQuestion: (topicId: number) =>
      invoke('plugin:harness:harness-question-get', topicId) as Promise<PendingQuestionView | null>,

    cancelStream: () => {
      void invoke('plugin:harness:harness-cancel-stream')
    },
    selectSkillsDirectory: () =>
      invoke('plugin:harness:harness-select-skills-directory') as Promise<string | null>,
    selectWorkspace: () =>
      invoke('plugin:harness:harness-select-workspace') as Promise<string | null>,
    listSkills: () =>
      invoke('plugin:harness:harness-list-skills') as Promise<
        { id: string; name: string; description: string }[]
      >,

    // 记忆管理（Mnemon 三层记忆）
    selectMemoryDirectory: () =>
      invoke('plugin:harness:harness-select-memory-directory') as Promise<string | null>,
    mnemonSnapshot: () => invoke('plugin:harness:mnemon-snapshot') as Promise<MnemonSnapshot>,
    mnemonRuntimeMutate: (request: {
      action: string
      target: string
      content?: string
      old_text?: string
      importance?: string
    }) =>
      invoke('plugin:harness:mnemon-runtime-mutate', request) as Promise<{
        success: boolean
        message: string
      }>,
    mnemonBodies: () => invoke('plugin:harness:mnemon-bodies') as Promise<MnemonBodiesView>,
    mnemonBodyCreate: (name: string, description: string) =>
      invoke('plugin:harness:mnemon-body-create', { name, description }) as Promise<{
        success: boolean
        body?: MnemonBodyRef
        message?: string
      }>,
    mnemonBodyUpdate: (
      id: string,
      request: { name?: string; description?: string; active?: boolean }
    ) =>
      invoke('plugin:harness:mnemon-body-update', id, request) as Promise<{
        success: boolean
        body?: MnemonBodyRef
        message?: string
      }>,
    mnemonBodyList: (memoryBodyIds?: string[]) =>
      invoke('plugin:harness:mnemon-body-list', memoryBodyIds) as Promise<MnemonBodyInsight[]>,
    mnemonDocumentSnapshot: () =>
      invoke('plugin:harness:mnemon-document-snapshot') as Promise<
        MnemonSnapshot['documents'] | null
      >,

    // 工作区管理
    getAllWorkspaces: () => invoke('plugin:harness:workspace-get-all') as Promise<WorkspaceRow[]>,
    createWorkspace: (name: string, path: string) =>
      invoke('plugin:harness:workspace-create', name, path) as Promise<number>,
    updateWorkspace: (id: number, updates: { name: string }) =>
      invoke('plugin:harness:workspace-update', id, updates) as Promise<boolean>,
    deleteWorkspace: (id: number) =>
      invoke('plugin:harness:workspace-delete', id) as Promise<boolean>,

    // 话题管理
    getAllTopics: (workspaceId: number) =>
      invoke('plugin:harness:harness-topic-get-all', workspaceId) as Promise<HarnessTopicRow[]>,
    getAllTopicsPaginated: (workspaceId: number, page: number, pageSize: number) =>
      invoke('plugin:harness:harness-topic-get-paginated', workspaceId, page, pageSize) as Promise<
        PaginatedResult<HarnessTopicRow>
      >,
    getTopicById: (id: number) =>
      invoke('plugin:harness:harness-topic-get-by-id', id) as Promise<HarnessTopicRow[]>,
    createTopic: (workspaceId: number, title: string, model?: string, selectedTools?: string) =>
      invoke(
        'plugin:harness:harness-topic-create',
        workspaceId,
        title,
        model,
        selectedTools
      ) as Promise<number>,
    updateTopic: (
      id: number,
      updates: Partial<Pick<HarnessTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => invoke('plugin:harness:harness-topic-update', id, updates) as Promise<boolean>,
    deleteTopic: (id: number) =>
      invoke('plugin:harness:harness-topic-delete', id) as Promise<boolean>,

    // 消息管理
    getDialoguesByTopic: (topicId: number) =>
      invoke('plugin:harness:harness-dialogue-get-by-topic', topicId) as Promise<
        HarnessDialogueRow[]
      >,
    getDialoguesByTopicPaginated: (topicId: number, page: number, pageSize: number) =>
      invoke(
        'plugin:harness:harness-dialogue-get-by-topic-paginated',
        topicId,
        page,
        pageSize
      ) as Promise<PaginatedResult<HarnessDialogueRow>>,
    addDialogue: (dialogue: Omit<HarnessDialogueRow, 'id' | 'created_at'>) =>
      invoke('plugin:harness:harness-dialogue-add', dialogue) as Promise<number>,
    deleteDialoguesByTopic: (topicId: number) =>
      invoke('plugin:harness:harness-dialogue-delete-by-topic', topicId) as Promise<boolean>,
    deleteDialogue: (id: number) =>
      invoke('plugin:harness:harness-dialogue-delete', id) as Promise<boolean>,

    // 对话真实用量（一条助手回复一行）
    getUsageByTopic: (topicId: number) =>
      invoke('plugin:harness:harness-usage-get-by-topic', topicId) as Promise<
        HarnessDialogueUsageRow[]
      >,

    // 工具结果按需读取：内置工具（read_file/execute 等）的结果不再随流下发，
    // 聊天卡片点开时才取（ls/glob/grep/execute 的详情按 topicId+callId 取回）
    getToolOutput: (topicId: number, callId: string) =>
      invoke('plugin:harness:harness-tool-output-get', topicId, callId) as Promise<string | null>,

    // 按虚拟路径读取文本文件（卡片「打开文件」；工作区与记忆挂载都可读）
    readVirtualFile: (virtualPath: string) =>
      invoke('plugin:harness:harness-vfs-read', virtualPath) as Promise<
        { content: string } | { error: string }
      >
  },

  /* ── 智能体配置（子智能体，挂在工作区下） ── */
  agents: {
    getAll: (workspaceId: number) =>
      invoke('plugin:harness:agent-get-all', workspaceId) as Promise<AgentConfigRow[]>,
    getPaginated: (workspaceId: number, page: number, pageSize: number) =>
      invoke('plugin:harness:agent-get-paginated', workspaceId, page, pageSize) as Promise<
        AgentPaginatedResult<AgentConfigRow>
      >,
    getById: (workspaceId: number, id: number) =>
      invoke('plugin:harness:agent-get-by-id', workspaceId, id) as Promise<AgentConfigRow | null>,
    create: (input: AgentConfigInput) =>
      invoke('plugin:harness:agent-create', input) as Promise<number>,
    update: (workspaceId: number, id: number, updates: Partial<AgentConfigInput>) =>
      invoke('plugin:harness:agent-update', workspaceId, id, updates) as Promise<boolean>,
    delete: (workspaceId: number, id: number) =>
      invoke('plugin:harness:agent-delete', workspaceId, id) as Promise<boolean>
  },

  /* ── 主智能体配置（默认工具与技能） ── */
  mainAgent: {
    get: () =>
      invoke('plugin:harness:main-agent-get') as Promise<{ tools: string[]; skills: string[] }>,
    update: (config: { tools: string[]; skills: string[] }) =>
      invoke('plugin:harness:main-agent-update', config) as Promise<boolean>
  },

  /* ── 工作区文件与改动审查（AI 改动复核 + 文件浏览器） ── */
  workspace: {
    listDir: (dirPath: string) =>
      invoke('plugin:harness:workspace-list-dir', dirPath) as Promise<
        { name: string; isDirectory: boolean; path: string }[]
      >,
    readFile: (filePath: string) =>
      invoke('plugin:harness:workspace-read-file', filePath) as Promise<string>,
    saveFile: (filePath: string, content: string) =>
      invoke('plugin:harness:workspace-save-file', filePath, content) as Promise<boolean>,

    // --- 文件改动史（可追溯 / 可回溯） ---
    /** 当前工作区待审查的改动 */
    pendingChanges: () =>
      invoke('plugin:harness:workspace-changes-pending') as Promise<FileChangeView[]>,
    /** 单个文件的改动历史（倒序） */
    fileChanges: (filePath: string) =>
      invoke('plugin:harness:workspace-changes-file', filePath) as Promise<FileChangeView[]>,
    /** 某次改动的前后正文 */
    changeContent: (id: number) =>
      invoke('plugin:harness:workspace-change-content', id) as Promise<FileChangeContent | null>,
    /** 审查：保留（清除待审查标记） */
    keepChanges: (ids: number[]) =>
      invoke('plugin:harness:workspace-change-keep', ids) as Promise<number>,
    /** 审查：撤销到某次改动之前 */
    revertChange: (id: number) =>
      invoke('plugin:harness:workspace-change-revert', id) as Promise<
        { path: string; content: string | null } | { error: string }
      >,
    /** 审查：把差异视图里取舍后的内容落盘并标记已保留 */
    applyReview: (filePath: string, content: string) =>
      invoke('plugin:harness:workspace-apply-review', filePath, content) as Promise<
        { ok: true } | { error: string }
      >,
    /** 磁盘变化（模型写入 / 命令执行 / 外部编辑器）：刷新资源管理器与已打开页签 */
    onFsChanged: (callback: (data: { changes: WorkspaceFsChange[] }) => void): (() => void) =>
      on('plugin:harness:workspace-fs-changed', (data) =>
        callback(data as { changes: WorkspaceFsChange[] })
      ),
    /** 新增一条改动记录（模型改动了某个文件） */
    onChangeRecorded: (callback: (change: FileChangeView) => void): (() => void) =>
      on('plugin:harness:workspace-change-recorded', (change) =>
        callback(change as FileChangeView)
      ),
    /** 改动审查状态变化（保留 / 撤销） */
    onChangesUpdated: (
      callback: (data: { ids: number[]; status: string; path?: string; obsolete?: number }) => void
    ): (() => void) =>
      on('plugin:harness:workspace-changes-updated', (data) =>
        callback(data as { ids: number[]; status: string; path?: string; obsolete?: number })
      )
  }
}

export default harnessApi
