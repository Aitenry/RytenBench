import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { Tooltip, Collapse, theme } from 'antd'
import MessageActions from './MessageActions'
import type { HarnessDialogueUsageRow } from '../../../../../../main/database/mapper/harness'
import {
  RiRefreshLine,
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
import { useTranslation, Trans } from '@renderer/i18n'
import LoadingMessage from './LoadingMessage'
import ToolTextPreview from './ToolTextPreview'
import StreamTextWindow from './StreamTextWindow'
import type { Message, MessageBlock, ToolCall } from '@renderer/types/harness'
import {
  getToolStatusLabel,
  shouldShowSilenceIndicator,
  buildTaskSegments,
  type TaskSegment
} from '@renderer/views/harness/utils/harnessHelpers'

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

/** 数字等宽字体：计数里的数字用等宽字形，避免位数变化时整行抖动 */
const MONO_FONT = "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace"

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
  /** 当前话题 id（操作栏的评价索引用） */
  topicId: number | null
  /** 该轮提问的时间戳（操作栏算「用时」用） */
  turnStartedAt?: number
  /** 该条回复的真实用量（harness_dialogue_usage 行；无回传时为 undefined） */
  usage?: HarnessDialogueUsageRow
  /** 分支：把到这条为止的消息复制到新话题并切过去 */
  onBranch: (upToIndex: number) => Promise<void>
  onCopy: (text: string, id: string) => void
  onDelete: (index: number) => void
}

/** 工具卡片文本：单行显示 + 溢出省略，悬停展示完整内容（无箭头 Tooltip，仅在溢出时出现）
 *
 *  两个易踩的坑，都在这里一次性收口：
 *  1. 省略号只对「块级（或块化）且宽度受约束」的盒子生效。此前这里是内联 span，
 *     overflow/text-overflow 被完全忽略，且 clientWidth 恒为 0 → 长文本（execute 的整条命令）
 *     直接顶破卡片、悬停提示还对短文本误触发。故此处显式 display:block，
 *     并加 1px 容差避免子像素取整导致误判。
 *  2. 光泽必须做在「承载文字的那一个元素」上：外层 ShinyText 包内层截断 span 时，
 *     省略号失效；且外层基色若用 colorText，暗色主题下基色 rgba(255,255,255,0.85)
 *     与高光 rgba(255,255,255,0.9) 几乎同色，看起来「只有图标在发光、文字没有光」。
 *     这里用 shinyBaseColor=colorTextSecondary（与 ShinyIcon 同基色）+ 纯白高光，
 *     明暗两种主题下光泽都清晰可见。
 */
const TruncatedTooltipText: React.FC<{
  text: string
  style?: React.CSSProperties
  /** 光泽基色（传入即启用光泽扫过；建议与同排 ShinyIcon 的 baseColor 一致） */
  shinyBaseColor?: string
  /** 光泽高光色，默认纯白（与 ShinyIcon 扫过色一致） */
  shinyShineColor?: string
}> = ({ text, style, shinyBaseColor, shinyShineColor = '#fff' }) => {
  const spanRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const check = (): void => {
      setOverflow(el.scrollWidth > el.clientWidth + 1)
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
        className={shinyBaseColor ? 'shiny-text' : undefined}
        style={{
          // 覆盖 .shiny-text 的 display:inline-block —— 省略号必须是块级盒子
          display: 'block',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
          ...(shinyBaseColor
            ? ({
                '--shiny-base': shinyBaseColor,
                '--shiny-shine': shinyShineColor
              } as React.CSSProperties)
            : null),
          ...style
        }}
      >
        {text}
      </span>
    </Tooltip>
  )
}

/**
 * 流式静默指示行（「正在生成…」）。
 *
 * 为什么单独抽成 memo 子组件：这行的判定依赖「距最后一次 chunk 有多久」，需要一个
 * 500ms 时钟。时钟状态若放在 AssistantMessage 里，每秒两次 tick 会把整条消息（长任务下
 * 可达上百个块、几十万字符）整棵重渲染——2026-09-18 实测：一个 40 轮目标任务的会话里，
 * 渲染进程 workingSet 从 534MB 一路涨到 5991MB，且**流内静默期**（没有任何 chunk 到达）
 * 依然以约 40MB/10s 稳定增长，正是这个时钟在反复重建巨型子树。时钟挪进来之后，
 * tick 只影响这一行；父组件只在内容真的变化（合批刷入）时才重渲染。
 */
