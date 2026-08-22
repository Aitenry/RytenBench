import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Button } from 'antd'
import { RiChatAiLine, RiListSettingsLine } from '@remixicon/react'
import { useTheme } from '@renderer/contexts/useTheme'
import { useChat } from '@renderer/contexts/ChatContextCore'
import type { Window } from '../../../resource/types/window'
import ChatSidebar from './components/ChatSidebar'
import ChatHeader from './components/ChatHeader'
import ChatMessageArea from './components/ChatMessageArea'
import ChatInput from './components/ChatInput'
import TaskProgressCard from './components/TaskProgressCard'
import WorkspacePanel from './components/WorkspacePanel'

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

  const {
    messages,
    inputValue,
    setInputValue,
    copiedId,
    currentTopicId,
    topics,
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
    modelSupportsTools,
    modelSupportsVision,
    groupedProviderOptions,
    titleDisplayed,
    titleDone,
    subtitleDisplayed,
    subtitleDone,
    topicsHasMore,
    topicsLoading,
    messagesHasMore,
    messagesLoadingMore,
    handleSelectTopic,
    handleDeleteTopic,
    handleCopy,
    handleSend,
    handleNewChat,
    handleDeleteMessagePair,
    handleKeyDown,
    handleStop,
    handleLoadMoreTopics,
    handleLoadMoreMessages,
    refreshTopics
  } = useChat()

  // 模型就绪检查：应用即开即用，只有「助手」页依赖模型配置——未配置时在本页内引导
  const hasModels = providers.length > 0
  const [workspacePath, setWorkspacePath] = useState<string>('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelHasEditor, setPanelHasEditor] = useState(false)

  const checkWorkspace = useCallback(async (): Promise<boolean> => {
    try {
      const settings = await (window as unknown as Window).api.systemSettings.getAll()
      const wsPath = settings.chat?.workspacePath || ''
      setWorkspacePath(wsPath)
      return Boolean(settings.chat?.activeWorkspaceId)
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    checkWorkspace().then()
  }, [checkWorkspace])

  // 工作区切换后刷新工作区路径与话题列表
  const handleWorkspaceChange = useCallback(async () => {
    await checkWorkspace()
    refreshTopics().then()
  }, [checkWorkspace, refreshTopics])

  // 全局工作区切换：清空当前会话回到空白欢迎态，再刷新话题列表
  const handleWorkspaceChangedRef = useRef<() => void>(() => {})
  useEffect(() => {
    handleWorkspaceChangedRef.current = () => {
      handleNewChat()
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
    setPanelWidth(
      panelHasEditor ? Math.min(Math.floor(layoutWidth * 0.35), panelMaxWidth) : 220
    )
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
    <div className="h-full flex-1">
      <style>{`
        .chat-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: ${scrollbarThumbColor};
          border-radius: 4px;
          transition: background 0.2s;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: ${scrollbarThumbHoverColor}; }
        .chat-scrollbar {
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
        .chat-resizer {
          width: 6px;
          cursor: col-resize;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }
        .chat-resizer-dragger {
          width: 2px;
          height: calc(100% - 16px);
          border-radius: 1px;
          background: ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'};
          transition: background 0.15s;
        }
        .chat-resizer:hover .chat-resizer-dragger {
          background: ${isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'};
        }
      `}</style>

      <div
        ref={layoutRef}
        className="chat-layout"
        style={{ height: '100%', display: 'flex', overflow: 'hidden' }}
      >
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth, minWidth: 200, maxWidth: 239, flexShrink: 0 }}>
              <ChatSidebar
                topics={topics}
                currentTopicId={currentTopicId}
                isDarkMode={isDarkMode}
                colorBgContainer={colorBgContainer}
                borderRadiusLG={borderRadiusLG}
                colorText={colorText}
                colorTextSecondary={colorTextSecondary}
                colorTextTertiary={colorTextTertiary}
                colorFillAlter={colorFillAlter}
                loadingTopicIds={loadingTopicIds}
                hasMoreTopics={topicsHasMore}
                isLoadingMoreTopics={topicsLoading}
                onSelectTopic={handleSelectTopic}
                onDeleteTopic={handleDeleteTopic}
                onLoadMoreTopics={handleLoadMoreTopics}
              />
            </div>
            <div className="chat-resizer" onMouseDown={handleResizerMouseDown}>
              <div className="chat-resizer-dragger" />
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
          <ChatHeader
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen(!panelOpen)}
            colorBorderSecondary={colorBorderSecondary}
            onNewChat={handleNewChat}
          />

          {!hasModels ? (
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
                  配置模型后开始对话
                </h2>
                <p style={{ margin: '8px 0 20px', fontSize: 13, color: colorTextSecondary }}>
                  AI 对话需要模型供应商。添加并启用至少一个模型后即可使用，其他功能不受影响。
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
                  去配置模型
                </Button>
              </div>
            </div>
          ) : (
            <>
              <ChatMessageArea
                messages={messages}
                isDarkMode={isDarkMode}
                colorText={colorText}
                colorTextSecondary={colorTextSecondary}
                colorTextTertiary={colorTextTertiary}
                colorFillAlter={colorFillAlter}
                colorBorderSecondary={colorBorderSecondary}
                titleDisplayed={titleDisplayed}
                titleDone={titleDone}
                subtitleDisplayed={subtitleDisplayed}
                subtitleDone={subtitleDone}
                copiedId={copiedId}
                hasMoreMessages={messagesHasMore}
                isLoadingMoreMessages={messagesLoadingMore}
                onCopy={handleCopy}
                onDelete={handleDeleteMessagePair}
                onLoadMoreMessages={handleLoadMoreMessages}
                messagesEndRef={messagesEndRef}
              />

              <div className="px-16 pb-8">
                <div className="max-w-4xl mx-auto">
                  <TaskProgressCard currentTopicId={currentTopicId} />
                  <ChatInput
                    inputValue={inputValue}
                    onInputChange={setInputValue}
                    textareaRef={textareaRef}
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
            <div className="chat-resizer" onMouseDown={handlePanelResizerMouseDown}>
              <div className="chat-resizer-dragger" />
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
    </div>
  )
}

export default Index
