import React from 'react'
import { theme } from 'antd'
import { useTheme } from '@renderer/contexts/useTheme'
import { useChatHandlers } from './hooks/useChatHandlers'
import ChatSidebar from './components/ChatSidebar'
import ChatHeader from './components/ChatHeader'
import ChatMessageArea from './components/ChatMessageArea'
import ChatInput from './components/ChatInput'

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
    selectedTools,
    setSelectedTools,
    availableTools,
    copiedId,
    currentTopicId,
    topics,
    sidebarOpen,
    setSidebarOpen,
    selectedProviderId,
    setSelectedProviderId,
    attachments,
    setAttachments,
    messagesEndRef,
    textareaRef,
    modelSupportsTools,
    modelSupportsVision,
    groupedProviderOptions,
    titleDisplayed,
    titleDone,
    subtitleDisplayed,
    subtitleDone,
    handleSelectTopic,
    handleDeleteTopic,
    handleCopy,
    handleSend,
    handleNewChat,
    handleDeleteMessagePair,
    handleKeyDown,
    handleStop
  } = useChatHandlers()

  const scrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
  const scrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const inputScrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const inputScrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'

  return (
    <div className="h-full flex-1 flex">
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
      `}</style>

      <ChatSidebar
        sidebarOpen={sidebarOpen}
        topics={topics}
        currentTopicId={currentTopicId}
        isDarkMode={isDarkMode}
        colorBgContainer={colorBgContainer}
        borderRadiusLG={borderRadiusLG}
        colorBorderSecondary={colorBorderSecondary}
        colorText={colorText}
        colorTextSecondary={colorTextSecondary}
        colorTextTertiary={colorTextTertiary}
        colorFillAlter={colorFillAlter}
        onSelectTopic={handleSelectTopic}
        onDeleteTopic={handleDeleteTopic}
      />

      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <ChatHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          selectedProviderId={selectedProviderId}
          onSelectProvider={(value) => setSelectedProviderId(value)}
          groupedProviderOptions={groupedProviderOptions}
          colorBorderSecondary={colorBorderSecondary}
          onNewChat={handleNewChat}
        />
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
          onCopy={handleCopy}
          onDelete={handleDeleteMessagePair}
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
              isLoading={messages.some((msg) => msg.loading)}
              selectedTools={selectedTools}
              onSelectedToolsChange={setSelectedTools}
              availableTools={availableTools}
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
      </main>
    </div>
  )
}

export default Index
