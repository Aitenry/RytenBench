import React from 'react'
import { Tooltip, Collapse, Modal } from 'antd'
import {
  RiFileCopyLine,
  RiCheckLine,
  RiRefreshLine,
  RiDeleteBin6Line,
  RiLoader4Line,
  RiAiAgentLine,
  RiListCheck,
  RiCheckboxCircleLine,
  RiCheckboxBlankCircleLine
} from '@remixicon/react'
import MarkdownLoad from '@renderer/components/markdown/MarkdownLoad'
import LoadingMessage from './LoadingMessage'
import type { Message, MessageBlock, ToolCall } from '@renderer/types/chat'

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

const AssistantMessage: React.FC<AssistantMessageProps> = React.memo(
  ({
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

    /** 渲染 write_todos 工具为待办清单样式
     *  匹配 Claude Code / deepagents 的 TodoWrite 工具 schema：
     *    { todos: [{ content, status: "pending"|"in_progress"|"completed", activeForm }] }
     *  也兼容 { items: [...] } 格式 */
    const renderWriteTodos = (
      tool: ToolCall,
      key: string | number,
      isNested = false
    ): React.ReactNode => {
      const input = (tool.input || {}) as Record<string, unknown>
      const todos: Record<string, unknown>[] = Array.isArray(input.todos)
        ? (input.todos as Record<string, unknown>[])
        : Array.isArray(input.items)
          ? (input.items as Record<string, unknown>[])
          : []

      if (todos.length === 0) return null

      const getStatus = (t: Record<string, unknown>): string => String(t.status ?? 'pending')

      const isCompleted = (t: Record<string, unknown>): boolean => getStatus(t) === 'completed'

      const isInProgress = (t: Record<string, unknown>): boolean => getStatus(t) === 'in_progress'

      const completedCount = todos.filter(isCompleted).length
      const inProgressCount = todos.filter(isInProgress).length
      const total = todos.length
      const allCompleted = total > 0 && completedCount === total

      return (
        <div
          key={key}
          style={{
            background: collapseBg,
            marginBottom: isNested ? '4px' : '6px',
            borderRadius: '8px',
            padding: isNested ? '6px 10px' : '8px 12px'
          }}
          className="rounded-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <RiListCheck
              size={isNested ? 14 : 16}
              style={{ color: allCompleted ? '#52c41a' : colorTextSecondary }}
            />
            <span
              style={{
                color: colorTextSecondary,
                fontSize: isNested ? '12px' : '14px',
                fontWeight: 500
              }}
            >
              {completedCount}/{total} 已完成
            </span>
            {inProgressCount > 0 && !allCompleted ? (
              <span
                style={{
                  color: colorTextTertiary,
                  fontSize: isNested ? '11px' : '12px'
                }}
              >
                · {inProgressCount} 进行中
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            {todos.map((todo, i) => {
              const status = getStatus(todo)
              const done = status === 'completed'
              const progressing = status === 'in_progress'
              const title =
                (progressing ? (todo.activeForm as string) : undefined) ||
                (todo.content as string) ||
                (todo.title as string) ||
                (todo.text as string) ||
                (todo.name as string) ||
                `待办 ${i + 1}`

              return (
                <div key={i} className="flex items-start gap-2">
                  {done ? (
                    <RiCheckboxCircleLine
                      size={isNested ? 14 : 16}
                      style={{ color: '#52c41a', marginTop: '2px', flexShrink: 0 }}
                    />
                  ) : progressing ? (
                    <div
                      style={{
                        width: isNested ? 14 : 16,
                        height: isNested ? 14 : 16,
                        marginTop: '2px',
                        flexShrink: 0,
                        borderRadius: '50%',
                        border: `1.5px dashed ${colorTextTertiary}`
                      }}
                    />
                  ) : (
                    <RiCheckboxBlankCircleLine
                      size={isNested ? 14 : 16}
                      style={{ color: colorTextTertiary, marginTop: '2px', flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      color: done ? colorTextTertiary : colorText,
                      fontSize: isNested ? '12px' : '14px',
                      textDecoration: done ? 'line-through' : 'none',
                      wordBreak: 'break-word'
                    }}
                  >
                    {title}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

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

      // 合并相邻的 reasoning 块：防止模型把思考过程拆成 token 级事件，导致满屏"思考过程"
      const mergedBlocks: MessageBlock[] = []
      for (const block of message.blocks) {
        if (block.type === 'reasoning') {
          const last = mergedBlocks[mergedBlocks.length - 1]
          if (last && last.type === 'reasoning') {
            last.reasoning = (last.reasoning || '') + (block.reasoning || '')
            continue
          }
        }
        mergedBlocks.push(block)
      }

      return mergedBlocks.map((block, blockIndex) => {
        if (block.type === 'reasoning' && block.reasoning) {
          // 后续出现任意非推理块（正文/工具），或消息已结束（完成/中止/出错），都视为思考完成
          const hasContentAfter = mergedBlocks
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
                      className="text-sm border-l-2 pl-3"
                      style={{ borderColor: colorBorderSecondary }}
                    >
                      <MarkdownLoad content={block.reasoning} isDarkMode={isDarkMode} />
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
          if (block.tool.name === 'write_todos') {
            return renderWriteTodos(block.tool, blockIndex)
          }
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
        if (block.type === 'subAgent' && block.subAgent) {
          const sa = block.subAgent
          const isActive = sa.status === 'started' || sa.status === 'running'
          const isError = sa.status === 'error'
          const saLabel = isActive
            ? `${sa.name} · 执行中…`
            : isError
              ? `${sa.name} · 出错`
              : `${sa.name} · 已完成`
          const saIconColor = isError ? '#ef4444' : isActive ? '#1677ff' : '#52c41a'

          // 递归渲染智能体的嵌套子块（text / tool / reasoning / subAgent）
          const renderChildren = (children: MessageBlock[], depth = 0): React.ReactNode => {
            // 合并相邻的 reasoning 块：防止模型把 reasoning 拆成 token 级事件，导致满屏"思考过程"
            // 合并相邻的 text 块：避免流式输出把正文拆成 "Good" / "," / "found" 等碎片
            const mergedChildren: MessageBlock[] = []
            for (const child of children) {
              if (child.type === 'reasoning') {
                const last = mergedChildren[mergedChildren.length - 1]
                if (last && last.type === 'reasoning') {
                  last.reasoning = (last.reasoning || '') + (child.reasoning || '')
                  continue
                }
              }
              if (child.type === 'text') {
                const last = mergedChildren[mergedChildren.length - 1]
                if (last && last.type === 'text') {
                  last.text = (last.text || '') + (child.text || '')
                  continue
                }
              }
              mergedChildren.push(child)
            }
            return mergedChildren.map((child, ci) => {
              if (child.type === 'reasoning' && child.reasoning) {
                return (
                  <Collapse
                    key={ci}
                    items={[
                      {
                        key: ci,
                        label: (
                          <span style={{ color: colorTextTertiary }} className="text-xs">
                            思考过程
                          </span>
                        ),
                        children: (
                          <div
                            className="text-xs border-l-2 pl-3"
                            style={{ borderColor: colorBorderSecondary }}
                          >
                            <MarkdownLoad content={child.reasoning} isDarkMode={isDarkMode} />
                          </div>
                        )
                      }
                    ]}
                    size="small"
                    style={{ marginBottom: '6px', background: collapseBg }}
                    className="rounded-lg border-0"
                  />
                )
              }
              if (child.type === 'text' && child.text) {
                return (
                  <div key={ci} style={{ color: colorText }} className="mb-1">
                    <MarkdownLoad content={child.text} isDarkMode={isDarkMode} />
                  </div>
                )
              }
              if (child.type === 'tool' && child.tool) {
                if (child.tool.name === 'write_todos') {
                  return renderWriteTodos(child.tool, ci, true)
                }
                const isPreparing = child.tool.status === 'preparing'
                const isExecuting =
                  child.tool.status === 'executing' || (!child.tool.status && !child.tool.output)
                const inProgress = Boolean(message.loading) && (isPreparing || isExecuting)
                const toolName = child.tool.name || '工具调用'
                const toolLabel = inProgress
                  ? `${toolName}${isPreparing ? ' · 生成中…' : ' · 执行中…'}`
                  : toolName
                return (
                  <Collapse
                    key={ci}
                    items={[
                      {
                        key: ci,
                        label: (
                          <span style={{ color: colorTextSecondary }} className="text-xs">
                            {toolLabel}
                          </span>
                        ),
                        collapsible: inProgress ? 'disabled' : undefined,
                        children: (
                          <div className="ml-2">
                            <div
                              style={{ color: colorTextSecondary }}
                              className="font-medium mb-1 text-xs"
                            >
                              输入：
                            </div>
                            <pre
                              style={{ background: codeBg }}
                              className="p-2 rounded text-xs overflow-x-auto"
                            >
                              {JSON.stringify(child.tool.input, null, 2)}
                            </pre>
                            {child.tool.output ? (
                              <>
                                <div
                                  style={{ color: colorTextSecondary }}
                                  className="font-medium mt-2 mb-1 text-xs"
                                >
                                  输出：
                                </div>
                                <pre
                                  style={{ background: codeBg }}
                                  className="p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap"
                                >
                                  {typeof child.tool.output === 'string'
                                    ? child.tool.output
                                    : JSON.stringify(child.tool.output, null, 2)}
                                </pre>
                              </>
                            ) : null}
                          </div>
                        )
                      }
                    ]}
                    expandIcon={
                      inProgress
                        ? () => (
                            <RiLoader4Line
                              size={12}
                              className="animate-spin"
                              style={{ color: colorTextTertiary }}
                            />
                          )
                        : undefined
                    }
                    defaultActiveKey={[]}
                    size="small"
                    style={{ marginBottom: '4px', background: collapseBg }}
                    className="rounded-lg border-0"
                  />
                )
              }
              if (child.type === 'subAgent' && child.subAgent) {
                const childSa = child.subAgent
                const childIsActive = childSa.status === 'started' || childSa.status === 'running'
                const childIsError = childSa.status === 'error'
                const childSaLabel = childIsActive
                  ? `${childSa.name} · 执行中…`
                  : childIsError
                    ? `${childSa.name} · 出错`
                    : `${childSa.name} · 已完成`
                const childSaIconColor = childIsError
                  ? '#ef4444'
                  : childIsActive
                    ? '#1677ff'
                    : '#52c41a'
                return (
                  <Collapse
                    key={`${child.subAgent?.causeId || child.subAgent?.name || ci}-${childIsActive ? 'a' : 'd'}`}
                    items={[
                      {
                        key: ci,
                        label: (
                          <span className="flex items-center gap-2">
                            <RiAiAgentLine size={12} style={{ color: childSaIconColor }} />
                            <span style={{ color: colorTextSecondary }} className="text-xs">
                              {childSaLabel}
                            </span>
                          </span>
                        ),
                        collapsible: childIsActive ? 'disabled' : undefined,
                        children: (
                          <div className="pl-2">
                            {childSa.taskDescription ? (
                              <div style={{ color: colorTextSecondary }} className="text-xs mb-1">
                                {childSa.taskDescription}
                              </div>
                            ) : null}
                            {child.children && child.children.length > 0 ? (
                              renderChildren(child.children, depth + 1)
                            ) : childSa.error ? (
                              <div style={{ color: '#ef4444' }} className="text-xs">
                                {childSa.error}
                              </div>
                            ) : null}
                          </div>
                        )
                      }
                    ]}
                    expandIcon={
                      childIsActive
                        ? () => (
                            <RiLoader4Line
                              size={12}
                              className="animate-spin"
                              style={{ color: colorTextTertiary }}
                            />
                          )
                        : undefined
                    }
                    defaultActiveKey={childIsActive ? [ci] : []}
                    size="small"
                    style={{
                      marginBottom: '4px',
                      background: collapseBg,
                      marginLeft: 8 + depth * 8
                    }}
                    className="rounded-lg border-0"
                  />
                )
              }
              return null
            })
          }

          return (
            <Collapse
              key={`${block.subAgent?.causeId || block.subAgent?.name || blockIndex}-${isActive ? 'a' : 'd'}`}
              items={[
                {
                  key: blockIndex,
                  label: (
                    <span className="flex items-center gap-2">
                      <RiAiAgentLine size={14} style={{ color: saIconColor }} />
                      <span style={{ color: colorTextSecondary }}>{saLabel}</span>
                    </span>
                  ),
                  collapsible: isActive ? 'disabled' : undefined,
                  children: (
                    <div className="pl-2">
                      {sa.taskDescription ? (
                        <div style={{ color: colorTextSecondary }} className="text-sm mb-2">
                          <MarkdownLoad content={sa.taskDescription} isDarkMode={isDarkMode} />
                        </div>
                      ) : null}
                      {block.children && block.children.length > 0 ? (
                        renderChildren(block.children)
                      ) : isActive ? (
                        <div style={{ color: colorTextTertiary }} className="text-sm italic">
                          智能体正在执行中…
                        </div>
                      ) : sa.error ? (
                        <div style={{ color: '#ef4444' }} className="text-sm">
                          {sa.error}
                        </div>
                      ) : null}
                    </div>
                  )
                }
              ]}
              expandIcon={
                isActive
                  ? () => (
                      <RiLoader4Line
                        size={14}
                        className="animate-spin"
                        style={{ color: colorTextTertiary }}
                      />
                    )
                  : undefined
              }
              defaultActiveKey={isActive ? [blockIndex] : []}
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
        <div className="w-full">
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
)

AssistantMessage.displayName = 'AssistantMessage'

export default AssistantMessage
