import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Tooltip, Collapse, App } from 'antd'
import {
  RiFileCopyLine,
  RiCheckLine,
  RiRefreshLine,
  RiDeleteBin6Line,
  RiAiAgentLine,
  RiListCheck,
  RiCheckboxCircleLine,
  RiCheckboxBlankCircleLine,
  RiFileSearchLine,
  RiFileEditLine,
  RiPencilLine,
  RiFolderOpenLine,
  RiSearchLine,
  RiTerminalBoxLine,
  RiBrain4Line,
  RiPictureInPicture2Line,
  RiSparkling2Line
} from '@remixicon/react'
import MarkdownLoad from '@renderer/components/markdown/MarkdownLoad'
import { ShinyText, ShinyIcon } from '@renderer/components/effects/ShinyText'
import LoadingMessage from './LoadingMessage'
import type { Message, MessageBlock, ToolCall } from '@renderer/types/chat'

/** 工具进行中折叠头展示的语义图标：与工具完成后的定制卡片图标保持一致 */
const TOOL_IN_PROGRESS_ICONS: Record<
  string,
  React.ComponentType<{
    size?: number | string
    color?: string
    className?: string
    style?: React.CSSProperties
  }>
> = {
  read_file: RiFileSearchLine,
  write_file: RiFileEditLine,
  edit_file: RiPencilLine,
  ls: RiFolderOpenLine,
  glob: RiSearchLine,
  grep: RiSearchLine,
  execute: RiTerminalBoxLine
}

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

