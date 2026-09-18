import React, { useState } from 'react'
import { Trans, useTranslation } from '@renderer/i18n'
import { RiArrowRightSLine, RiErrorWarningLine, RiTerminalBoxLine } from '@remixicon/react'
import { ShinyIcon } from '@renderer/components/effects/ShinyText'
import type { ToolCall, ToolCard, ToolCardKind } from '@renderer/types/harness'
import { useWorkspaceBridge } from '../../contexts/workspace-bridge'
import { formatBytes, TOOL_CARD_ICONS, TOOL_IN_PROGRESS_ICONS } from '../../utils/toolIcons'
import { MONO_FONT, TruncatedTooltipText } from './TruncatedTooltipText'

/**
 * 内置工具的结果卡片（read_file / write_file / edit_file / ls / glob / grep / execute）。
 *
 * 与旧实现的区别（2026-09-19）：这些工具的结果**不再进入 IPC/数据库**，聊天里只留
 * 这张卡片；要看内容就点卡片——文件类工具在右侧面板打开真实文件，ls 定位目录，
 * glob/grep/execute 打开结果详情页签（主进程按 topicId+callId 按需返回）。
 *
 * 因此卡片必须自己把「这次调用干了什么、结果多大」讲清楚：
 * 路径/模式/命令一行，右侧是行数/字节/条目数/命中数/退出码，失败时显示原因。
 */

export interface ToolCardStyle {
  isDarkMode: boolean
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  colorFillAlter: string
  colorBorderSecondary: string
}

/** 工具进行中（参数构建中 / 执行中）时能立刻显示的参数摘要 */
function inputSummary(name: string, input: Record<string, unknown> | undefined): string {
  const value = (key: string): string =>
    typeof input?.[key] === 'string' ? (input[key] as string) : ''
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return value('file_path')
    case 'ls':
      return value('path')
    case 'glob':
    case 'grep':
      return value('pattern')
    case 'execute':
      return value('command')
    default:
      return ''
  }
}

/** 人类可读字节数：见 utils/toolIcons（卡片与详情页签共用） */

/** 卡片外壳：图标 + 主文本（单行截断 + 悬停全文）+ 右侧元信息 + 悬停动作提示 */
const CardShell: React.FC<{
  style: ToolCardStyle
  isNested: boolean
  icon: React.ReactNode
  primary: string
  meta?: React.ReactNode
  /** 有 onClick 即表示可点开：悬停变底色并显示右侧箭头 */
  onClick?: () => void
  actionTitle?: string
  primaryColor?: string
}> = ({ style, isNested, icon, primary, meta, onClick, actionTitle, primaryColor }) => {
  const [hover, setHover] = useState(false)
  const bg = style.isDarkMode ? 'rgba(255,255,255,0.04)' : '#f9fafb'
  const hoverBg = style.isDarkMode ? 'rgba(255,255,255,0.08)' : '#f1f2f4'
  const fontSize = isNested ? '12px' : '13px'
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={onClick ? actionTitle : undefined}
      style={{
        background: hover && onClick ? hoverBg : bg,
        border: 'var(--ant-line-width) var(--ant-line-type) var(--ant-color-border)',
        marginBottom: isNested ? '4px' : '6px',
        borderRadius: '8px',
        padding: '9px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s'
      }}
    >
      {icon}
      <TruncatedTooltipText
        text={primary}
        style={{ color: primaryColor ?? style.colorText, fontSize, flex: 1 }}
      />
      {meta}
      {onClick ? (
        <RiArrowRightSLine
          size={isNested ? 14 : 16}
          style={{
            color: style.colorTextTertiary,
            opacity: hover ? 1 : 0,
            transition: 'opacity 0.15s',
            flexShrink: 0
          }}
        />
      ) : null}
    </div>
  )
}

