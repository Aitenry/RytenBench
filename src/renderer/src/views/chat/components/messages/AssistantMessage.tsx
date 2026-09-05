import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
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
  RiFileEditLine,
  RiPencilLine,
  RiFolderOpenLine,
  RiSearchLine,
  RiTerminalBoxLine,
  RiBrain4Line,
  RiPictureInPicture2Line,
  RiSparkling2Line,
  RiEye2Line
} from '@remixicon/react'
import MarkdownLoad from '@renderer/components/markdown/MarkdownLoad'
import { ShinyText, ShinyIcon } from '@renderer/components/effects/ShinyText'
import LoadingMessage from './LoadingMessage'
import type { Message, MessageBlock, ToolCall } from '@renderer/types/chat'
import {
  getToolStatusLabel,
  shouldShowSilenceIndicator
} from '@renderer/views/chat/utils/chatHelpers'

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
  read_file: RiEye2Line,
  write_file: RiFileEditLine,
  edit_file: RiPencilLine,
  ls: RiFolderOpenLine,
  glob: RiSearchLine,
  grep: RiSearchLine,
  execute: RiTerminalBoxLine,
  write_todos: RiListCheck,
  read_todos: RiListCheck
}

/** 定制化卡片工具集：进行中/完成态共用同款卡片外形（光泽只在进行中扫过，完成后静止） */
const CARD_TOOLS = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'ls',
  'glob',
  'grep',
  'execute'
])

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

    // 复制文本：优先拼接 blocks 中的正文（修复：此前只取 message.content,
    // 子智能体/工具型消息复制为空或缺失文本,与展示内容不一致）
    const copyText = useMemo(() => {
      const parts: string[] = []
      const collect = (blocks: MessageBlock[] | undefined): void => {
        for (const b of blocks ?? []) {
          if (b.type === 'text' && b.text) parts.push(b.text)
          else if (b.type === 'subAgent') {
            if (b.subAgent?.output) parts.push(b.subAgent.output)
            collect(b.children)
          }
        }
      }
      collect(message.blocks)
      const joined = parts.join('\n\n').trim()
      return joined || message.content
    }, [message])

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

    // 仅有「注入记忆」/「压缩中」块时仍渲染（卡片可见），其余空消息走 LoadingMessage；
    // 「正在重试」块同理（展示重试进度行，避免被 LoadingMessage 整卡替换）
    const hasMemoryBlock = message.blocks.some((b) => b.type === 'memoryInjected')
    const hasCompactingBlock = message.blocks.some((b) => b.type === 'historyCompacting')
    const hasRetryingBlock = message.blocks.some((b) => b.type === 'retrying')

    // 流式静默指示：推理型模型生成大工具参数期间，流内可能长时间无任何事件（连工具名
    // 都不发）——此时已输出的内容之后显示「正在生成…」光泽行，诚实反馈「仍在生成」，
    // 工具调用一旦到达即切换为真实工具卡。每 500ms 刷新一次时钟。
    const [, setSilenceTick] = useState(0)
    // 子代理折叠手动展开记录（key = 会话 causeId 等稳定标识）：进行中强制展开、
    // 完成后默认收起，仍可手动点开查看输出。defaultActiveKey 只在首次挂载生效，
    // 状态翻转（running→completed）后不会自动收起，故改为受控 activeKey。
    const [saOpenOverride, setSaOpenOverride] = useState<Record<string, boolean>>({})
    useEffect(() => {
      if (!message.loading) return
      const id = setInterval(() => setSilenceTick((t) => t + 1), 500)
      return () => clearInterval(id)
    }, [message.loading])
    const silenceNow = Date.now()
    const hasVisibleToolBlock = message.blocks.some(
      (b) =>
        b.type === 'tool' &&
        b.tool &&
        (b.tool.status === 'preparing' ||
          b.tool.status === 'executing' ||
          b.tool.status === 'completed' ||
          (!b.tool.status && !b.tool.output))
    )
    const isSilent = shouldShowSilenceIndicator({
      loading: Boolean(message.loading),
      hasStartedContent: Boolean(
        message.content || message.reasoning_content || message.blocks.length > 0
      ),
      now: silenceNow,
      lastChunkAt: message.lastChunkAt ?? message.timestamp
    })
    const showSilenceGenerating =
      isSilent &&
      !hasVisibleToolBlock &&
      !hasMemoryBlock &&
      !hasCompactingBlock &&
      !hasRetryingBlock

    /** 最后一个子块是否为进行中工具卡（是则不再显示静默指示，工具卡本身已有状态） */
    const lastChildIsActiveTool = (children: MessageBlock[]): boolean => {
      const last = children[children.length - 1]
      if (!last || last.type !== 'tool' || !last.tool) return false
      const st = last.tool.status
      return st === 'preparing' || st === 'executing' || (!st && !last.tool.output)
    }

    if (
      message.loading &&
      !message.content &&
      !message.reasoning_content &&
      (!message.toolCalls || message.toolCalls.length === 0) &&
      !hasMemoryBlock &&
      !hasCompactingBlock &&
      !hasRetryingBlock
    ) {
      return <LoadingMessage colorTextSecondary={colorTextSecondary} />
    }

    const codeBg = isDarkMode ? 'rgba(255,255,255,0.06)' : '#f3f4f6'
    const collapseBg = isDarkMode ? 'rgba(255,255,255,0.04)' : '#f9fafb'

    /** 解析待办数组：write_todos 的 input（对象）或 read_todos 的 output（JSON 字符串）
     *  匹配 Claude Code / deepagents 的 TodoWrite 工具 schema：
     *    { todos: [{ content, status: "pending"|"in_progress"|"completed", activeForm }] }
     *  也兼容 { items: [...] } 格式 */
    const extractTodos = (
      source: Record<string, unknown> | string | null | undefined
    ): Record<string, unknown>[] | null => {
      if (source == null) return null
      try {
        const obj =
          typeof source === 'string' ? (JSON.parse(source) as Record<string, unknown>) : source
        if (Array.isArray(obj.todos)) return obj.todos as Record<string, unknown>[]
        if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[]
        return null
      } catch {
        return null
      }
    }

    /** 待办清单卡片（write_todos / read_todos 共用，非折叠）：图标 + 统计头 + 清单行 */
    const renderTodoCard = (
      todos: Record<string, unknown>[],
      key: string | number,
      isNested: boolean
    ): React.ReactNode => {
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
              style={{ color: total > 0 && allCompleted ? '#52c41a' : colorTextSecondary }}
            />
            {total === 0 ? (
              <span
                style={{
                  color: colorTextSecondary,
                  fontSize: isNested ? '12px' : '14px',
                  fontWeight: 500
                }}
              >
                待办清单
              </span>
            ) : (
              <span
                style={{
                  color: colorTextSecondary,
                  fontSize: isNested ? '12px' : '14px',
                  fontWeight: 500
                }}
              >
                {completedCount}/{total} 已完成
              </span>
            )}
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
          {total === 0 ? (
            <div style={{ color: colorTextTertiary, fontSize: isNested ? '12px' : '13px' }}>
              暂无待办，可先让模型用 write_todos 制定任务计划
            </div>
          ) : (
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
          )}
        </div>
      )
    }

    /** write_todos：从入参（模型提交的整份清单）渲染卡片；空清单不渲染 */
    const renderWriteTodos = (
      tool: ToolCall,
      key: string | number,
      isNested = false
    ): React.ReactNode => {
      const todos = extractTodos((tool.input || {}) as Record<string, unknown>)
      if (!todos || todos.length === 0) return null
      return renderTodoCard(todos, key, isNested)
    }

    /** read_todos：完成后从输出（{ todos: [...] } JSON）渲染同款待办清单卡片；
     *  未完成或解析失败返回 null，由下方通用工具折叠兜底展示原始输入输出 */
    const renderReadTodos = (
      tool: ToolCall,
      key: string | number,
      isNested = false
    ): React.ReactNode => {
      if (tool.status !== 'completed') return null
      const todos = extractTodos(tool.output)
      if (!todos) return null
      return renderTodoCard(todos, key, isNested)
    }

    /** 渲染 deepagent 内置工具卡片（非折叠）
     *  进行中（生成参数/执行）与完成态同款扁平外形：border / 背景 / 语义图标 / 参数摘要一致，
     *  仅「参数构建中…/执行中…」状态文字与光泽扫过（ShinyText/ShinyIcon）；完成后恢复静态。
     *  参数构建期间（input 为空）退化为工具名 + 状态，参数到达后显示路径/命令摘要 */
    const renderToolCard = (
      tool: ToolCall,
      key: string | number,
      isNested = false,
      progress?: 'preparing' | 'executing'
    ): React.ReactNode => {
      const card = tool.card
      const size = isNested ? 14 : 16
      const fontSize = isNested ? '12px' : '13px'

      const iconStyle = { color: colorTextSecondary, flexShrink: 0 }
      const inProgress = progress === 'preparing' || progress === 'executing'

      const renderRow = (
        icon: React.ReactNode,
        label: React.ReactNode,
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
          {label}
          {extra}
        </div>
      )

      /** 进行中态：语义图标 + 参数摘要（输入中能解析就显示，否则退化为工具名）+ 状态后缀，光泽扫过 */
      if (inProgress) {
        const input = (tool.input || {}) as Record<string, unknown>
        let summary = ''
        switch (tool.name) {
          case 'read_file':
          case 'write_file':
          case 'edit_file':
            summary = typeof input.file_path === 'string' ? input.file_path : ''
            break
          case 'ls':
            summary = typeof input.path === 'string' ? input.path : ''
            break
          case 'glob':
          case 'grep':
            summary = typeof input.pattern === 'string' ? input.pattern : ''
            break
          case 'execute':
            summary = typeof input.command === 'string' ? input.command : ''
            break
        }
        const status = progress === 'preparing' ? ' · 参数构建中…' : ' · 执行中…'
        const Icon = TOOL_IN_PROGRESS_ICONS[tool.name] || RiTerminalBoxLine
        return renderRow(
          <ShinyIcon icon={Icon} size={size} baseColor={colorTextSecondary} />,
          <ShinyText baseColor={colorText} style={{ flex: 1, minWidth: 0 }}>
            <TruncatedTooltipText
              text={`${summary || tool.name || '工具调用'}${status}`}
              style={{ color: colorText, fontSize, flex: 1 }}
            />
          </ShinyText>
        )
      }

      // 完成态：无卡片数据视为无定制展示，返回 null 交由通用折叠兜底
      if (!card) return null

      const renderPathRow = (
        icon: React.ReactNode,
        label: string,
        extra?: React.ReactNode
      ): React.ReactNode =>
        renderRow(
          icon,
          <TruncatedTooltipText text={label} style={{ color: colorText, fontSize, flex: 1 }} />,
          extra
        )

      switch (tool.name) {
        case 'read_file':
          return renderPathRow(<RiEye2Line size={size} style={iconStyle} />, card.path || '')
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

    /** mnemon 记忆工具进行中卡片：大脑图标 + 中文标题 + 状态后缀，光泽扫过（完成后仍是专属结果卡） */
    const renderMemoryInProgressCard = (
      tool: ToolCall,
      key: string | number,
      isNested = false,
      progress: 'preparing' | 'executing'
    ): React.ReactNode => {
      const size = isNested ? 14 : 16
      const fontSize = isNested ? '12px' : '13px'
      const title =
        MEMORY_TOOL_TITLES[tool.name] ??
        (MEMORY_WRITE_TOOLS.includes(tool.name) ? '记忆写入' : '记忆工具')
      const status = progress === 'preparing' ? ' · 参数构建中…' : ' · 执行中…'
      return (
        <div
          key={key}
          style={{
            background: collapseBg,
            border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
            marginBottom: isNested ? '4px' : '6px',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          className="rounded-lg"
        >
          <ShinyIcon icon={RiBrain4Line} size={size} baseColor={colorTextSecondary} />
          <ShinyText baseColor={colorTextSecondary} style={{ flex: 1, minWidth: 0 }}>
            <TruncatedTooltipText
              text={`${title}${status}`}
              style={{ color: colorTextSecondary, fontSize, flex: 1 }}
            />
          </ShinyText>
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
      // 必须「复制后合并」：此前直接改写原块对象（last.reasoning += ...），渲染期变异共享
      // 状态对象，一旦出现相邻同型块，文本会随渲染轮次自复制增长且永不裁剪（渲染进程 OOM
      // 隐患）；复制后合并对原状态零副作用
      const mergedBlocks: MessageBlock[] = []
      for (const block of message.blocks) {
        if (block.type === 'reasoning') {
          const last = mergedBlocks[mergedBlocks.length - 1]
          if (last && last.type === 'reasoning') {
            mergedBlocks[mergedBlocks.length - 1] = {
              ...last,
              reasoning: (last.reasoning || '') + (block.reasoning || '')
            }
            continue
          }
        }
        mergedBlocks.push(block)
      }

      return mergedBlocks.map((block, blockIndex) => {
        // 模型请求失败后自动重试中（过渡行：重试成功恢复输出或轮次结束时由 useChatHandlers 移除；
        // 仅消息进行中展示，避免历史消息出现残留）
        if (block.type === 'retrying' && block.retrying) {
          if (!message.loading) return null
          const { attempt, retries } = block.retrying
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
              <ShinyIcon icon={RiRefreshLine} size={16} baseColor={colorTextSecondary} />
              <ShinyText baseColor={colorText}>
                <TruncatedTooltipText
                  text={`正在重试（第 ${attempt}/${retries} 次）…`}
                  style={{ color: colorText, fontSize: '13px', flex: 1 }}
                />
              </ShinyText>
            </div>
          )
        }
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
                    // 固定展示高度 + 纵向滚动条（注入条目多/文本长时内容不撑爆整卡）
                    <div className="max-h-64 overflow-y-auto chat-scrollbar px-1.5 text-sm">
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
              <MarkdownLoad content={block.text} isDarkMode={isDarkMode} />
            </div>
          )
        }
        if (block.type === 'tool' && block.tool) {
          if (block.tool.name === 'write_todos') {
            const todosCard = renderWriteTodos(block.tool, blockIndex)
            if (todosCard) return todosCard
          }
          // read_todos 专属卡片：完成后渲染；未完成/解析失败返回 null，落到下方通用折叠
          if (block.tool.name === 'read_todos') {
            const readTodosCard = renderReadTodos(block.tool, blockIndex)
            if (readTodosCard) return readTodosCard
          }
          const isPreparing = block.tool.status === 'preparing'
          const isExecuting =
            block.tool.status === 'executing' || (!block.tool.status && !block.tool.output)
          // 仅在消息进行中才视为进行中状态，避免中止/完成后转圈不消失
          const inProgress = Boolean(message.loading) && (isPreparing || isExecuting)
          const phase: 'preparing' | 'executing' | undefined = inProgress
            ? isPreparing
              ? 'preparing'
              : 'executing'
            : undefined
          const toolName = block.tool.name || '工具调用'
          // Mnemon 记忆工具：进行中 = 同款光泽状态卡；完成后 = 专属结果卡
          if (
            toolName.startsWith('mnemon_') &&
            (MEMORY_READ_TOOLS.includes(toolName) || MEMORY_WRITE_TOOLS.includes(toolName))
          ) {
            if (block.tool.status === 'completed') {
              return renderMemoryToolCard(block.tool, blockIndex)
            }
            if (phase) return renderMemoryInProgressCard(block.tool, blockIndex, false, phase)
          }
          // 系统工具：进行中与完成态共用同款卡片（光泽只在进行中扫过，完成后静止）
          if (CARD_TOOLS.has(toolName)) {
            if (phase) return renderToolCard(block.tool, blockIndex, false, phase)
            if (block.tool.card && block.tool.status === 'completed') {
              return renderToolCard(block.tool, blockIndex)
            }
          }
          // 其余工具（含无卡片数据的异常完成态）：通用折叠，进行中光泽头 + 输入/输出详情
          const toolLabel = getToolStatusLabel(toolName, phase)
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
          // 后台派发轻量卡：仅名称 + 简述 + 会话 id（不含智能体内容/结果——结果在顶部栏查看）
          if (sa.status === 'dispatched') {
            return (
              <div
                key={blockIndex}
                style={{
                  background: collapseBg,
                  border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
                  marginBottom: '6px',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <RiAiAgentLine size={16} style={{ color: colorTextSecondary, flexShrink: 0 }} />
                <span style={{ color: colorText, fontSize: 13, fontWeight: 500, flexShrink: 0 }}>
                  {sa.name}
                </span>
                <span style={{ color: colorTextSecondary, fontSize: 13, flexShrink: 0 }}>
                  已派发后台任务
                </span>
                {sa.taskDescription ? (
                  <TruncatedTooltipText
                    text={sa.taskDescription}
                    style={{ color: colorTextTertiary, fontSize: 13, flex: 1 }}
                  />
                ) : (
                  <span style={{ flex: 1 }} />
                )}
                {sa.subagentId ? (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5"
                    style={{
                      background: colorFillAlter,
                      color: colorTextTertiary,
                      fontSize: 11,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
                    }}
                  >
                    {sa.subagentId}
                  </span>
                ) : null}
              </div>
            )
          }
          const isActive = sa.status === 'started' || sa.status === 'running'
          const isError = sa.status === 'error'
          const saLabel = isActive
            ? `${sa.name} · 执行中…`
            : isError
              ? `${sa.name} · 出错`
              : `${sa.name} · 已完成`
          const saIconColor = isError ? '#ef4444' : isActive ? '#1677ff' : '#52c41a'
          // 折叠受控（key = causeId 唯一标识，缺省按位置回退）
          const saPanelKey = sa.causeId ?? `sa-${blockIndex}`
          const saOpen = isActive ? true : (saOpenOverride[saPanelKey] ?? false)

          // 递归渲染智能体的嵌套子块（text / tool / reasoning / subAgent）
          const renderChildren = (children: MessageBlock[], depth = 0): React.ReactNode => {
            // 合并相邻的 reasoning 块：防止模型把 reasoning 拆成 token 级事件，导致满屏"思考过程"
            // 合并相邻的 text 块：避免流式输出把正文拆成 "Good" / "," / "found" 等碎片
            // 必须「复制后合并」：渲染期不得改写原状态对象（否则文本随渲染轮次自复制增长）
            const mergedChildren: MessageBlock[] = []
            for (const child of children) {
              if (child.type === 'reasoning') {
                const last = mergedChildren[mergedChildren.length - 1]
                if (last && last.type === 'reasoning') {
                  mergedChildren[mergedChildren.length - 1] = {
                    ...last,
                    reasoning: (last.reasoning || '') + (child.reasoning || '')
                  }
                  continue
                }
              }
              if (child.type === 'text') {
                const last = mergedChildren[mergedChildren.length - 1]
                if (last && last.type === 'text') {
                  mergedChildren[mergedChildren.length - 1] = {
                    ...last,
                    text: (last.text || '') + (child.text || '')
                  }
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
                    <MarkdownLoad content={child.text} isDarkMode={isDarkMode} />
                  </div>
                )
              }
              if (child.type === 'tool' && child.tool) {
                if (child.tool.name === 'write_todos') {
                  const todosCard = renderWriteTodos(child.tool, ci, true)
                  if (todosCard) return todosCard
                }
                // read_todos 专属卡片（嵌套）：完成后渲染；未完成/解析失败回退通用折叠
                if (child.tool.name === 'read_todos') {
                  const readTodosCard = renderReadTodos(child.tool, ci, true)
                  if (readTodosCard) return readTodosCard
                }
                const isPreparing = child.tool.status === 'preparing'
                const isExecuting =
                  child.tool.status === 'executing' || (!child.tool.status && !child.tool.output)
                const inProgress = Boolean(message.loading) && (isPreparing || isExecuting)
                const phase: 'preparing' | 'executing' | undefined = inProgress
                  ? isPreparing
                    ? 'preparing'
                    : 'executing'
                  : undefined
                const toolName = child.tool.name || '工具调用'
                // Mnemon 记忆工具（嵌套）：进行中 = 光泽状态卡；完成后 = 专属结果卡
                if (
                  toolName.startsWith('mnemon_') &&
                  (MEMORY_READ_TOOLS.includes(toolName) || MEMORY_WRITE_TOOLS.includes(toolName))
                ) {
                  if (child.tool.status === 'completed') {
                    return renderMemoryToolCard(child.tool, ci, true)
                  }
                  if (phase) return renderMemoryInProgressCard(child.tool, ci, true, phase)
                }
                // 系统工具（嵌套）：进行中与完成态共用同款卡片（光泽只在进行中扫过）
                if (CARD_TOOLS.has(toolName)) {
                  if (phase) return renderToolCard(child.tool, ci, true, phase)
                  if (child.tool.card && child.tool.status === 'completed') {
                    return renderToolCard(child.tool, ci, true)
                  }
                }
                // 其余工具（含无卡片数据的异常完成态）：通用折叠，进行中光泽头 + 输入/输出详情
                const toolLabel = getToolStatusLabel(toolName, phase)
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
                // 嵌套折叠受控（key = 子会话 causeId 或 父级标识 + 位置回退）
                const childSaPanelKey = childSa.causeId ?? `nsa:${sa.causeId ?? blockIndex}:c${ci}`
                const childSaOpen = childIsActive
                  ? true
                  : (saOpenOverride[childSaPanelKey] ?? false)
                return (
                  <Collapse
                    // key 用数组序号（修复：此前 `name-${isActive?'a':'d'}` 在状态翻转时强制换 key
                    // 重挂 Collapse 丢失展开态,同名子智能体两次委派还会产生重复 key 致 React 复用错位）
                    key={`nested-sa-${ci}`}
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
                              <>
                                {renderChildren(child.children, depth + 1)}
                                {childIsActive &&
                                isSilent &&
                                !lastChildIsActiveTool(child.children) ? (
                                  <div
                                    className="flex items-center gap-2 mt-1"
                                    style={{ color: colorTextSecondary }}
                                  >
                                    <ShinyIcon
                                      icon={RiSparkling2Line}
                                      size={12}
                                      baseColor={colorTextSecondary}
                                    />
                                    <ShinyText baseColor={colorTextSecondary}>
                                      <span style={{ fontSize: 12 }}>正在生成…</span>
                                    </ShinyText>
                                  </div>
                                ) : null}
                              </>
                            ) : childSa.error ? (
                              <div style={{ color: '#ef4444' }} className="text-xs">
                                {childSa.error}
                              </div>
                            ) : null}
                          </div>
                        )
                      }
                    ]}
                    activeKey={childSaOpen ? [ci] : []}
                    onChange={(keys) => {
                      if (!childIsActive) {
                        setSaOpenOverride((m) => ({
                          ...m,
                          [childSaPanelKey]: keys.includes(String(ci))
                        }))
                      }
                    }}
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
              // key 用数组序号（修复：状态翻转换 key 重挂 Collapse 丢失展开态；同名子智能体
              // 两次委派产生重复 key 致 React 复用错位）
              key={`sa-${blockIndex}`}
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
                        <>
                          {renderChildren(block.children)}
                          {/* 子代理流静默：已输出内容但超阈值无新事件（模型在生成工具参数）
                              且最后一个子块不是进行中工具卡时，显示「正在生成…」 */}
                          {isActive && isSilent && !lastChildIsActiveTool(block.children) ? (
                            <div
                              className="flex items-center gap-2 mt-1"
                              style={{ color: colorTextSecondary }}
                            >
                              <ShinyIcon
                                icon={RiSparkling2Line}
                                size={12}
                                baseColor={colorTextSecondary}
                              />
                              <ShinyText baseColor={colorTextSecondary}>
                                <span style={{ fontSize: 12 }}>正在生成…</span>
                              </ShinyText>
                            </div>
                          ) : null}
                        </>
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
              activeKey={saOpen ? [blockIndex] : []}
              onChange={(keys) => {
                // 进行中折叠禁用（collapsible disabled），此处只处理完成/出错后的手动展开收起
                if (!isActive) {
                  setSaOpenOverride((m) => ({
                    ...m,
                    [saPanelKey]: keys.includes(String(blockIndex))
                  }))
                }
              }}
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
          {/* 流式静默指示：正文已出现但超过阈值无新 chunk（模型仍在生成大参数等） */}
          {showSilenceGenerating ? (
            <div className="flex items-center gap-2 mt-1" style={{ color: colorTextSecondary }}>
              <ShinyIcon icon={RiSparkling2Line} size={14} baseColor={colorTextSecondary} />
              <ShinyText baseColor={colorTextSecondary}>
                <span style={{ fontSize: 13 }}>正在生成…</span>
              </ShinyText>
            </div>
          ) : null}
          {/* 仅展示「注入记忆」卡片期间的生成中指示（压缩/重试进行中不显示，避免与过渡行重复） */}
          {message.loading &&
          !message.content &&
          !message.reasoning_content &&
          (!message.toolCalls || message.toolCalls.length === 0) &&
          hasMemoryBlock &&
          !hasCompactingBlock &&
          !hasRetryingBlock ? (
            <div className="flex items-center gap-2 mt-1" style={{ color: colorTextSecondary }}>
              <ShinyIcon icon={RiSparkling2Line} size={14} baseColor={colorTextSecondary} />
              <ShinyText baseColor={colorTextSecondary}>
                <span style={{ fontSize: 13 }}>正在生成…</span>
              </ShinyText>
            </div>
          ) : null}
          {/* 内容输出中不展示操作按钮 */}
          {!message.loading && (
            <div className="flex items-center justify-end gap-2 mt-3">
              <Tooltip title={isCopied ? '已复制' : '复制'}>
                <button
                  onClick={() => onCopy(copyText, message.id)}
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