/** 工具卡片文本：单行显示 + 溢出省略，悬停展示完整内容（无箭头 Tooltip，仅在溢出时出现） */
const TruncatedTooltipText: React.FC<{
  text: string
  style?: React.CSSProperties
}> = ({ text, style }) => {
  const spanRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const check = (): void => {
      setOverflow(el.scrollWidth > el.clientWidth)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  return (
    // Tooltip 与 span 始终渲染，保证 ResizeObserver 观察的 DOM 节点稳定；
    // 空 title 时 antd 不会显示提示（仅溢出时 title 才有内容）
    <Tooltip title={overflow ? text : ''} arrow={false} styles={{ root: { maxWidth: 560 } }}>
      <span
        ref={spanRef}
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
          ...style
        }}
      >
        {text}
      </span>
    </Tooltip>
  )
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
    const { modal } = App.useApp()
    const isCopied = copiedId === message.id

    // 折叠内容滚动容器管理 & 流式输出时自动滚动到底部
    const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const setScrollRef = useCallback(
      (key: string) => (el: HTMLDivElement | null) => {
        scrollRefs.current[key] = el
      },
      []
    )
    useEffect(() => {
      if (message.loading) {
        Object.values(scrollRefs.current).forEach((el) => {
          if (el) {
            el.scrollTop = el.scrollHeight
          }
        })
      }
    })

    // 仅有「注入记忆」/「压缩中」块时仍渲染（卡片可见），其余空消息走 LoadingMessage
    const hasMemoryBlock = message.blocks.some((b) => b.type === 'memoryInjected')
    const hasCompactingBlock = message.blocks.some((b) => b.type === 'historyCompacting')
    if (
      message.loading &&
      !message.content &&
      !message.reasoning_content &&
      (!message.toolCalls || message.toolCalls.length === 0) &&
      !hasMemoryBlock &&
      !hasCompactingBlock
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

    /** 渲染 deepagent 内置工具为定制化卡片（非折叠）
     *  扁平布局，border / 背景色与 Collapse 工具块一致 */
    const renderToolCard = (
      tool: ToolCall,
      key: string | number,
      isNested = false
    ): React.ReactNode => {
      const card = tool.card
      if (!card) return null

      const size = isNested ? 14 : 16
      const fontSize = isNested ? '12px' : '13px'

      const iconStyle = { color: colorTextSecondary, flexShrink: 0 }

      const renderPathRow = (
        icon: React.ReactNode,
        label: string,
        extra?: React.ReactNode
      ): React.ReactNode => (
        <div
          key={key}
          style={{
            background: collapseBg,
            border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
            marginBottom: isNested ? '4px' : '6px',
            borderRadius: '8px',
            padding: '9px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {icon}
          <TruncatedTooltipText text={label} style={{ color: colorText, fontSize, flex: 1 }} />
          {extra}
        </div>
      )

      switch (tool.name) {
        case 'read_file':
          return renderPathRow(<RiFileSearchLine size={size} style={iconStyle} />, card.path || '')
        case 'write_file':
          return renderPathRow(<RiFileEditLine size={size} style={iconStyle} />, card.path || '')
        case 'edit_file':
          return renderPathRow(<RiPencilLine size={size} style={iconStyle} />, card.path || '')
        case 'ls':
          return renderPathRow(
            <RiFolderOpenLine size={size} style={iconStyle} />,
            card.path || '/',
            card.count !== undefined ? (
              <span style={{ color: colorTextTertiary, fontSize, flexShrink: 0 }}>
                {card.count} 项
              </span>
            ) : undefined
          )
        case 'glob':
          return renderPathRow(
            <RiSearchLine size={size} style={iconStyle} />,
            card.pattern || '',
            card.count !== undefined ? (
              <span style={{ color: colorTextTertiary, fontSize, flexShrink: 0 }}>
                {card.count} 项
              </span>
            ) : undefined
          )
        case 'grep':
          return renderPathRow(
            <RiSearchLine size={size} style={iconStyle} />,
            card.pattern || '',
            card.count !== undefined ? (
              <span style={{ color: colorTextTertiary, fontSize, flexShrink: 0 }}>
                {card.count} 条
              </span>
            ) : undefined
          )
        case 'execute':
          return renderPathRow(
            <RiTerminalBoxLine size={size} style={iconStyle} />,
            card.command || ''
          )
        default:
          return null
      }
    }

    // ── Mnemon 记忆工具定制卡片 ──────────────────────────────────────────
    // 读取类（召回/查看记忆）：mnemon_recall / mnemon_document_search / mnemon_related /
    //   mnemon_memory_bodies / mnemon_status
    // 写入类（沉淀/维护记忆）：mnemon_runtime_memory / mnemon_remember / mnemon_document_manage /
    //   mnemon_forget / mnemon_link / mnemon_memory_body_*
    const MEMORY_READ_TOOLS = [
      'mnemon_recall',
      'mnemon_document_search',
      'mnemon_related',
      'mnemon_memory_bodies',
      'mnemon_status'
    ]
    const MEMORY_WRITE_TOOLS = [
      'mnemon_runtime_memory',
      'mnemon_remember',
      'mnemon_document_manage',
      'mnemon_forget',
      'mnemon_link',
      'mnemon_memory_body_create',
      'mnemon_memory_body_update',
      'mnemon_memory_body_merge'
    ]
    /** 工具中文标签（卡片标题） */
    const MEMORY_TOOL_TITLES: Record<string, string> = {
      mnemon_status: '记忆状态',
      mnemon_memory_bodies: '记忆空间',
      mnemon_recall: '记忆召回',
      mnemon_document_search: '档案搜索',
      mnemon_related: '关联记忆'
    }

    /** 截断长文本（记忆条目/摘要展示用） */
    const clampText = (text: string, max = 300): string =>
      text.length > max ? `${text.slice(0, max)}…` : text

    /** 渲染 mnemon_* 记忆工具为定制卡片：每个工具一类独特内容，不展示存储路径 */
    const renderMemoryToolCard = (
      tool: ToolCall,
      key: string | number,
      isNested = false
    ): React.ReactNode => {
      const size = isNested ? 14 : 16
      const fontSize = isNested ? '12px' : '13px'
      const smallFont = isNested ? '11px' : '12px'
      const query = (tool.input as Record<string, unknown>)?.query as string | undefined

      // 安全解析工具输出 JSON
      let parsed: Record<string, unknown> | null = null
      if (tool.output) {
        try {
          parsed = JSON.parse(tool.output) as Record<string, unknown>
        } catch {
          parsed = null
        }
      }
      const asList = (v: unknown): Record<string, unknown>[] =>
        Array.isArray(v) ? (v as Record<string, unknown>[]) : []

      /** 统一条目行：主文本 + 元信息行 + 可选徽标（发丝线分隔） */
      const renderEntry = (
        entryKey: number,
        primary: string,
        meta?: string,
        badge?: { text: string; active?: boolean }
      ): React.ReactNode => (
        <div
          key={entryKey}
          className="flex items-start gap-2 py-1.5 first:pt-0"
          style={{
            borderTop: entryKey === 0 ? 'none' : `1px solid ${colorFillAlter}`
          }}
        >
          <div className="flex-1 min-w-0">
            <div style={{ color: colorText, fontSize }} className="whitespace-pre-wrap break-words">
              {clampText(primary)}
            </div>
            {meta ? (
              <div className="mt-0.5" style={{ color: colorTextTertiary, fontSize: smallFont }}>
                {meta}
              </div>
            ) : null}
          </div>
          {badge ? (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 mt-px"
              style={{
                background: badge.active ? 'rgba(82,196,26,0.12)' : colorFillAlter,
                color: badge.active ? '#52c41a' : colorTextSecondary,
                fontSize: isNested ? '10px' : '11px'
              }}
            >
              {badge.text}
            </span>
          ) : null}
        </div>
      )

      /** 卡片外壳：图标 + 标题 + 头部统计 + 查询词 + 内容 */
      const shell = (
        title: string,
        headExtra: React.ReactNode,
        body: React.ReactNode
      ): React.ReactNode => (
        <div
          key={key}
          style={{
            background: collapseBg,
            border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
            marginBottom: isNested ? '4px' : '6px',
            borderRadius: '8px',
            padding: '8px 12px'
          }}
          className="rounded-lg"
        >
          <div className="flex items-center gap-2 mb-1">
            <RiBrain4Line size={size} style={{ color: colorTextSecondary, flexShrink: 0 }} />
            <span style={{ color: colorTextSecondary, fontSize, fontWeight: 500, flexShrink: 0 }}>
              {title}
            </span>
            {headExtra}
            {query ? (
              <span
                style={{ color: colorTextTertiary, fontSize: smallFont, flex: 1 }}
                className="truncate text-right"
                title={query}
              >
                「{clampText(query, 60)}」
              </span>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto chat-scrollbar pl-0.5">{body}</div>
        </div>
      )

      /** 空态行 */
      const empty = (text: string): React.ReactNode => (
        <div style={{ color: colorTextTertiary, fontSize: smallFont }} className="py-0.5">
          {text}
        </div>
      )

      // ── mnemon_status：记忆状态概览 ──
      if (tool.name === 'mnemon_status') {
        const activeSpaces = asList(parsed?.active_spaces)
        const rows: [string, string][] = [
          [
            '记忆空间',
            `${parsed?.memory_bodies_active ?? 0}/${parsed?.memory_bodies_total ?? 0} 激活`
          ],
          ['热记忆', parsed?.runtime_memory_configured ? '已配置' : '未配置'],
          ['项目档案', parsed?.documents_configured ? '已配置' : '未配置']
        ]
        return shell(
          MEMORY_TOOL_TITLES.mnemon_status,
          null,
          <div>
            {parsed ? (
              <>
                {rows.map(([label, value], i) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-1"
                    style={{
                      borderTop: i === 0 ? 'none' : `1px solid ${colorFillAlter}`
                    }}
                  >
                    <span style={{ color: colorTextSecondary, fontSize: smallFont }}>{label}</span>
                    <span style={{ color: colorTextTertiary, fontSize: smallFont }}>{value}</span>
                  </div>
                ))}
                {activeSpaces.length > 0 ? (
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {activeSpaces.map((s, i) => (
                      <span
                        key={i}
                        className="rounded px-1.5 py-0.5"
                        style={{
                          background: colorFillAlter,
                          color: colorTextSecondary,
                          fontSize: isNested ? '10px' : '11px'
                        }}
                      >
                        {String(s.name ?? `空间 ${i + 1}`)} · {Number(s.totalInsights ?? 0)} 条
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              empty('无法解析状态输出')
            )}
          </div>
        )
      }

      // ── mnemon_memory_bodies：记忆空间目录 ──
      if (tool.name === 'mnemon_memory_bodies') {
        const bodies = asList(parsed?.bodies)
        return shell(
          MEMORY_TOOL_TITLES.mnemon_memory_bodies,
          parsed ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              共 {Number(parsed.total ?? 0)} 个 · {Number(parsed.activeCount ?? 0)} 激活
            </span>
          ) : null,
          bodies.length === 0 ? (
            empty('暂无记忆空间，可在对话中让模型创建')
          ) : (
            <div>
              {bodies.map((b, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-1.5 first:pt-0"
                  style={{
                    borderTop: i === 0 ? 'none' : `1px solid ${colorFillAlter}`
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ color: colorText, fontSize, fontWeight: 500 }}
                        className="truncate"
                        title={String(b.name ?? '')}
                      >
                        {String(b.name ?? '未命名空间')}
                      </span>
                      <span
                        className="shrink-0 rounded px-1.5 py-px"
                        style={{
                          background: b.active ? 'rgba(82,196,26,0.12)' : colorFillAlter,
                          color: b.active ? '#52c41a' : colorTextTertiary,
                          fontSize: isNested ? '10px' : '11px'
                        }}
                      >
                        {b.active ? '已激活' : '未激活'}
                      </span>
                    </div>
                    {b.description ? (
                      <div
                        className="mt-0.5 truncate"
                        style={{ color: colorTextTertiary, fontSize: smallFont }}
                        title={String(b.description)}
                      >
                        {String(b.description)}
                      </div>
                    ) : null}
                  </div>
                  <span
                    style={{
                      color: colorTextTertiary,
                      fontSize: smallFont,
                      flexShrink: 0
                    }}
                  >
                    {Number(b.totalInsights ?? 0)} 条洞察
                  </span>
                </div>
              ))}
            </div>
          )
        )
      }

      // ── mnemon_recall：召回的记忆条目 ──
      if (tool.name === 'mnemon_recall') {
        const results = asList(parsed?.results)
        return shell(
          MEMORY_TOOL_TITLES.mnemon_recall,
          results.length > 0 ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              {results.length} 条
            </span>
          ) : null,
          results.length === 0 ? (
            empty(typeof parsed?.hint === 'string' ? String(parsed.hint) : '未召回相关记忆')
          ) : (
            <div>
              {results.map((item, i) => {
                const primary = String(item.content ?? '')
                const meta = [
                  typeof item.memory_body_name === 'string' ? `来源：${item.memory_body_name}` : '',
                  typeof item.score === 'number' ? `相关度 ${item.score.toFixed(2)}` : ''
                ]
                  .filter(Boolean)
                  .join(' · ')
                return renderEntry(
                  i,
                  primary,
                  meta || undefined,
                  typeof item.category === 'string'
                    ? { text: item.category, active: false }
                    : undefined
                )
              })}
            </div>
          )
        )
      }

      // ── mnemon_document_search：项目档案搜索 ──
      if (tool.name === 'mnemon_document_search') {
        const results = asList(parsed?.results)
        return shell(
          MEMORY_TOOL_TITLES.mnemon_document_search,
          results.length > 0 ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              {results.length} 份
            </span>
          ) : null,
          results.length === 0 ? (
            empty('未找到匹配的档案')
          ) : (
            <div>
              {results.map((item, i) => {
                const title = String(item.title ?? '')
                const excerpt =
                  (typeof item.excerpt === 'string' && item.excerpt) ||
                  (typeof item.description === 'string' && item.description) ||
                  ''
                return (
                  <div
                    key={i}
                    className="py-1.5 first:pt-0"
                    style={{
                      borderTop: i === 0 ? 'none' : `1px solid ${colorFillAlter}`
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        style={{ color: colorText, fontSize, fontWeight: 500 }}
                        className="truncate"
                        title={title}
                      >
                        {clampText(title, 80)}
                      </span>
                      {item.status ? (
                        <span
                          className="shrink-0 rounded px-1.5 py-px"
                          style={{
                            background:
                              item.status === 'active' ? 'rgba(82,196,26,0.12)' : colorFillAlter,
                            color: item.status === 'active' ? '#52c41a' : colorTextTertiary,
                            fontSize: isNested ? '10px' : '11px'
                          }}
                        >
                          {item.status === 'active'
                            ? '已激活'
                            : item.status === 'archived'
                              ? '已归档'
                              : String(item.status)}
                        </span>
                      ) : null}
                    </div>
                    {excerpt ? (
                      <div
                        className="mt-0.5"
                        style={{ color: colorTextTertiary, fontSize: smallFont }}
                      >
                        {clampText(excerpt, 120)}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        )
      }

      // ── mnemon_related：关联记忆遍历 ──
      if (tool.name === 'mnemon_related') {
        const results = asList(parsed?.results)
        return shell(
          MEMORY_TOOL_TITLES.mnemon_related,
          results.length > 0 ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              {results.length} 条
            </span>
          ) : null,
          results.length === 0 ? (
            empty('未找到关联记忆')
          ) : (
            <div>
              {results.map((item, i) => {
                const primary = String(item.content ?? '')
                const meta = [
                  typeof item.edge_type === 'string' ? item.edge_type : '',
                  typeof item.depth === 'number' ? `深度 ${item.depth}` : ''
                ]
                  .filter(Boolean)
                  .join(' · ')
                return renderEntry(i, primary, meta || undefined)
              })}
            </div>
          )
        )
      }

      // ── 写入类：沉淀/维护结果 ──
      const writeBody = (): React.ReactNode => {
        // mnemon_remember：JSON 输出，展示沉淀目标
        if (tool.name === 'mnemon_remember' && parsed) {
          const category = typeof parsed.category === 'string' ? `类别：${parsed.category}` : ''
          const importance =
            typeof parsed.importance === 'number' ? `重要度 ${parsed.importance}` : ''
          return (
            <div>
              <div style={{ color: colorText, fontSize }}>
                已沉淀到「{String(parsed.memory_body_name ?? '记忆空间')}」
              </div>
              {category || importance ? (
                <div className="mt-0.5" style={{ color: colorTextTertiary, fontSize: smallFont }}>
                  {[category, importance].filter(Boolean).join(' · ')}
                </div>
              ) : null}
            </div>
          )
        }
        return (
          <div style={{ color: colorText, fontSize }} className="whitespace-pre-wrap break-words">
            {clampText(tool.output, 500)}
          </div>
        )
      }
      return shell(
        '记忆写入',
        null,
        parsed === null && tool.name === 'mnemon_remember' ? empty('无法解析工具输出') : writeBody()
      )
    }

    const renderBlocks = (): React.ReactNode => {
      if (message.blocks.length === 0) {
        if (message.content) {
          return (
            <div style={{ color: colorText }} className="mb-2">
              {message.loading ? (
                <ShinyText baseColor={colorText} className="shiny-text-block">
                  <MarkdownLoad content={message.content} isDarkMode={isDarkMode} />
                </ShinyText>
              ) : (
                <MarkdownLoad content={message.content} isDarkMode={isDarkMode} />
              )}
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
        // 摘要压缩进行中（过渡态：流式替换为 historyCompacted 结果块；失败则随消息结束隐藏）
        if (block.type === 'historyCompacting' && message.loading) {
          return (
            <div
              key={blockIndex}
              style={{
                background: collapseBg,
                border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
                marginBottom: '6px',
                borderRadius: '8px',
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ShinyIcon icon={RiPictureInPicture2Line} size={16} baseColor={colorTextSecondary} />
              <ShinyText baseColor={colorText}>
                <TruncatedTooltipText
                  text="正在压缩早期对话…"
                  style={{ color: colorText, fontSize: '13px', flex: 1 }}
                />
              </ShinyText>
            </div>
          )
        }
        // 早期对话摘要压缩（置于消息顶部，紧随注入记忆；仅提示，不可展开）
        if (block.type === 'historyCompacted' && block.compaction) {
          const c = block.compaction
          return (
            <div
              key={blockIndex}
              style={{
                background: collapseBg,
                border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
                marginBottom: '6px',
                borderRadius: '8px',
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <RiPictureInPicture2Line
                size={16}
                style={{ color: colorTextSecondary, flexShrink: 0 }}
              />
              <TruncatedTooltipText
                text="早期对话已压缩"
                style={{ color: colorText, fontSize: '13px', flex: 1 }}
              />
              <span style={{ color: colorTextTertiary, fontSize: '13px', flexShrink: 0 }}>
                {c.compressedCount} 条 → 保留 {c.retainedCount} 条
              </span>
            </div>
          )
        }
        // 本轮注入的热记忆（置于消息顶部，默认折叠）
        if (block.type === 'memoryInjected' && block.memory) {
          const mem = block.memory
          const total = mem.user.length + mem.memory.length
          return (
            <Collapse
              key={blockIndex}
              items={[
                {
                  key: blockIndex,
                  label: (
                    <span className="flex items-center gap-2">
                      <RiBrain4Line size={14} style={{ color: colorTextSecondary }} />
                      <span style={{ color: colorTextSecondary }}>
                        注入记忆 · {total} 条
                        <span style={{ color: colorTextTertiary }}>
                          {mem.user.length > 0
                            ? `（用户画像 ${mem.user.length} · 项目记忆 ${mem.memory.length}）`
                            : `（项目记忆 ${mem.memory.length}）`}
                        </span>
                      </span>
                    </span>
                  ),
                  children: (
                    <div className="px-1.5 text-sm">
                      {mem.user.length > 0 ? (
                        <>
                          <div style={{ color: colorTextSecondary }} className="font-medium mb-1">
                            用户画像 USER（{mem.usage.user} 字节）
                          </div>
                          <ul className="list-disc pl-4 mb-2" style={{ color: colorText }}>
                            {mem.user.map((entry, i) => (
                              <li key={i} className="mb-0.5 break-words">
                                {entry}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {mem.memory.length > 0 ? (
                        <>
                          <div style={{ color: colorTextSecondary }} className="font-medium mb-1">
                            项目记忆 MEMORY（{mem.usage.memory} 字节）
                          </div>
                          <ul className="list-disc pl-4" style={{ color: colorText }}>
                            {mem.memory.map((entry, i) => (
                              <li key={i} className="mb-0.5 break-words">
                                {entry}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  )
                }
              ]}
              defaultActiveKey={[]}
              size="small"
              style={{ marginBottom: '6px', background: collapseBg }}
              className="rounded-lg border-0"
            />
          )
        }
        if (block.type === 'reasoning' && block.reasoning) {
          // 后续出现任意非推理块（正文/工具），或消息已结束（完成/中止/出错），都视为思考完成
          const hasContentAfter = mergedBlocks
            .slice(blockIndex + 1)
            .some((b) => b.type !== 'reasoning')
          const thinkingDone = hasContentAfter || !message.loading
          const thinkingLabel = thinkingDone ? '思考过程' : '思考中…'
          const thinkingLabelNode = (
            <span style={{ color: colorTextTertiary }} className="text-xs">
              {thinkingDone ? (
                thinkingLabel
              ) : (
                <ShinyText baseColor={colorTextTertiary}>{thinkingLabel}</ShinyText>
              )}
            </span>
          )
          const extra = thinkingDone
            ? ({
                label: thinkingLabelNode
              } as const)
            : ({
                label: thinkingLabelNode,
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
                      ref={setScrollRef(`reasoning-${blockIndex}`)}
                      className="max-h-64 overflow-y-auto chat-scrollbar text-sm border-l-2 pl-3 px-1.5"
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
                  : () => <ShinyIcon icon={RiBrain4Line} size={14} baseColor={colorTextTertiary} />
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
              {message.loading ? (
                <ShinyText baseColor={colorText} className="shiny-text-block">
                  <MarkdownLoad content={block.text} isDarkMode={isDarkMode} />
                </ShinyText>
              ) : (
                <MarkdownLoad content={block.text} isDarkMode={isDarkMode} />
              )}
            </div>
          )
        }
        if (block.type === 'tool' && block.tool) {
          if (block.tool.name === 'write_todos') {
            return renderWriteTodos(block.tool, blockIndex)
          }
          // Mnemon 记忆工具定制卡片（仅在完成后展示内容）
          if (
            block.tool.name.startsWith('mnemon_') &&
            (MEMORY_READ_TOOLS.includes(block.tool.name) ||
              MEMORY_WRITE_TOOLS.includes(block.tool.name)) &&
            block.tool.status === 'completed'
          ) {
            return renderMemoryToolCard(block.tool, blockIndex)
          }
          // 定制化卡片：deepagent 内置工具（ls / read_file / write_file / edit_file / glob / grep / execute）
          if (block.tool.card && block.tool.status === 'completed') {
            return renderToolCard(block.tool, blockIndex)
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
          // 进行中折叠头展示该工具完成后的定制卡片同款图标；mnemon 记忆工具用大脑图标；其余不显示
          const inProgressIcon =
            inProgress &&
            (TOOL_IN_PROGRESS_ICONS[toolName] ||
              (toolName.startsWith('mnemon_') ? RiBrain4Line : undefined))
          return (
            <Collapse
              key={blockIndex}
              items={[
                {
                  key: blockIndex,
                  label: inProgress ? (
                    <ShinyText baseColor={colorTextSecondary}>{toolLabel}</ShinyText>
                  ) : (
                    toolLabel
                  ),
                  collapsible: inProgress ? 'disabled' : undefined,
                  children: (
                    <div
                      ref={setScrollRef(`tool-${blockIndex}`)}
                      className="max-h-64 overflow-y-auto chat-scrollbar px-1.5"
                    >
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
                inProgressIcon
                  ? () => (
                      <ShinyIcon icon={inProgressIcon} size={14} baseColor={colorTextSecondary} />
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
                            ref={setScrollRef(`nested-reasoning-${ci}`)}
                            className="max-h-48 overflow-y-auto chat-scrollbar text-xs border-l-2 pl-3 px-1.5"
                            style={{ borderColor: colorBorderSecondary }}
                          >
                            {message.loading ? (
                              <ShinyText baseColor={colorText} className="shiny-text-block">
                                <MarkdownLoad content={child.reasoning} isDarkMode={isDarkMode} />
                              </ShinyText>
                            ) : (
                              <MarkdownLoad content={child.reasoning} isDarkMode={isDarkMode} />
                            )}
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
                    {message.loading ? (
                      <ShinyText baseColor={colorText} className="shiny-text-block">
                        <MarkdownLoad content={child.text} isDarkMode={isDarkMode} />
                      </ShinyText>
                    ) : (
                      <MarkdownLoad content={child.text} isDarkMode={isDarkMode} />
                    )}
                  </div>
                )
              }
              if (child.type === 'tool' && child.tool) {
                if (child.tool.name === 'write_todos') {
                  return renderWriteTodos(child.tool, ci, true)
                }
                // Mnemon 记忆工具定制卡片（嵌套）
                if (
                  child.tool.name.startsWith('mnemon_') &&
                  (MEMORY_READ_TOOLS.includes(child.tool.name) ||
                    MEMORY_WRITE_TOOLS.includes(child.tool.name)) &&
                  child.tool.status === 'completed'
                ) {
                  return renderMemoryToolCard(child.tool, ci, true)
                }
                // 定制化卡片：deepagent 内置工具
                if (child.tool.card && child.tool.status === 'completed') {
                  return renderToolCard(child.tool, ci, true)
                }
                const isPreparing = child.tool.status === 'preparing'
                const isExecuting =
                  child.tool.status === 'executing' || (!child.tool.status && !child.tool.output)
                const inProgress = Boolean(message.loading) && (isPreparing || isExecuting)
                const toolName = child.tool.name || '工具调用'
                const toolLabel = inProgress
                  ? `${toolName}${isPreparing ? ' · 生成中…' : ' · 执行中…'}`
                  : toolName
                // 进行中折叠头展示该工具完成后的定制卡片同款图标；mnemon 记忆工具用大脑图标；其余不显示
                const inProgressIcon =
                  inProgress &&
                  (TOOL_IN_PROGRESS_ICONS[toolName] ||
                    (toolName.startsWith('mnemon_') ? RiBrain4Line : undefined))
                return (
                  <Collapse
                    key={ci}
                    items={[
                      {
                        key: ci,
                        label: (
                          <span style={{ color: colorTextSecondary }} className="text-xs">
                            {inProgress ? (
                              <ShinyText baseColor={colorTextSecondary}>{toolLabel}</ShinyText>
                            ) : (
                              toolLabel
                            )}
                          </span>
                        ),
                        collapsible: inProgress ? 'disabled' : undefined,
                        children: (
                          <div
                            ref={setScrollRef(`nested-tool-${ci}`)}
                            className="max-h-48 overflow-y-auto chat-scrollbar ml-2 px-1.5"
                          >
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
                      inProgressIcon
                        ? () => (
                            <ShinyIcon
                              icon={inProgressIcon}
                              size={12}
                              baseColor={colorTextSecondary}
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
                            {childIsActive ? (
                              <ShinyIcon
                                icon={RiAiAgentLine}
                                size={12}
                                baseColor={childSaIconColor}
                              />
                            ) : (
                              <RiAiAgentLine size={12} style={{ color: childSaIconColor }} />
                            )}
                            <span style={{ color: colorTextSecondary }} className="text-xs">
                              {childIsActive ? (
                                <ShinyText baseColor={colorTextSecondary}>{childSaLabel}</ShinyText>
                              ) : (
                                childSaLabel
                              )}
                            </span>
                          </span>
                        ),
                        collapsible: childIsActive ? 'disabled' : undefined,
                        children: (
                          <div
                            ref={setScrollRef(`nested-subagent-${ci}`)}
                            className="max-h-48 overflow-y-auto chat-scrollbar pl-2 px-1.5"
                          >
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
                      {isActive ? (
                        <ShinyIcon icon={RiAiAgentLine} size={14} baseColor={saIconColor} />
                      ) : (
                        <RiAiAgentLine size={14} style={{ color: saIconColor }} />
                      )}
                      <span style={{ color: colorTextSecondary }}>
                        {isActive ? (
                          <ShinyText baseColor={colorTextSecondary}>{saLabel}</ShinyText>
                        ) : (
                          saLabel
                        )}
                      </span>
                    </span>
                  ),
                  collapsible: isActive ? 'disabled' : undefined,
                  children: (
                    <div
                      ref={setScrollRef(`subagent-${blockIndex}`)}
                      className="max-h-64 overflow-y-auto chat-scrollbar pl-2 px-1.5"
                    >
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
          {/* 仅展示「注入记忆」卡片期间的生成中指示（压缩进行中不显示，避免与压缩卡重复） */}
          {message.loading &&
          !message.content &&
          !message.reasoning_content &&
          (!message.toolCalls || message.toolCalls.length === 0) &&
          hasMemoryBlock &&
          !hasCompactingBlock ? (
            <div className="flex items-center gap-2 mt-1" style={{ color: colorTextSecondary }}>
              <ShinyIcon icon={RiSparkling2Line} size={14} baseColor={colorTextSecondary} />
              <ShinyText baseColor={colorTextSecondary}>
                <span style={{ fontSize: 13 }}>正在生成…</span>
              </ShinyText>
            </div>
          ) : null}
          {/* 内容输出中不展示操作按钮 */}
          {!message.loading && (
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
                    modal.confirm({
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
          )}
        </div>
      </div>
    )
  }
)

AssistantMessage.displayName = 'AssistantMessage'

export default AssistantMessage