const SilenceGeneratingHint = React.memo(function SilenceGeneratingHint({
  loading,
  hasStartedContent,
  getLastChunkAt,
  color,
  size = 14
}: {
  loading: boolean
  hasStartedContent: boolean
  /**
   * 取「最后一次 chunk 时间」的稳定 getter。
   *
   * 刻意不传 `lastChunkAt` 数值：这个时间每批刷入都变，传值会让块级渲染缓存（见 renderBlocks）
   * 每批都失效。传稳定的 getter 后，本组件在自己的 500ms tick 里去读最新值。
   */
  getLastChunkAt: () => number
  color: string
  /** 图标尺寸与字号：主消息用 14，子代理嵌套块用 12（与旧实现一致） */
  size?: number
}): React.ReactNode {
  const { t } = useTranslation()
  const [, tick] = useState(0)

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => tick((v) => v + 1), 500)
    return () => clearInterval(id)
  }, [loading])

  const silent = shouldShowSilenceIndicator({
    loading,
    hasStartedContent,
    now: Date.now(),
    lastChunkAt: getLastChunkAt()
  })
  if (!silent) return null

  return (
    <div className="flex items-center gap-2 mt-1" style={{ color }}>
      <ShinyIcon icon={RiSparkling2Line} size={size} baseColor={color} />
      <ShinyText baseColor={color}>
        <span style={{ fontSize: size === 14 ? 13 : 12 }}>
          {t('harness.assistantMessage.silentGenerating')}
        </span>
      </ShinyText>
    </div>
  )
})

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
    topicId,
    turnStartedAt,
    usage,
    onBranch,
    onCopy,
    onDelete
  }) => {
    const { t, i18n } = useTranslation()
    const { token } = theme.useToken()
    const isCopied = copiedId === message.id

    /**
     * 任务分段折叠状态（key = 段 key，值 = 是否折起）。
     *
     * 只记「用户手动改过」的段：默认态由状态推导——已完成且不是最后一段的任务默认折起，
     * 进行中的与最后一段默认展开（最后一段通常承载最终答复，绝不能默认折掉）。
     */
    const [foldOverride, setFoldOverride] = useState<Record<string, boolean>>({})
    /** 展开了「清单」的任务段（点标签右侧的列表图标切换；与折叠状态相互独立） */
    const [listOpenKeys, setListOpenKeys] = useState<string[]>([])

    // 块级渲染缓存：key 变化即整表重建（见 renderBlocks 里的说明）
    const blockCacheRef = useRef<{
      key: string
      map: WeakMap<MessageBlock, { sig: string; node: React.ReactNode }>
    }>({ key: '', map: new WeakMap() })

    // 「最后一次 chunk 时间」的稳定读取器：值每批都变，但引用必须稳定，
    // 否则块级缓存每批失效（静默提示改为自己定时读这个 getter）
    const lastChunkAtRef = useRef(message.lastChunkAt ?? message.timestamp)
    lastChunkAtRef.current = message.lastChunkAt ?? message.timestamp
    const getLastChunkAt = useCallback((): number => lastChunkAtRef.current, [])

    // 复制文本按需生成：此前是 useMemo([message])，流式期间每批刷入都要把全部块的正文拼一遍
    // （实测 160k 字符 ≈ 数毫秒 + 等量垃圾），而它只在用户点「复制」时用得到。
    const getCopyText = useCallback((): string => {
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
      if (!message.loading) return
      Object.values(scrollRefs.current).forEach((el) => {
        if (el) {
          el.scrollTop = el.scrollHeight
        }
      })
      // 只在「有新 chunk 到达」或进入/退出流式时同步：原先不传依赖数组（每次渲染都跑），
      // 每次都要对每个折叠容器读 scrollHeight 强制同步布局；巨型消息（上百块）下是明确
      // 的卡顿与内存压力来源。滚动位置随内容增长更新，语义不变。
    }, [message.loading, message.lastChunkAt])

    // 仅有「注入记忆」/「压缩中」块时仍渲染（卡片可见），其余空消息走 LoadingMessage；
    // 「正在重试」块同理（展示重试进度行，避免被 LoadingMessage 整卡替换）。
    // 这些标志此前是 4 次独立的全表扫描（每次刷入都要跑），并成一次遍历并记忆化。
    const blockFlags = useMemo(() => {
      let memory = false
      let compacting = false
      let retrying = false
      let visibleTool = false
      for (const b of message.blocks) {
        if (b.type === 'memoryInjected') memory = true
        else if (b.type === 'historyCompacting') compacting = true
        else if (b.type === 'retrying') retrying = true
        else if (
          b.type === 'tool' &&
          b.tool &&
          (b.tool.status === 'preparing' ||
            b.tool.status === 'executing' ||
            b.tool.status === 'completed' ||
            (!b.tool.status && !b.tool.output))
        ) {
          visibleTool = true
        }
      }
      return { memory, compacting, retrying, visibleTool }
    }, [message.blocks])
    const hasMemoryBlock = blockFlags.memory
    const hasCompactingBlock = blockFlags.compacting
    const hasRetryingBlock = blockFlags.retrying
    const hasVisibleToolBlock = blockFlags.visibleTool

    /**
     * 合并相邻的 reasoning 块：模型会把思考过程拆成 token 级事件，不合并就是满屏「思考过程」。
     * 必须「复制后合并」（不可原地改写共享状态对象，否则文本会随渲染轮次自复制增长）。
     * 放在顶层记忆化：块列表身份不变时（例如只改了 loading / 折叠态）不重跑这趟合并。
     */
    const mergedBlocks = useMemo(() => {
      const out: MessageBlock[] = []
      for (const block of message.blocks) {
        if (block.type === 'reasoning') {
          const last = out[out.length - 1]
          if (last && last.type === 'reasoning') {
            out[out.length - 1] = {
              ...last,
              reasoning: (last.reasoning || '') + (block.reasoning || '')
            }
            continue
          }
        }
        out.push(block)
      }
      return out
    }, [message.blocks])

    // 流式静默指示：推理型模型生成大工具参数期间，流内可能长时间无任何事件（连工具名
    // 都不发）——此时已输出的内容之后显示「正在生成…」光泽行，诚实反馈「仍在生成」，
    // 工具调用一旦到达即切换为真实工具卡。
    // 时钟在 SilenceGeneratingHint 内部（500ms tick 只重渲染那一行，不碰这棵子树）。
    // 子代理折叠手动展开记录（key = 会话 causeId 等稳定标识）：进行中强制展开、
    // 完成后默认收起，仍可手动点开查看输出。defaultActiveKey 只在首次挂载生效，
    // 状态翻转（running→completed）后不会自动收起，故改为受控 activeKey。
    const [saOpenOverride, setSaOpenOverride] = useState<Record<string, boolean>>({})
    const hasStartedContent = Boolean(
      message.content || message.reasoning_content || message.blocks.length > 0
    )
    // 静默行只在「流式进行中且无其它状态行可看」时挂载；是否真的静默交给子组件按时钟判定
    const showSilenceGenerating =
      Boolean(message.loading) &&
      hasStartedContent &&
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
                {t('harness.assistantMessage.todoList')}
              </span>
            ) : (
              <span
                style={{
                  color: colorTextSecondary,
                  fontSize: isNested ? '12px' : '14px',
                  fontWeight: 500
                }}
              >
                <Trans
                  i18nKey="harness.assistantMessage.todoCompleted"
                  values={{ completed: completedCount, total }}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
              </span>
            )}
            {inProgressCount > 0 && !allCompleted ? (
              <span
                style={{
                  color: colorTextTertiary,
                  fontSize: isNested ? '11px' : '12px'
                }}
              >
                <Trans
                  i18nKey="harness.assistantMessage.todoInProgress"
                  count={inProgressCount}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
              </span>
            ) : null}
          </div>
          {total === 0 ? (
            <div style={{ color: colorTextTertiary, fontSize: isNested ? '12px' : '13px' }}>
              {t('harness.assistantMessage.todoEmpty')}
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
                  t('harness.assistantMessage.todoFallback', { index: i + 1 })

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
        const status =
          progress === 'preparing'
            ? ` · ${t('harness.assistantMessage.toolPreparing')}`
            : ` · ${t('harness.assistantMessage.toolExecuting')}`
        const Icon = TOOL_IN_PROGRESS_ICONS[tool.name] || RiTerminalBoxLine
        return renderRow(
          <ShinyIcon icon={Icon} size={size} baseColor={colorTextSecondary} />,
          <TruncatedTooltipText
            text={`${summary || tool.name || t('harness.assistantMessage.toolCallFallback')}${status}`}
            shinyBaseColor={colorTextSecondary}
            style={{ color: colorText, fontSize, flex: 1 }}
          />
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
                <Trans
                  i18nKey="harness.assistantMessage.itemCount"
                  count={card.count}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
              </span>
            ) : undefined
          )
        case 'glob':
          return renderPathRow(
            <RiSearchLine size={size} style={iconStyle} />,
            card.pattern || '',
            card.count !== undefined ? (
              <span style={{ color: colorTextTertiary, fontSize, flexShrink: 0 }}>
                <Trans
                  i18nKey="harness.assistantMessage.itemCount"
                  count={card.count}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
              </span>
            ) : undefined
          )
        case 'grep':
          return renderPathRow(
            <RiSearchLine size={size} style={iconStyle} />,
            card.pattern || '',
            card.count !== undefined ? (
              <span style={{ color: colorTextTertiary, fontSize, flexShrink: 0 }}>
                <Trans
                  i18nKey="harness.assistantMessage.matchCount"
                  count={card.count}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
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
    /** 工具中文标签（卡片标题）：只存词条键，求值处用组件内的 t */
    const MEMORY_TOOL_TITLES = {
      mnemon_status: 'harness.assistantMessage.memoryStatus',
      mnemon_memory_bodies: 'harness.assistantMessage.memorySpaces',
      mnemon_recall: 'harness.assistantMessage.memoryRecall',
      mnemon_document_search: 'harness.assistantMessage.memoryDocumentSearch',
      mnemon_related: 'harness.assistantMessage.memoryRelated'
    } as const

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
          <div className="max-h-64 overflow-y-auto harness-scrollbar pl-0.5">{body}</div>
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
            t('harness.assistantMessage.memorySpaces'),
            t('harness.assistantMessage.memoryBodyActivate', {
              active: parsed?.memory_bodies_active ?? 0,
              total: parsed?.memory_bodies_total ?? 0
            })
          ],
          [
            t('harness.assistantMessage.memoryBodyHot'),
            parsed?.runtime_memory_configured
              ? t('common.state.configured')
              : t('common.state.notConfigured')
          ],
          [
            t('harness.assistantMessage.memoryBodyDocuments'),
            parsed?.documents_configured
              ? t('common.state.configured')
              : t('common.state.notConfigured')
          ]
        ]
        return shell(
          t(MEMORY_TOOL_TITLES.mnemon_status),
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
                        {String(
                          s.name ??
                            t('harness.assistantMessage.memoryBodySpaceFallback', {
                              index: i + 1
                            })
                        )}{' '}
                        ·{' '}
                        {t('harness.assistantMessage.memoryBodyInsights', {
                          count: Number(s.totalInsights ?? 0)
                        })}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              empty(t('harness.assistantMessage.statusParseFailed'))
            )}
          </div>
        )
      }

      // ── mnemon_memory_bodies：记忆空间目录 ──
      if (tool.name === 'mnemon_memory_bodies') {
        const bodies = asList(parsed?.bodies)
        return shell(
          t(MEMORY_TOOL_TITLES.mnemon_memory_bodies),
          parsed ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              <Trans
                i18nKey="harness.assistantMessage.memoryBodyTotalActive"
                values={{
                  total: Number(parsed.total ?? 0),
                  active: Number(parsed.activeCount ?? 0)
                }}
                components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
              />
            </span>
          ) : null,
          bodies.length === 0 ? (
            empty(t('harness.assistantMessage.memoryBodyEmpty'))
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
                        {String(b.name ?? t('harness.assistantMessage.memoryBodyUnnamed'))}
                      </span>
                      <span
                        className="shrink-0 rounded px-1.5 py-px"
                        style={{
                          background: b.active ? 'rgba(82,196,26,0.12)' : colorFillAlter,
                          color: b.active ? '#52c41a' : colorTextTertiary,
                          fontSize: isNested ? '10px' : '11px'
                        }}
                      >
                        {b.active
                          ? t('harness.assistantMessage.memoryBodyActive')
                          : t('harness.assistantMessage.memoryBodyInactive')}
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
                    <Trans
                      i18nKey="harness.assistantMessage.memoryBodyInsights"
                      count={Number(b.totalInsights ?? 0)}
                      components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                    />
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
          t(MEMORY_TOOL_TITLES.mnemon_recall),
          results.length > 0 ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              <Trans
                i18nKey="harness.assistantMessage.memoryBodyCount"
                count={results.length}
                components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
              />
            </span>
          ) : null,
          results.length === 0 ? (
            empty(
              typeof parsed?.hint === 'string'
                ? String(parsed.hint)
                : t('harness.assistantMessage.memoryRecallEmpty')
            )
          ) : (
            <div>
              {results.map((item, i) => {
                const primary = String(item.content ?? '')
                const meta = [
                  typeof item.memory_body_name === 'string'
                    ? t('harness.assistantMessage.memoryEntrySource', {
                        name: item.memory_body_name
                      })
                    : '',
                  typeof item.score === 'number'
                    ? t('harness.assistantMessage.memoryEntryScore', {
                        score: item.score.toFixed(2)
                      })
                    : ''
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
          t(MEMORY_TOOL_TITLES.mnemon_document_search),
          results.length > 0 ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              <Trans
                i18nKey="harness.assistantMessage.memoryDocumentCount"
                count={results.length}
                components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
              />
            </span>
          ) : null,
          results.length === 0 ? (
            empty(t('harness.assistantMessage.memoryDocumentEmpty'))
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
                            ? t('harness.assistantMessage.memoryDocumentActive')
                            : item.status === 'archived'
                              ? t('harness.assistantMessage.memoryDocumentArchived')
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
          t(MEMORY_TOOL_TITLES.mnemon_related),
          results.length > 0 ? (
            <span style={{ color: colorTextTertiary, fontSize: smallFont, flexShrink: 0 }}>
              <Trans
                i18nKey="harness.assistantMessage.memoryBodyCount"
                count={results.length}
                components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
              />
            </span>
          ) : null,
          results.length === 0 ? (
            empty(t('harness.assistantMessage.memoryRelatedEmpty'))
          ) : (
            <div>
              {results.map((item, i) => {
                const primary = String(item.content ?? '')
                const meta = [
                  typeof item.edge_type === 'string' ? item.edge_type : '',
                  typeof item.depth === 'number'
                    ? t('harness.assistantMessage.memoryEntryDepth', { depth: item.depth })
                    : ''
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
          const category =
            typeof parsed.category === 'string'
              ? t('harness.assistantMessage.memoryCategory', { category: parsed.category })
              : ''
          const importance =
            typeof parsed.importance === 'number'
              ? t('harness.assistantMessage.memoryImportance', { importance: parsed.importance })
              : ''
          return (
            <div>
              <div style={{ color: colorText, fontSize }}>
                {t('harness.assistantMessage.memoryRemembered', {
                  name: String(
                    parsed.memory_body_name ?? t('harness.assistantMessage.memorySpaces')
                  )
                })}
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
      // 注意：mnemon_remember 的返回值是**纯文本**（不是 JSON），所以不能因为没有
      // 解析出 JSON 就显示「无法解析」——writeBody 内部已按「JSON 优先、否则原样展示」兜底
      return shell(t('harness.assistantMessage.memoryWrite'), null, writeBody())
    }

    /** mnemon 记忆工具进行中卡片：大脑图标 + 标题 + 状态后缀，光泽扫过（完成后仍是专属结果卡） */
    const renderMemoryInProgressCard = (
      tool: ToolCall,
      key: string | number,
      isNested = false,
      progress: 'preparing' | 'executing'
    ): React.ReactNode => {
      const size = isNested ? 14 : 16
      const fontSize = isNested ? '12px' : '13px'
      const title = MEMORY_TOOL_TITLES[tool.name]
        ? t(MEMORY_TOOL_TITLES[tool.name])
        : MEMORY_WRITE_TOOLS.includes(tool.name)
          ? t('harness.assistantMessage.memoryWrite')
          : t('harness.assistantMessage.memoryTool')
      const status =
        progress === 'preparing'
          ? ` · ${t('harness.assistantMessage.toolPreparing')}`
          : ` · ${t('harness.assistantMessage.toolExecuting')}`
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
          <TruncatedTooltipText
            text={`${title}${status}`}
            shinyBaseColor={colorTextSecondary}
            style={{ color: colorTextSecondary, fontSize, flex: 1 }}
          />
        </div>
      )
    }

    const renderBlocks = (): React.ReactNode => {
      if (message.blocks.length === 0) {
        if (message.content) {
          return (
            <div style={{ color: colorText }} className="mb-2">
              {/* 无块消息（历史/异常路径）同样走窗口：整段正文可能是几十万字符 */}
              <StreamTextWindow
                content={message.content}
                renderMarkdown={(text) => <MarkdownLoad content={text} isDarkMode={isDarkMode} />}
              />
            </div>
          )
        }
        return null
      }

      // 合并相邻的 reasoning 块：防止模型把思考过程拆成 token 级事件，导致满屏"思考过程"
      // 必须「复制后合并」：此前直接改写原块对象（last.reasoning += ...），渲染期变异共享
      // 状态对象，一旦出现相邻同型块，文本会随渲染轮次自复制增长且永不裁剪（渲染进程 OOM
      // 隐患）；复制后合并对原状态零副作用。
      // 合并结果在组件顶层记忆化（mergedBlocks，见 useMemo）：块列表身份不变时不必重跑。

      // ── 块级渲染缓存（2026-09-18 仿真实测量出来的主成本）────────────────────
      // 实测（.git/sim/render-sim.mjs，375 块 / 160k 字符的真实形态消息）：
      //   内容增长的一次刷入 165ms，其中「内容不变、仅强制重渲染」也要 178ms——也就是说
      //   成本几乎全在**每次刷入重建全部块的 vdom**，真正需要重算的增长块只占 ~10ms。
      // React 在 element 引用完全相同时会整棵跳过该子树的重渲染；因此这里按「块对象身份」
      // 缓存渲染结果：流式期间未变化的块对象身份不变（useHarnessHandlers 是不可变更新），
      // 命中缓存的块不再参与重建。
      //
      // 缓存键：块渲染体读到的可变父状态（主题、语言、loading、子代理折叠态）。这些一变就
      // 整表失效重建。注意 lastChunkAt 刻意不进键——它每批都变，传值会让缓存永不命中，
      // 静默提示改为传稳定的 getter（getLastChunkAt）。
      const blockCacheKey = `${isDarkMode}|${i18n.language}|${message.loading ? 1 : 0}|${JSON.stringify(saOpenOverride)}|${colorText}|${colorTextSecondary}|${colorTextTertiary}|${colorFillAlter}|${colorBorderSecondary}|${collapseBg}`
      const blockNodes = blockCacheRef.current
      if (blockNodes.key !== blockCacheKey) {
        blockNodes.key = blockCacheKey
        blockNodes.map = new WeakMap()
      }

      // 逐块的「跨块依赖」：思考块是否已完成 = 其**之后**是否出现过非推理块。
      // 它随后续追加的新块而翻转，因此必须进缓存键（否则新块到达时旧的思考块会命中缓存、
      // 停在「思考中」不切换成「思考完成」——仿真的「增量 vs 冷启动」比对就是靠这个抓出来的）。
      // 一次反向遍历得出，替换原先逐块 slice+some 的 O(B²) 扫描。
      const hasContentAfterFlags = new Array<boolean>(mergedBlocks.length)
      let seenNonReasoning = false
      for (let i = mergedBlocks.length - 1; i >= 0; i -= 1) {
        hasContentAfterFlags[i] = seenNonReasoning
        if (mergedBlocks[i].type !== 'reasoning') seenNonReasoning = true
      }

      const renderBlock = (block: MessageBlock, blockIndex: number): React.ReactNode => {
        // 模型请求失败后自动重试中（过渡行：重试成功恢复输出或轮次结束时由 useHarnessHandlers 移除；
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
              <TruncatedTooltipText
                text={t('harness.assistantMessage.retrying', { attempt, retries })}
                shinyBaseColor={colorTextSecondary}
                style={{ color: colorText, fontSize: '13px', flex: 1 }}
              />
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
              <TruncatedTooltipText
                text={t('harness.assistantMessage.compacting')}
                shinyBaseColor={colorTextSecondary}
                style={{ color: colorText, fontSize: '13px', flex: 1 }}
              />
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
                text={t('harness.assistantMessage.compacted')}
                style={{ color: colorText, fontSize: '13px', flex: 1 }}
              />
              <span style={{ color: colorTextTertiary, fontSize: '13px', flexShrink: 0 }}>
                <Trans
                  i18nKey="harness.assistantMessage.compactedCounts"
                  values={{ compressed: c.compressedCount, retained: c.retainedCount }}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
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
                        <Trans
                          i18nKey="harness.assistantMessage.memoryInjected"
                          count={total}
                          components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                        />
                        <span style={{ color: colorTextTertiary }}>
                          {mem.user.length > 0 ? (
                            <Trans
                              i18nKey="harness.assistantMessage.memoryInjectedUser"
                              values={{ user: mem.user.length, memory: mem.memory.length }}
                              components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                            />
                          ) : (
                            <Trans
                              i18nKey="harness.assistantMessage.memoryInjectedProject"
                              values={{ count: mem.memory.length }}
                              components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                            />
                          )}
                        </span>
                      </span>
                    </span>
                  ),
                  children: (
                    // 固定展示高度 + 纵向滚动条（注入条目多/文本长时内容不撑爆整卡）
                    <div className="max-h-64 overflow-y-auto harness-scrollbar px-1.5 text-sm">
                      {mem.user.length > 0 ? (
                        <>
                          <div style={{ color: colorTextSecondary }} className="font-medium mb-1">
                            <Trans
                              i18nKey="harness.assistantMessage.userProfileBytes"
                              values={{ bytes: mem.usage.user }}
                              components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                            />
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
                            <Trans
                              i18nKey="harness.assistantMessage.projectMemoryBytes"
                              values={{ bytes: mem.usage.memory }}
                              components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                            />
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
          const hasContentAfter = hasContentAfterFlags[blockIndex] ?? false
          const thinkingDone = hasContentAfter || !message.loading
          const thinkingLabel = thinkingDone
            ? t('harness.assistantMessage.thinkingDone')
            : t('harness.assistantMessage.thinkingInProgress')
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
                      className="max-h-64 overflow-y-auto harness-scrollbar text-sm border-l-2 pl-3 px-1.5"
                      style={{ borderColor: colorBorderSecondary }}
                    >
                      <StreamTextWindow
                        content={block.reasoning}
                        renderMarkdown={(text) => (
                          <MarkdownLoad content={text} isDarkMode={isDarkMode} />
                        )}
                      />
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
              {/* 长正文窗口：模型整段贴文件/输出时，单个 text 块可能几十万字符，
                  默认只渲染末尾一段，避免每批 chunk 全量重解析 markdown */}
              <StreamTextWindow
                content={block.text}
                renderMarkdown={(text) => <MarkdownLoad content={text} isDarkMode={isDarkMode} />}
              />
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
          const toolName = block.tool.name || t('harness.assistantMessage.toolCallFallback')
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
          const toolLabel = getToolStatusLabel(t, toolName, phase)
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
                      className="max-h-64 overflow-y-auto harness-scrollbar px-1.5"
                    >
                      <div style={{ color: colorTextSecondary }} className="font-medium mb-1">
                        {t('harness.assistantMessage.toolInput')}
                      </div>
                      <pre
                        style={{ background: codeBg }}
                        className="p-2 rounded text-sm overflow-x-auto"
                      >
                        {JSON.stringify(block.tool.input, null, 2)}
                      </pre>
                      <div style={{ color: colorTextSecondary }} className="font-medium mt-2 mb-1">
                        {t('harness.assistantMessage.toolOutput')}
                      </div>
                      {/* 纯文本输出走 ToolTextPreview：超长（read_file 单次上限 2,000,000 字符）
                          只渲染开头一段，避免渲染进程被文本节点撑到 OOM */}
                      <ToolTextPreview
                        text={
                          typeof block.tool.output === 'string'
                            ? block.tool.output
                            : JSON.stringify(block.tool.output, null, 2)
                        }
                        codeBg={codeBg}
                      />
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
                  {t('harness.assistantMessage.dispatched')}
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
            ? t('harness.assistantMessage.subAgentRunning', { name: sa.name })
            : isError
              ? t('harness.assistantMessage.subAgentError', { name: sa.name })
              : t('harness.assistantMessage.subAgentCompleted', { name: sa.name })
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
                            {t('harness.assistantMessage.thinkingDone')}
                          </span>
                        ),
                        children: (
                          <div
                            ref={setScrollRef(`nested-reasoning-${ci}`)}
                            className="max-h-48 overflow-y-auto harness-scrollbar text-xs border-l-2 pl-3 px-1.5"
                            style={{ borderColor: colorBorderSecondary }}
                          >
                            {/* 子智能体的推理同样走窗口：整段贴文件时也会是几十万字符 */}
                            <StreamTextWindow
                              content={child.reasoning}
                              renderMarkdown={(text) => (
                                <MarkdownLoad content={text} isDarkMode={isDarkMode} />
                              )}
                            />
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
                    <StreamTextWindow
                      content={child.text}
                      renderMarkdown={(text) => (
                        <MarkdownLoad content={text} isDarkMode={isDarkMode} />
                      )}
                    />
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
                const toolName = child.tool.name || t('harness.assistantMessage.toolCallFallback')
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
                const toolLabel = getToolStatusLabel(t, toolName, phase)
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
                            className="max-h-48 overflow-y-auto harness-scrollbar ml-2 px-1.5"
                          >
                            <div
                              style={{ color: colorTextSecondary }}
                              className="font-medium mb-1 text-xs"
                            >
                              {t('harness.assistantMessage.toolInput')}
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
                                  {t('harness.assistantMessage.toolOutput')}
                                </div>
                                <ToolTextPreview
                                  text={
                                    typeof child.tool.output === 'string'
                                      ? child.tool.output
                                      : JSON.stringify(child.tool.output, null, 2)
                                  }
                                  codeBg={codeBg}
                                />
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
                  ? t('harness.assistantMessage.subAgentRunning', { name: childSa.name })
                  : childIsError
                    ? t('harness.assistantMessage.subAgentError', { name: childSa.name })
                    : t('harness.assistantMessage.subAgentCompleted', { name: childSa.name })
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
                            className="max-h-48 overflow-y-auto harness-scrollbar pl-2 px-1.5"
                          >
                            {childSa.taskDescription ? (
                              <div style={{ color: colorTextSecondary }} className="text-xs mb-1">
                                {childSa.taskDescription}
                              </div>
                            ) : null}
                            {child.children && child.children.length > 0 ? (
                              <>
                                {renderChildren(child.children, depth + 1)}
                                {childIsActive && !lastChildIsActiveTool(child.children) ? (
                                  <SilenceGeneratingHint
                                    loading
                                    hasStartedContent
                                    getLastChunkAt={getLastChunkAt}
                                    color={colorTextSecondary}
                                    size={12}
                                  />
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
                      className="max-h-64 overflow-y-auto harness-scrollbar pl-2 px-1.5"
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
                          {isActive && !lastChildIsActiveTool(block.children) ? (
                            <SilenceGeneratingHint
                              loading
                              hasStartedContent
                              getLastChunkAt={getLastChunkAt}
                              color={colorTextSecondary}
                              size={12}
                            />
                          ) : null}
                        </>
                      ) : isActive ? (
                        <div style={{ color: colorTextTertiary }} className="text-sm italic">
                          {t('harness.assistantMessage.subAgentExecuting')}
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
      }

      /** 单块的渲染（走块级缓存）：块身份 + 跨块推导值 组成缓存签名 */
      const renderBlockAt = (blockIndex: number): React.ReactNode => {
        const block = mergedBlocks[blockIndex]
        // 缓存签名：块身份之外，还要带上「跨块依赖」的推导值（当前只有思考完成态）。
        // 漏掉它就会在追加新块时命中过期缓存——仿真比对（增量 vs 冷启动）能抓到这类问题。
        const sig = `${blockIndex}|${hasContentAfterFlags[blockIndex] ? 1 : 0}`
        const hit = blockNodes.map.get(block)
        if (hit && hit.sig === sig) return hit.node
        const node = renderBlock(block, blockIndex)
        blockNodes.map.set(block, { sig, node })
        return node
      }

      /** 任务清单（点折叠头上的列表图标才显示）：状态字形 + 条目，取自该段最后一次 write_todos 快照 */
      const renderTaskChecklist = (segment: TaskSegment): React.ReactNode => (
        <div
          data-task-checklist
          className="harness-scrollbar"
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            margin: '0 0 8px',
            paddingLeft: 2,
            borderLeft: `2px solid ${colorBorderSecondary}`
          }}
        >
          {segment.snapshot.map((item, i) => {
            const itemDone = item.status === 'completed'
            const itemRunning = item.status === 'in_progress'
            return (
              <div key={i} className="flex items-start gap-2" style={{ padding: '3px 0 3px 10px' }}>
                {itemDone ? (
                  <RiCheckboxCircleLine
                    size={13}
                    style={{ color: colorTextTertiary, marginTop: 3, flexShrink: 0 }}
                  />
                ) : (
                  <RiCheckboxBlankCircleLine
                    size={13}
                    style={{
                      color: itemRunning ? token.colorPrimary : colorBorderSecondary,
                      marginTop: 3,
                      flexShrink: 0
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: '18px',
                    color: itemDone ? colorTextTertiary : colorTextSecondary,
                    wordBreak: 'break-word'
                  }}
                >
                  {item.content}
                </span>
              </div>
            )
          })}
        </div>
      )

      /**
       * 按任务分段渲染（2026-09-18：消息内容按任务折叠）。
       *
       * - 折叠外观与其他折叠内容完全同款：antd Collapse（collapseBg + rounded-lg border-0 +
       *   size=small），标签是小的次级文本——不自造一套头样式；
       * - 正文里**不再渲染 write_todos 工具卡**（有任务头就重复了）：清单改由标签右侧的
       *   列表图标按需展开；
       * - 折起时 `destroyOnHidden` 卸载子节点：渲染开销与挂载块数成正比（仿真台实测 375 块
       *   253~305KB/次刷入、80 块 77KB/次），这是折叠的意义所在；
       * - 分段依据是流里的 write_todos 快照（见 buildTaskSegments），无需存储层改动；
       * - 默认折叠态：**流式进行中**只折已完成的、进行中/末段保持展开（要能看见正在干什么）；
       *   **一轮结束或从库里加载的历史消息一律折起**（用户要求：历史消息默认折叠、块结束后折叠）。
       *   注意末段里往往接着「最终答复正文」——那部分会从折叠里摘出来常显（见 answerIndices），
       *   否则一折就把答案藏了。
       */
      const segments = buildTaskSegments(mergedBlocks)
      const lastSegIndex = segments.length - 1
      const hasTasks = segments.some((s) => s.task)

      /** 段外壳：折叠外观与「思考过程」「子代理」完全同款（antd Collapse + collapseBg + size=small） */
      const renderSegmentShell = (args: {
        segKey: string
        label: React.ReactNode
        collapsed: boolean
        children: React.ReactNode
        /** 折叠外常显的内容（末段的最终答复正文） */
        tail?: React.ReactNode
      }): React.ReactNode => (
        <React.Fragment key={args.segKey}>
          <Collapse
            items={[{ key: args.segKey, label: args.label, children: args.children }]}
            activeKey={args.collapsed ? [] : [args.segKey]}
            onChange={(keys) =>
              setFoldOverride((prev) => ({ ...prev, [args.segKey]: !keys.includes(args.segKey) }))
            }
            destroyOnHidden
            size="small"
            style={{ marginBottom: args.tail ? '4px' : '6px', background: collapseBg }}
            className="task-segment-collapse rounded-lg border-0"
          />
          {args.tail}
        </React.Fragment>
      )

      return segments.map((segment, segIndex) => {
        // 正文块：跳过 write_todos（清单另开），其余照旧走块级缓存
        const allIndices = segment.blockIndices.filter((i) => !segment.writeIndices.includes(i))
        // 末段末尾连续的正文本块 = 最终答复：摘到折叠外面常显。
        // 只在「这条消息真的有任务段」时摘——没有任务就不会折叠，摘了反而没人渲染它
        // （仿真台抓到过：普通问答的正文会整段消失）。
        let answerIndices: number[] = []
        if (hasTasks && segIndex === lastSegIndex && !message.loading) {
          let cut = allIndices.length
          while (cut > 0 && mergedBlocks[allIndices[cut - 1]]?.type === 'text') cut -= 1
          answerIndices = allIndices.slice(cut)
        }
        const visibleIndices = allIndices.slice(0, allIndices.length - answerIndices.length)
        const blocksNode = visibleIndices.map(renderBlockAt)
        const answerNode = answerIndices.map(renderBlockAt)

        // ── 规划前的那一段（第一个 write_todos 之前）─────────────────────────
        // 里面有大量「思考过程 + 探索用的 read/grep」，一条 300 块的消息里能有 57 块堆在这，
        // 任务段折起来之后它就是正文里唯一剩下的那堵墙（用户：「前面有思考需要移出来」）。
        // 有任务时把它也收成一段；**没有任务的消息（普通问答）保持原样全显示**。
        if (!segment.task) {
          if (!hasTasks) return blocksNode
          const collapsed = foldOverride[segment.key] ?? !message.loading
          const headLabel = (
            <span
              data-task-segment={segment.key}
              className="flex items-center min-w-0"
              style={{ width: '100%', gap: 8 }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  flex: '0 0 auto',
                  background: colorBorderSecondary
                }}
              />
              <span
                style={{
                  flex: '1 1 auto',
                  fontSize: 12,
                  lineHeight: '18px',
                  color: colorTextSecondary,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left'
                }}
              >
                {t('harness.assistantMessage.preflight')}
              </span>
              <span
                style={{
                  flex: '0 0 auto',
                  fontSize: 11,
                  lineHeight: '16px',
                  minWidth: 22,
                  textAlign: 'center',
                  padding: '0 5px',
                  borderRadius: 9,
                  border: `1px solid ${colorBorderSecondary}`,
                  color: colorTextTertiary,
                  fontFamily: MONO_FONT
                }}
              >
                {visibleIndices.length}
              </span>
            </span>
          )
          return renderSegmentShell({
            segKey: segment.key,
            label: headLabel,
            collapsed,
            children: blocksNode,
            tail: answerNode
          })
        }

        const isLast = segIndex === lastSegIndex
        // 流式中：已完成且非末段才折起；已结束/历史消息：一律折起
        const defaultCollapsed = message.loading
          ? segment.status === 'completed' && !isLast
          : true
        const collapsed = foldOverride[segment.key] ?? defaultCollapsed
        const done = segment.status === 'completed'
        const active = segment.status === 'in_progress'
        const listOpen = listOpenKeys.includes(segment.key)
        const taskLabel = (
          <span
            data-task-segment={segment.key}
            className="flex items-center min-w-0"
            style={{ width: '100%', gap: 8 }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flex: '0 0 auto',
                background: active
                  ? token.colorPrimary
                  : done
                    ? colorTextTertiary
                    : colorBorderSecondary
              }}
            />
            {/* 任务名占据剩余宽度并可截断：这样右侧的计数胶囊与清单按钮才会贴到最右，
                长任务名也不会把整行顶出容器。
                刻意**不加光泽动效**：shiny-text 是 1.5s 无限循环，而一个任务常常跑几分钟，
                会让整行从头闪到尾（用户明确反馈「一直在闪」）；状态由左侧圆点 + 加粗表达。 */}
            <span
              style={{
                flex: '1 1 auto',
                fontSize: 12,
                lineHeight: '18px',
                color: done ? colorTextTertiary : colorTextSecondary,
                fontWeight: active ? 600 : 400,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'left'
              }}
            >
              {segment.task}
            </span>
            <span
              style={{
                flex: '0 0 auto',
                fontSize: 11,
                lineHeight: '16px',
                // 定宽 + 居中：位数不同时各行数字也对齐（等宽字形只用于数字）
                minWidth: 22,
                textAlign: 'center',
                padding: '0 5px',
                borderRadius: 9,
                border: `1px solid ${colorBorderSecondary}`,
                color: colorTextTertiary,
                fontFamily: MONO_FONT
              }}
            >
              {visibleIndices.length}
            </span>
            {segment.snapshot.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  // 别冒泡到 Collapse 标签，否则会连带折叠整段
                  e.stopPropagation()
                  setListOpenKeys((prev) =>
                    prev.includes(segment.key)
                      ? prev.filter((k) => k !== segment.key)
                      : [...prev, segment.key]
                  )
                }}
                title={t('harness.assistantMessage.taskList')}
                className="flex items-center border-none cursor-pointer"
                style={{
                  flex: '0 0 auto',
                  padding: 0,
                  background: 'transparent',
                  color: listOpen ? token.colorPrimary : colorTextTertiary
                }}
              >
                <RiListCheck size={14} />
              </button>
            ) : null}
          </span>
        )

        return renderSegmentShell({
          segKey: segment.key,
          label: taskLabel,
          collapsed,
          children: (
            <>
              {listOpen ? renderTaskChecklist(segment) : null}
              {blocksNode}
            </>
          ),
          tail: answerNode
        })
      })
    }
    return (
      <div className="flex mb-6">
        <div className="w-full">
          {renderBlocks()}
          {/* 流式静默指示：正文已出现但超过阈值无新 chunk（模型仍在生成大参数等）。
              自带走时时钟，tick 不会重渲染整条消息。 */}
          {showSilenceGenerating ? (
            <SilenceGeneratingHint
              loading
              hasStartedContent={hasStartedContent}
              getLastChunkAt={getLastChunkAt}
              color={colorTextSecondary}
            />
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
                <span style={{ fontSize: 13 }}>
                  {t('harness.assistantMessage.silentGenerating')}
                </span>
              </ShinyText>
            </div>
          ) : null}
          {/* 内容输出中不展示操作栏 */}
          {!message.loading && (
            <MessageActions
              message={message}
              index={index}
              turnStartedAt={turnStartedAt}
              topicId={topicId}
              usage={usage}
              onBranch={onBranch}
              getCopyText={getCopyText}
              isCopied={isCopied}
              onCopy={onCopy}
              onDelete={onDelete}
            />
          )}
        </div>
      </div>
    )
  }
)

AssistantMessage.displayName = 'AssistantMessage'

export default AssistantMessage
