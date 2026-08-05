import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme } from 'antd'
import GuideSetupPanel from './components/GuideSetupPanel'
import { useTheme } from '@renderer/contexts/useTheme'
import { useChat } from '@renderer/contexts/ChatContextCore'
import type { Window } from '../../../resource/types/window'
import ChatSidebar from './components/ChatSidebar'
import ChatHeader from './components/ChatHeader'
import ChatMessageArea from './components/ChatMessageArea'
import ChatInput from './components/ChatInput'
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
      colorBorderSecondary
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

  // 就绪状态：providers 已由 ChatProvider 预加载，直接同步判断模型是否配置
  const hasModels = providers.length > 0
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null)
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
    checkWorkspace().then(setHasWorkspace)
  }, [checkWorkspace])

  // 工作区切换后重新检查并刷新话题
  const handleWorkspaceChange = useCallback(async () => {
    const ws = await checkWorkspace()
    setHasWorkspace(ws)
    refreshTopics().then()
  }, [checkWorkspace, refreshTopics])

  // null = 检查中不显示引导页，只有确认缺失时才显示
  const showGuide = hasWorkspace === false || (hasWorkspace === true && !hasModels)
  // 引导页中 workspace 行仅当确认为 true 时才显示"已完成"
  const guideWorkspaceDone = hasWorkspace === true

  // 延迟显示引导页，避免 hasWorkspace 先于 providers 就绪时短暂闪现
  const [guideVisible, setGuideVisible] = useState(false)
  useEffect(() => {
    if (showGuide) {
      const timer = setTimeout(() => setGuideVisible(true), 120)
      return () => clearTimeout(timer)
    }
    setGuideVisible(false)
    return undefined
  }, [showGuide])
  // 触发 ChatHeader 刷新工作区列表
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0)

  // 引导项：选择目录创建/切换工作区
  const handleWorkspaceSetup = useCallback(async () => {
    try {
      const win = window as unknown as Window
      const dir = await win.api.chat.selectWorkspace()
      if (!dir) return
      const name =
        dir
          .replace(/[/\\]$/, '')
          .split(/[/\\]/)
          .pop() || dir
      const id = await win.api.chat.createWorkspace(name, dir)
      await win.api.systemSettings.update({
        chat: {
          workspacePath: dir,
          activeWorkspaceId: id
        } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
      })
      setHasWorkspace(true)
      setHeaderRefreshKey((k) => k + 1)
      refreshTopics()
    } catch (err) {
      console.error('Failed to setup workspace:', err)
    }
  }, [refreshTopics])

  // 引导项：打开模型配置
  const handleModelSetup = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-system-settings', { detail: { tab: 'model' } }))
  }, [])

  const scrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
  const scrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const inputScrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const inputScrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'

  const isReady = !showGuide

  // 自定义分栏拖拽
  const [sidebarWidth, setSidebarWidth] = useState(230)
  const draggingRef = useRef(false)

  const handleResizerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      const startX = e.clientX
      const startWidth = sidebarWidth

      const handleMouseMove = (ev: MouseEvent): void => {
        if (!draggingRef.current) return
        const newWidth = Math.min(260, Math.max(200, startWidth + ev.clientX - startX))
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
    [sidebarWidth]
  )

  // Workspace panel resizer
  const [panelWidth, setPanelWidth] = useState(() =>
    Math.max(500, Math.floor(window.innerWidth * 0.4))
  )

  const panelMinWidth = panelHasEditor ? 450 : 300
  const panelMaxWidth = panelHasEditor ? 900 : 500

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

      <div className="chat-layout" style={{ height: '100%', display: 'flex' }}>
        {hasWorkspace !== null && isReady && sidebarOpen && (
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
            minWidth: '20%',
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
            onWorkspaceChange={handleWorkspaceChange}
            refreshTrigger={headerRefreshKey}
          />

          {hasWorkspace === null ? null : isReady ? (
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
          ) : guideVisible ? (
            <GuideSetupPanel
              guideWorkspaceDone={guideWorkspaceDone}
              hasModels={hasModels}
              colorFillAlter={colorFillAlter}
              colorText={colorText}
              colorTextSecondary={colorTextSecondary}
              colorTextTertiary={colorTextTertiary}
              onWorkspaceSetup={handleWorkspaceSetup}
              onModelSetup={handleModelSetup}
            />
          ) : null}
        </main>

        {/* Workspace panel resizer */}
        {hasWorkspace !== null && isReady && panelOpen && (
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
