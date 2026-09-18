import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { theme, Button } from 'antd'
import { RiChatAiLine, RiFoldersLine, RiListSettingsLine } from '@remixicon/react'
import { useTheme } from '@renderer/contexts/useTheme'
import { useTranslation } from '@renderer/i18n'
import { useHarness } from '@renderer/contexts/HarnessContextCore'
import type { Window } from '../../../resource/types/window'
import HarnessSidebar from './components/HarnessSidebar'
import HarnessHeader from './components/HarnessHeader'
import HarnessMessageArea from './components/HarnessMessageArea'
import HarnessInput from './components/HarnessInput'
import TaskProgressCard from './components/TaskProgressCard'
import GoalBar from './components/GoalBar'
import AskQuestionModal from './components/AskQuestionModal'
import ModelRecoveryModal from './components/ModelRecoveryModal'
import WorkspacePanel, { type WorkspacePanelHandle } from './components/WorkspacePanel'
import {
  WorkspaceBridgeContext,
  type WorkspaceBridge,
  type ToolDetailRequest
} from './contexts/workspace-bridge'

const Index: React.FC = () => {
  const {
    token: {
      colorBgContainer,
      borderRadiusLG,
      colorBgLayout,
      colorFillAlter,
      colorText,
      colorTextSecondary,
      colorTextTertiary,
      colorBorder,
      colorBorderSecondary,
      colorPrimary,
      colorPrimaryBg
    }
  } = theme.useToken()
  const { effectiveTheme } = useTheme()
  const isDarkMode = effectiveTheme === 'dark'
  const { t } = useTranslation()

  const {
    messages,
    inputValue,
    setInputValue,
    copiedId,
    currentTopicId,
    topics,
    topicsWorkspaceId,
    sidebarOpen,
    setSidebarOpen,
    selectedProviderId,
    setSelectedProviderId,
    attachments,
    setAttachments,
    providers,
    isLoading,
    loadingTopicIds,
    messagesEndRef,
    textareaRef,
    inputHistoryRef,
    modelSupportsTools,
    modelSupportsVision,
    groupedProviderOptions,
    topicsHasMore,
    topicsLoading,
    topicsRefreshing,
    messagesHasMore,
    messagesLoadingMore,
    handleSelectTopic,
    handleDeleteTopic,
    handleCopy,
    handleSend,
    handleNewHarness,
    handleDeleteMessagePair,
    handleStartEditMessage,
    handleSubmitEditMessage,
    handleCancelEditMessage,
    editingMessageId,
    handleBranchConversation,
    handleKeyDown,
    handleStop,
    handleLoadMoreTopics,
    handleLoadMoreMessages,
    refreshTopics
  } = useHarness()

  // 模型就绪检查：应用即开即用，只有「助手」页依赖模型配置——未配置时在本页内引导
  const hasModels = providers.length > 0
  const [workspacePath, setWorkspacePath] = useState<string>('')
  /** 是否已配置工作区：null = 检查中（此时不显示引导，避免闪现） */
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelHasEditor, setPanelHasEditor] = useState(false)
  /** 右侧工作区面板的命令式入口（工具卡片点击 → 打开文件 / 定位目录 / 结果详情页签） */
  const workspacePanelRef = useRef<WorkspacePanelHandle>(null)

  const checkWorkspace = useCallback(async (): Promise<boolean> => {
    try {
      const settings = await (window as unknown as Window).api.systemSettings.getAll()
      const wsPath = settings.harness?.workspacePath || ''
      setWorkspacePath(wsPath)
      const ok = Boolean(settings.harness?.activeWorkspaceId)
      setHasWorkspace(ok)
      return ok
    } catch {
      setHasWorkspace(false)
      return false
    }
  }, [])

  useEffect(() => {
    checkWorkspace().then()
  }, [checkWorkspace])

  // 引导项：选择目录创建并激活工作区（与侧边栏「新建工作区」同一套流程）
  const handleWorkspaceSetup = useCallback(async (): Promise<void> => {
    try {
      const win = window as unknown as Window
      const dir = await win.api.harness.selectWorkspace()
      if (!dir) return
      const name =
        dir
          .replace(/[/\\]$/, '')
          .split(/[/\\]/)
          .pop() || t('harness.sidebar.defaultWorkspaceName')
      const id = await win.api.harness.createWorkspace(name, dir)
      await win.api.systemSettings.update({
        harness: {
          workspacePath: dir,
          activeWorkspaceId: id
        } as Parameters<typeof win.api.systemSettings.update>[0]['harness']
      })
      setWorkspacePath(dir)
      setHasWorkspace(true)
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }))
      refreshTopics().then()
    } catch (err) {
      console.error('Failed to setup workspace:', err)
    }
  }, [refreshTopics, t])

  // 工作区切换后刷新工作区路径与话题列表
  const handleWorkspaceChange = useCallback(async () => {
    await checkWorkspace()
    refreshTopics().then()
  }, [checkWorkspace, refreshTopics])

  // 全局工作区切换：只刷新路径与话题列表。
  // 不再顺带 handleNewHarness()——「点开其他工作区下的会话」时那一步会把刚选中的会话清空再重设，
  // 造成列表与选中高亮闪动；需要回到空白欢迎态的入口（新建会话/新建工作区/删除工作区）
  // 由侧边栏显式调用 onNewHarness()。
  const handleWorkspaceChangedRef = useRef<() => void>(() => {})
  useEffect(() => {
    handleWorkspaceChangedRef.current = () => {
      handleWorkspaceChange().then()
    }
  })
  useEffect(() => {
    const onWorkspaceChanged = (): void => {
      handleWorkspaceChangedRef.current()
    }
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', onWorkspaceChanged)
  }, [])

  /**
   * 虚拟路径 → 工作区真实路径。
   *
   * 工具卡片里的路径是虚拟路径（'/' 挂在 AI 工作区、'/memories/' 挂在记忆目录）。
   * 资源管理器只认真实绝对路径，所以只有工作区挂载能映射；记忆挂载返回 null，
   * 这类文件由面板以只读页签打开（主进程的挂载解析负责边界校验）。
   */
  const toRealPath = useCallback(
    (virtualPath: string): string | null => {
      if (!workspacePath) return null
      const normalized = virtualPath.replace(/\\/g, '/')
      if (normalized === '/memories' || normalized.startsWith('/memories/')) return null
      const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean)
      const root = workspacePath.replace(/[\\/]+$/, '')
      if (segments.length === 0) return root
      const sep = workspacePath.includes('\\') ? '\\' : '/'
      return `${root}${sep}${segments.join(sep)}`
    },
    [workspacePath]
  )

  /** 面板尚未挂载时（第一次从关闭状态点卡片）暂存动作，挂载完成后补执行 */
  const pendingPanelActionRef = useRef<((handle: WorkspacePanelHandle) => void) | null>(null)
  const runOnPanel = useCallback((action: (handle: WorkspacePanelHandle) => void): void => {
    const handle = workspacePanelRef.current
    if (handle) action(handle)
    else pendingPanelActionRef.current = action
    setPanelOpen(true)
  }, [])
  useEffect(() => {
    if (!panelOpen) return
    const action = pendingPanelActionRef.current
    const handle = workspacePanelRef.current
    if (!action || !handle) return
    pendingPanelActionRef.current = null
    action(handle)
  }, [panelOpen, panelHasEditor])

  /**
   * 工具卡片 → 右侧工作区面板的桥（见 contexts/WorkspaceBridgeContext）。
   * 点击行为按工具语义分派：文件类打开真实文件、ls 定位目录、其余打开结果详情页签。
   */
  const workspaceBridge = useMemo<WorkspaceBridge>(
    () => ({
      openFile: (virtualPath) => {
        runOnPanel((handle) => handle.openVirtualFile(virtualPath, toRealPath(virtualPath)))
      },
      revealPath: (virtualPath) => {
        const realPath = toRealPath(virtualPath)
        if (!realPath) return false
        runOnPanel((handle) => handle.revealPath(realPath))
        return true
      },
      openToolDetail: (request: ToolDetailRequest) => {
        runOnPanel((handle) => handle.openToolDetail(request))
      }
    }),
    [runOnPanel, toRealPath]
  )

  const scrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
  const scrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const inputScrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const inputScrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'

  // 自定义分栏拖拽
  const [sidebarWidth, setSidebarWidth] = useState(230)
  const draggingRef = useRef(false)

  // 聊天区实际可用宽度（窗口宽度减去左右导航栏），所有分栏宽度上限都以它为准，
  // 避免在最小窗口（1200px）下拖拽分栏导致整体出现横向滚动条
  const layoutRef = useRef<HTMLDivElement>(null)
  const [layoutWidth, setLayoutWidth] = useState(0)

  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    const update = (): void => setLayoutWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Workspace panel resizer
  const [panelWidth, setPanelWidth] = useState(() =>
    Math.max(500, Math.floor(window.innerWidth * 0.4))
  )

  const MAIN_MIN_WIDTH = 410
  const RESIZER_WIDTH = 6
  const panelMinWidth = panelHasEditor ? 450 : 220
  // 动态限制 panel 最大宽度：不超过可用宽度 45%，且确保对话区至少有 MAIN_MIN_WIDTH
  const panelMaxWidth = panelHasEditor
    ? Math.max(
        panelMinWidth,
        Math.min(
          Math.floor(layoutWidth * 0.45),
          layoutWidth -
            (sidebarOpen ? sidebarWidth + RESIZER_WIDTH : 0) -
            RESIZER_WIDTH -
            MAIN_MIN_WIDTH
        )
      )
    : 220

  // 面板宽度策略：编辑器打开/关闭时自动展开/收窄；其余变化（窗口缩放、侧边栏拖拽）
  // 只把宽度收敛回合法区间，保留用户拖拽结果，避免溢出出现横向滚动条
  const prevHasEditorRef = useRef(panelHasEditor)
  useEffect(() => {
    if (panelHasEditor === prevHasEditorRef.current) {
      setPanelWidth((prev) => Math.min(Math.max(prev, panelMinWidth), panelMaxWidth))
      return
    }
    prevHasEditorRef.current = panelHasEditor
    setPanelWidth(panelHasEditor ? Math.min(Math.floor(layoutWidth * 0.35), panelMaxWidth) : 220)
  }, [panelHasEditor, layoutWidth, panelMinWidth, panelMaxWidth])

  // 侧边栏拖拽上限：为对话区与工作区面板留足空间，避免整体出现横向滚动条
  const sidebarMaxWidth = Math.max(
    200,
    Math.min(
      260,
      layoutWidth - RESIZER_WIDTH - MAIN_MIN_WIDTH - (panelOpen ? panelWidth + RESIZER_WIDTH : 0)
    )
  )

  const handleResizerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      const startX = e.clientX
      const startWidth = sidebarWidth

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!draggingRef.current) return
        const newWidth = Math.min(sidebarMaxWidth, Math.max(200, startWidth + ev.clientX - startX))
        setSidebarWidth(newWidth)
      }

      const handleMouseUp = (): void => {
        draggingRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [sidebarWidth, sidebarMaxWidth]
  )

  const panelDraggingRef = useRef(false)

  const handlePanelResizerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      panelDraggingRef.current = true
      const startX = e.clientX
      const startWidth = panelWidth

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!panelDraggingRef.current) return
        const newWidth = Math.min(
          panelMaxWidth,
          Math.max(panelMinWidth, startWidth - (ev.clientX - startX))
        )
        setPanelWidth(newWidth)
      }

      const handleMouseUp = (): void => {
        panelDraggingRef.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [panelWidth, panelMinWidth, panelMaxWidth]
  )

  return (
    <WorkspaceBridgeContext.Provider value={workspaceBridge}>
      <div className="h-full flex-1">
        <style>{`
        /* 任务段折叠头（消息内容按任务折叠）：外观沿用既有 Collapse，只收紧布局——
           标签必须撑满 header 且自身可压缩，否则长任务名会顶出容器、右侧的
           清单按钮也贴不到右边（antd 的标签容器是 .ant-collapse-title，没法定 inline 样式）。 */
        /* 折叠头统一垂直居中：文字装在 .ant-collapse-title 里，它默认是块级盒子，
           里面的行内文字按基线排版 → 看着偏上（用户反馈「思考过程这几个字并没有居中」）。
           任务段此前单独修过（下面的 .task-segment-collapse 规则），其余折叠头没有，
           于是同一屏里两种对齐并存。这两条把整个聊天区统一。 */
        .harness-message-list .ant-collapse-header { align-items: center; }
        .harness-message-list .ant-collapse-title {
          display: flex;
          align-items: center;
          min-width: 0;
        }
        .task-segment-collapse > .ant-collapse-item > .ant-collapse-header { align-items: center; }
        .task-segment-collapse .ant-collapse-title {
          flex: 1 1 auto;
          min-width: 0;
          display: flex;
          align-items: center;
        }
        .task-segment-collapse .ant-collapse-title > span { width: 100%; }
        .task-segment-collapse .ant-collapse-content-box { padding-block: 4px 8px !important; }
        .task-segment-collapse .ant-collapse-header { padding-block: 7px !important; }
        .harness-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .harness-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .harness-scrollbar::-webkit-scrollbar-thumb {
          background: ${scrollbarThumbColor};
          border-radius: 4px;
          transition: background 0.2s;
        }
        .harness-scrollbar::-webkit-scrollbar-thumb:hover { background: ${scrollbarThumbHoverColor}; }
        .harness-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: ${scrollbarThumbColor} transparent;
        }
        .input-scrollbar textarea::-webkit-scrollbar { width: 4px; }
        .input-scrollbar textarea::-webkit-scrollbar-track { background: transparent; }
        .input-scrollbar textarea::-webkit-scrollbar-thumb {
          background: ${inputScrollbarThumbColor};
          border-radius: 2px;
          transition: background 0.2s;
        }
        .input-scrollbar textarea::-webkit-scrollbar-thumb:hover { background: ${inputScrollbarThumbHoverColor}; }
        .input-scrollbar textarea {
          scrollbar-width: thin;
          scrollbar-color: ${inputScrollbarThumbColor} transparent;
        }
        .history-scrollbar::-webkit-scrollbar { width: 4px; }
        .history-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .history-scrollbar::-webkit-scrollbar-thumb {
          background: ${inputScrollbarThumbColor};
          border-radius: 2px;
        }
        .history-scrollbar::-webkit-scrollbar-thumb:hover { background: ${inputScrollbarThumbHoverColor}; }
        .history-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: ${inputScrollbarThumbColor} transparent;
        }
        .harness-resizer {
          width: 6px;
          cursor: col-resize;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }
        .harness-resizer-dragger {
          width: 2px;
          height: calc(100% - 16px);
          border-radius: 1px;
          background: ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'};
          transition: background 0.15s;
        }
        .harness-resizer:hover .harness-resizer-dragger {
          background: ${isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'};
        }
      `}</style>

        <div
          ref={layoutRef}
          className="harness-layout"
          style={{ height: '100%', display: 'flex', overflow: 'hidden' }}
        >
          {sidebarOpen && (
            <>
              <div style={{ width: sidebarWidth, minWidth: 200, maxWidth: 239, flexShrink: 0 }}>
                <HarnessSidebar
                  topics={topics}
                  topicsWorkspaceId={topicsWorkspaceId}
                  currentTopicId={currentTopicId}
                  colorBgContainer={colorBgContainer}
                  borderRadiusLG={borderRadiusLG}
                  colorText={colorText}
                  colorTextSecondary={colorTextSecondary}
                  colorTextTertiary={colorTextTertiary}
                  colorFillAlter={colorFillAlter}
                  loadingTopicIds={loadingTopicIds}
                  hasMoreTopics={topicsHasMore}
                  isLoadingMoreTopics={topicsLoading}
                  isRefreshingTopics={topicsRefreshing}
                  onSelectTopic={handleSelectTopic}
                  onDeleteTopic={handleDeleteTopic}
                  onLoadMoreTopics={handleLoadMoreTopics}
                  onNewHarness={handleNewHarness}
                />
              </div>
              <div className="harness-resizer" onMouseDown={handleResizerMouseDown}>
                <div className="harness-resizer-dragger" />
              </div>
            </>
          )}
          <main
            className="h-full flex flex-col overflow-hidden"
            style={{
              flex: 1,
              minWidth: 410,
              background: colorBgContainer,
              borderRadius: borderRadiusLG
            }}
          >
            <HarnessHeader
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              panelOpen={panelOpen}
              onTogglePanel={() => setPanelOpen(!panelOpen)}
              colorBorderSecondary={colorBorderSecondary}
              currentTopicId={currentTopicId}
            />

            {hasWorkspace === null ? null : hasWorkspace === false ? (
              /* 未配置工作区：对话按工作区隔离，先引导选择目录（同「配置模型」的页内引导） */
              <div
                className="flex-1 flex items-center justify-center"
                style={{ minHeight: 0, padding: 24 }}
              >
                <div style={{ maxWidth: 420, textAlign: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      margin: '0 auto 14px',
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: colorPrimaryBg,
                      color: colorPrimary,
                      fontSize: 26
                    }}
                  >
                    <RiFoldersLine size={26} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: colorText }}>
                    {t('harness.index.setupWorkspaceTitle')}
                  </h2>
                  <p style={{ margin: '8px 0 20px', fontSize: 13, color: colorTextSecondary }}>
                    {t('harness.index.setupWorkspaceDescription')}
                  </p>
                  <Button
                    type="primary"
                    icon={<RiFoldersLine size={15} />}
                    onClick={handleWorkspaceSetup}
                  >
                    {t('harness.index.setupWorkspaceButton')}
                  </Button>
                </div>
              </div>
            ) : !hasModels ? (
              /* 模型未配置：仅「助手」页内引导，不影响其他功能使用 */
              <div
                className="flex-1 flex items-center justify-center"
                style={{ minHeight: 0, padding: 24 }}
              >
                <div style={{ maxWidth: 420, textAlign: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      margin: '0 auto 14px',
                      borderRadius: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: colorPrimaryBg,
                      color: colorPrimary,
                      fontSize: 26
                    }}
                  >
                    <RiChatAiLine size={26} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: colorText }}>
                    {t('harness.index.setupModelTitle')}
                  </h2>
                  <p style={{ margin: '8px 0 20px', fontSize: 13, color: colorTextSecondary }}>
                    {t('harness.index.setupModelDescription')}
                  </p>
                  <Button
                    type="primary"
                    icon={<RiListSettingsLine size={15} />}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('open-system-settings', { detail: { tab: 'model' } })
                      )
                    }
                  >
                    {t('harness.index.setupModelButton')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <HarnessMessageArea
                  messages={messages}
                  isDarkMode={isDarkMode}
                  streaming={isLoading}
                  currentTopicId={currentTopicId}
                  colorText={colorText}
                  colorTextSecondary={colorTextSecondary}
                  colorTextTertiary={colorTextTertiary}
                  colorFillAlter={colorFillAlter}
                  colorBorderSecondary={colorBorderSecondary}
                  copiedId={copiedId}
                  hasMoreMessages={messagesHasMore}
                  isLoadingMoreMessages={messagesLoadingMore}
                  onCopy={handleCopy}
                  onDelete={handleDeleteMessagePair}
                  onStartEditMessage={handleStartEditMessage}
                  onSubmitEditMessage={handleSubmitEditMessage}
                  onCancelEditMessage={handleCancelEditMessage}
                  editingMessageId={editingMessageId}
                  onBranch={handleBranchConversation}
                  onLoadMoreMessages={handleLoadMoreMessages}
                  messagesEndRef={messagesEndRef}
                />

                <div className="px-16 pb-8">
                  <div className="max-w-4xl mx-auto">
                    <TaskProgressCard currentTopicId={currentTopicId} />
                    <GoalBar currentTopicId={currentTopicId} />
                    <HarnessInput
                      inputValue={inputValue}
                      onInputChange={setInputValue}
                      textareaRef={textareaRef}
                      inputHistoryRef={inputHistoryRef}
                      attachments={attachments}
                      onAttachmentsChange={setAttachments}
                      isLoading={isLoading}
                      selectedProviderId={selectedProviderId}
                      onSelectProvider={(value) => setSelectedProviderId(value)}
                      groupedProviderOptions={groupedProviderOptions}
                      modelSupportsTools={modelSupportsTools}
                      modelSupportsVision={modelSupportsVision}
                      isDarkMode={isDarkMode}
                      colorBgLayout={colorBgLayout}
                      colorBorder={colorBorder}
                      colorText={colorText}
                      colorBorderSecondary={colorBorderSecondary}
                      onSend={handleSend}
                      onStop={handleStop}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                </div>
              </>
            )}
          </main>

          {/* Workspace panel resizer */}
          {panelOpen && (
            <>
              <div className="harness-resizer" onMouseDown={handlePanelResizerMouseDown}>
                <div className="harness-resizer-dragger" />
              </div>
              <div
                style={{
                  width: panelWidth,
                  minWidth: panelMinWidth,
                  maxWidth: panelMaxWidth,
                  flexShrink: 0
                }}
              >
                <WorkspacePanel
                  ref={workspacePanelRef}
                  workspacePath={workspacePath}
                  isDarkMode={isDarkMode}
                  colorBgContainer={colorBgContainer}
                  borderRadiusLG={borderRadiusLG}
                  colorText={colorText}
                  colorTextSecondary={colorTextSecondary}
                  colorTextTertiary={colorTextTertiary}
                  onHasOpenFilesChange={setPanelHasEditor}
                />
              </div>
            </>
          )}
        </div>

        {/* 提问弹窗：ask_user_question 工具挂起时收集用户回答 */}
        <AskQuestionModal currentTopicId={currentTopicId} />
        {/* 模型请求失败弹窗：自动重试耗尽后选择是否切换模型继续（原位继续，不重发问题） */}
        <ModelRecoveryModal currentTopicId={currentTopicId} />
      </div>
    </WorkspaceBridgeContext.Provider>
  )
}

export default Index