/** 右侧元信息：数字用等宽字形（与「任务段步数胶囊」同一套排版口径） */
const Meta: React.FC<{ isNested: boolean; color: string; children: React.ReactNode }> = ({
  isNested,
  color,
  children
}) => (
  <span
    style={{
      color,
      fontSize: isNested ? '11px' : '12px',
      flexShrink: 0,
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </span>
)

/**
 * 计数用的等宽字形包裹。
 *
 * 必须显式渲染 children：`<Trans components={{ mono: ... }}>` 是把占位组件**克隆**
 * 出来并把插值文本作为 children 塞进去的，一个忽略 children 的组件会把数字吞掉
 * （实测：`const Mono = () => <span/>` → 卡片上只剩「项」，数字不见）。
 */
const Mono: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span style={{ fontFamily: MONO_FONT }}>{children}</span>
)

/** 卡片右侧元信息（按工具语义给出「结果有多大」） */
const ToolCardMeta: React.FC<{
  tool: ToolCall
  card: ToolCard
  isNested: boolean
  color: string
}> = ({ tool, card, isNested, color }) => {
  const { t } = useTranslation()
  // 失败且有失败原因：原因优先（egress 文本比「exit 1」更能说明问题）。
  // 没有 message 的失败态（如 execute 非零退出）继续走下面的按工具元信息——退出码不能丢。
  if (card.status === 'error' && card.message) {
    return (
      <Meta isNested={isNested} color={color}>
        {card.message}
      </Meta>
    )
  }
  switch (tool.name) {
    case 'read_file': {
      const lines = card.range
        ? t('harness.assistantMessage.toolLineRange', {
            start: card.range.start,
            end: card.range.end,
            total: card.range.total
          })
        : card.lines !== undefined
          ? t('harness.assistantMessage.toolLines', { count: card.lines })
          : undefined
      return (
        <Meta isNested={isNested} color={color}>
          {lines}
          {card.truncated ? t('harness.assistantMessage.toolTruncated') : ''}
        </Meta>
      )
    }
    case 'write_file':
      return (
        <Meta isNested={isNested} color={color}>
          {card.bytes !== undefined ? formatBytes(card.bytes) : card.message}
        </Meta>
      )
    case 'edit_file':
      return (
        <Meta isNested={isNested} color={color}>
          {card.count !== undefined ? (
            <Trans
              i18nKey="harness.assistantMessage.toolReplacements"
              count={card.count}
              components={{ mono: <Mono /> }}
            />
          ) : (
            card.message
          )}
        </Meta>
      )
    case 'ls':
      return (
        <Meta isNested={isNested} color={color}>
          <Trans
            i18nKey="harness.assistantMessage.itemCount"
            count={card.count ?? 0}
            components={{ mono: <Mono /> }}
          />
        </Meta>
      )
    case 'glob':
      return (
        <Meta isNested={isNested} color={color}>
          <Trans
            i18nKey="harness.assistantMessage.itemCount"
            count={card.count ?? 0}
            components={{ mono: <Mono /> }}
          />
        </Meta>
      )
    case 'grep':
      return (
        <Meta isNested={isNested} color={color}>
          <Trans
            i18nKey="harness.assistantMessage.matchCount"
            count={card.count ?? 0}
            components={{ mono: <Mono /> }}
          />
          {card.fileCount !== undefined
            ? ` · ${t('harness.assistantMessage.toolFileCount', { count: card.fileCount })}`
            : ''}
        </Meta>
      )
    case 'execute':
      return (
        <Meta isNested={isNested} color={card.exitCode ? '#ef4444' : color}>
          {card.exitCode !== undefined
            ? t('harness.assistantMessage.toolExitCode', { code: card.exitCode })
            : undefined}
        </Meta>
      )
    default:
      return null
  }
}

/** 完成态卡片：按工具语义决定点击行为 */
export const ToolResultCard: React.FC<{
  tool: ToolCall
  /** 当前话题 id（结果详情按 topicId + callId 取回） */
  topicId: number | null
  isNested?: boolean
  style: ToolCardStyle
}> = ({ tool, topicId, isNested = false, style }) => {
  const { t } = useTranslation()
  const bridge = useWorkspaceBridge()
  const card = tool.card
  if (!card) return null

  const size = isNested ? 14 : 16
  const kind: ToolCardKind = card.kind ?? (tool.name === 'execute' ? 'command' : 'file')
  const Icon = card.status === 'error' ? RiErrorWarningLine : TOOL_CARD_ICONS[kind]
  const iconColor = card.status === 'error' ? '#ef4444' : style.colorTextSecondary

  /** 主文本：路径 / 模式 / 命令 */
  const primary =
    kind === 'command'
      ? card.command || ''
      : kind === 'search'
        ? card.pattern || ''
        : card.path || ''

  const callId = tool.id
  const canDetail = Boolean(card.detail && callId && topicId != null)

  let onClick: (() => void) | undefined
  let actionTitle: string | undefined
  if (kind === 'file' && card.path && bridge) {
    onClick = () => bridge.openFile(card.path as string)
    actionTitle = t('harness.assistantMessage.toolOpenFile')
  } else if (kind === 'dir' && card.path && bridge) {
    // 目录：优先在资源管理器里定位（能一眼看到同级内容）；
    // 不在工作区内（如 /memories/...）时退回结果详情页签
    onClick = () => {
      if (!bridge.revealPath(card.path as string) && canDetail) {
        bridge.openToolDetail({
          topicId: topicId as number,
          callId: callId as string,
          kind,
          title: primary
        })
      }
    }
    actionTitle = t('harness.assistantMessage.toolRevealDir')
  } else if (canDetail && bridge) {
    onClick = () =>
      bridge.openToolDetail({
        topicId: topicId as number,
        callId: callId as string,
        kind,
        title: primary,
        exitCode: card.exitCode
      })
    actionTitle = t('harness.assistantMessage.toolViewDetail')
  }

  return (
    <CardShell
      style={style}
      isNested={isNested}
      icon={<Icon size={size} style={{ color: iconColor, flexShrink: 0 }} />}
      primary={primary}
      meta={
        <ToolCardMeta tool={tool} card={card} isNested={isNested} color={style.colorTextTertiary} />
      }
      onClick={onClick}
      actionTitle={actionTitle}
    />
  )
}

/** 进行中卡片（参数构建中 / 执行中）：同款外形，仅状态后缀 + 光泽扫过 */
export const ToolProgressCard: React.FC<{
  tool: ToolCall
  progress: 'preparing' | 'executing'
  isNested?: boolean
  style: ToolCardStyle
}> = ({ tool, progress, isNested = false, style }) => {
  const { t } = useTranslation()
  const size = isNested ? 14 : 16
  const summary = inputSummary(tool.name, tool.input as Record<string, unknown> | undefined)
  const status =
    progress === 'preparing'
      ? ` · ${t('harness.assistantMessage.toolPreparing')}`
      : ` · ${t('harness.assistantMessage.toolExecuting')}`
  const Icon = TOOL_IN_PROGRESS_ICONS[tool.name] || RiTerminalBoxLine
  return (
    <CardShell
      style={style}
      isNested={isNested}
      icon={<ShinyIcon icon={Icon} size={size} baseColor={style.colorTextSecondary} />}
      primary={`${summary || tool.name || t('harness.assistantMessage.toolCallFallback')}${status}`}
      primaryColor={style.colorText}
    />
  )
}
