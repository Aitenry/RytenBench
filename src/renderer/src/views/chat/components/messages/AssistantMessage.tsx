import React from 'react'
import { Tooltip, Collapse, Modal } from 'antd'
import {
  RiFileCopyLine,
  RiCheckLine,
  RiRefreshLine,
  RiDeleteBin6Line,
  RiLoader4Line
} from '@remixicon/react'
import MarkdownLoad from '@renderer/components/markdown/MarkdownLoad'
import LoadingMessage from './LoadingMessage'
import type { Message } from '@renderer/types/chat'

interface AssistantMessageProps {
  message: Message
  index: number
  isDarkMode: boolean
  copiedId: string | null
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  colorFillAlter: string
  colorBorderSecondary: string
  onCopy: (text: string, id: string) => void
  onDelete: (index: number) => void
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({
  message,
  index,
  isDarkMode,
  copiedId,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  colorFillAlter,
  colorBorderSecondary,
  onCopy,
  onDelete
}) => {
  const isCopied = copiedId === message.id

  if (
    message.loading &&
    !message.content &&
    !message.reasoning_content &&
    (!message.toolCalls || message.toolCalls.length === 0)
  ) {
    return <LoadingMessage colorTextSecondary={colorTextSecondary} />
  }

  const codeBg = isDarkMode ? 'rgba(255,255,255,0.06)' : '#f3f4f6'
  const collapseBg = isDarkMode ? 'rgba(255,255,255,0.04)' : '#f9fafb'

  const renderBlocks = (): React.ReactNode => {
    if (message.blocks.length === 0) {
      if (message.content) {
        return (
          <div style={{ color: colorText }} className="mb-2">
            <MarkdownLoad content={message.content} isDarkMode={isDarkMode} />
          </div>
        )
      }
      return null
    }

    return message.blocks.map((block, blockIndex) => {
      if (block.type === 'reasoning' && block.reasoning) {
        // 后续出现任意非推理块（正文/工具），或消息已结束（完成/中止/出错），都视为思考完成
        const hasContentAfter = message.blocks
          .slice(blockIndex + 1)
          .some((b) => b.type !== 'reasoning')
        const thinkingDone = hasContentAfter || !message.loading
        const thinkingLabel = thinkingDone ? '思考过程' : '思考中…'
        const extra = thinkingDone
          ? ({
              label: (
                <span style={{ color: colorTextTertiary }} className="text-xs">
                  {thinkingLabel}
                </span>
              )
            } as const)
          : ({
              label: (
                <span style={{ color: colorTextTertiary }} className="text-xs">
                  {thinkingLabel}
                </span>
              ),
              collapsible: 'disabled' as const
            } as const)
        return (
          <Collapse
            key={`${blockIndex}-${thinkingDone ? 'done' : 'thinking'}`}
            items={[
              {
                key: blockIndex,
                ...extra,
                children: (
                  <div
                    style={{ color: colorTextSecondary, borderColor: colorBorderSecondary }}
                    className="text-sm whitespace-pre-wrap border-l-2 pl-3"
                  >
                    {block.reasoning}
                  </div>
                )
              }
            ]}
            expandIcon={
              thinkingDone
                ? undefined
                : () => (
                    <RiLoader4Line
                      size={14}
                      className="animate-spin"
                      style={{ color: colorTextTertiary }}
                    />
                  )
            }
            defaultActiveKey={thinkingDone ? [] : [blockIndex]}
            size="small"
            style={{ marginBottom: '6px', background: collapseBg }}
            className="rounded-lg border-0"
          />
        )
      }
      if (block.type === 'text' && block.text) {
        return (
          <div key={blockIndex} style={{ color: colorText }} className="mb-2">
            <MarkdownLoad content={block.text} isDarkMode={isDarkMode} />
          </div>
        )
      }
      if (block.type === 'tool' && block.tool) {
        const isPreparing = block.tool.status === 'preparing'
        const isExecuting =
          block.tool.status === 'executing' || (!block.tool.status && !block.tool.output)
        // 仅在消息进行中才视为进行中状态，避免中止/完成后转圈不消失
        const inProgress = Boolean(message.loading) && (isPreparing || isExecuting)
        const toolName = block.tool.name || '工具调用'
        const toolLabel = inProgress
          ? `${toolName}${isPreparing ? ' · 生成中…' : ' · 执行中…'}`
          : toolName
        return (
          <Collapse
            key={blockIndex}
            items={[
              {
                key: blockIndex,
                label: toolLabel,
                collapsible: inProgress ? 'disabled' : undefined,
                children: (
                  <div>
                    <div style={{ color: colorTextSecondary }} className="font-medium mb-1">
                      输入：
                    </div>
                    <pre
                      style={{ background: codeBg }}
                      className="p-2 rounded text-sm overflow-x-auto"
                    >
                      {JSON.stringify(block.tool.input, null, 2)}
                    </pre>
                    <div style={{ color: colorTextSecondary }} className="font-medium mt-2 mb-1">
                      输出：
                    </div>
                    <pre
                      style={{ background: codeBg }}
                      className="p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap"
                    >
                      {typeof block.tool.output === 'string'
                        ? block.tool.output
                        : JSON.stringify(block.tool.output, null, 2)}
                    </pre>
                  </div>
                )
              }
            ]}
            expandIcon={
              inProgress
                ? () => (
                    <RiLoader4Line
                      size={14}
                      className="animate-spin"
                      style={{ color: colorTextTertiary }}
                    />
                  )
                : undefined
            }
            defaultActiveKey={[]}
            size="small"
            style={{ marginBottom: '6px', background: collapseBg }}
            className="rounded-lg border-0"
          />
        )
      }
      return null
    })
  }

  return (
    <div className="flex mb-6">
      <div className="max-w-[85%] w-full">
        {renderBlocks()}
        <div className="flex items-center gap-2 mt-3">
          <Tooltip title={isCopied ? '已复制' : '复制'}>
            <button
              onClick={() => onCopy(message.content, message.id)}
              className="p-1.5 rounded-lg transition-colors"
              style={{
                color: colorTextTertiary,
                background: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colorFillAlter
                e.currentTarget.style.color = colorTextSecondary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = colorTextTertiary
              }}
            >
              {isCopied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
            </button>
          </Tooltip>
          <Tooltip title="重新生成">
            <button
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: colorTextTertiary, background: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colorFillAlter
                e.currentTarget.style.color = colorTextSecondary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = colorTextTertiary
              }}
            >
              <RiRefreshLine size={16} />
            </button>
          </Tooltip>
          <Tooltip title="删除此轮对话">
            <button
              onClick={() =>
                Modal.confirm({
                  title: '确认删除',
                  content: '将删除这一轮对话，删除后不可恢复。',
                  okText: '删除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => onDelete(index)
                })
              }
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: colorTextTertiary, background: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colorFillAlter
                e.currentTarget.style.color = '#ef4444'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = colorTextTertiary
              }}
            >
              <RiDeleteBin6Line size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

export default AssistantMessage
