import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { theme, Tooltip, App } from 'antd'
import {
  RiFileCopyLine,
  RiCheckLine,
  RiThumbUpLine,
  RiThumbDownLine,
  RiBrainLine,
  RiGitBranchLine,
  RiTimerLine,
  RiDatabase2Line,
  RiDeleteBin6Line
} from '@remixicon/react'
import dayjs from 'dayjs'
import { Window } from '../../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTranslation } from '@renderer/i18n'
import type { Message } from '@renderer/types/harness'
import type { HarnessDialogueUsageRow } from '../../../../../../main/database/mapper/harness'
import UsagePanel from './UsagePanel'
import { buildUsageDetails } from '../../utils/usage'

type Feedback = 'up' | 'down' | null

interface MessageActionsProps {
  message: Message
  /** 消息在列表中的下标（删除本轮 / 分支截取用） */
  index: number
  /** 本轮提问的时间戳：与回答时间戳相减得到「用时」 */
  turnStartedAt?: number
  /** 当前话题（评价落本地索引用） */
  topicId: number | null
  /** 该条回复的真实用量（harness_dialogue_usage 行）；无回传时为 undefined，不显示用量 */
  usage?: HarnessDialogueUsageRow
  /** 分支：交给 hooks 处理（它才知道话题列表与切换流程） */
  onBranch: (upToIndex: number) => Promise<void>
  /** 复制文本按需生成：流式期间每批都把所有块正文拼一遍太贵，只在点击复制时算 */
  getCopyText: () => string
  isCopied: boolean
  onCopy: (text: string, id: string) => void
  onDelete: (index: number) => void
}

/** 评价的本地索引键前缀（暂无 feedback 列，先按 话题+时间戳 存本地） */
const FEEDBACK_KEY = 'rytenbench:message-feedback:'

function readFeedback(key: string): Feedback {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY + key)
    return raw === 'up' || raw === 'down' ? raw : null
  } catch {
    return null
  }
}

/**
 * 助手消息操作栏：复制 / 评价 / 存入记忆 / 分支到新对话 / 用量 / 用时 / 时间。
 *
 * - 复制沿用父级已有实现（同一套「已复制」态）；
 * - 评价暂存 localStorage（按 topicId + 消息时间戳定位，重载后仍在）；
 *   要进库需要给 harness_dialogue 加 feedback 列；
 * - 存入记忆 = 起一个后台「记忆整理」子代理，由它读这一轮问答、自己判断该记什么并写入
 *   Mnemon（进度在顶部栏后台代理入口看），渲染层不直接写热记忆；
 * - 分支 = 新建同工作区话题 + 把这条之前的消息逐条复制过去；
 * - 用量显示模型真实回传的 token（harness_dialogue_usage）；没有回传就不显示，不做估算。
 */
const MessageActions: React.FC<MessageActionsProps> = ({
  message,
  index,
  turnStartedAt,
  topicId,
  usage,
  onBranch,
  getCopyText,
  isCopied,
  onCopy,
  onDelete
}) => {
  const { token } = theme.useToken()
  const api = (window as unknown as Window).api
  const { viewMessage } = useMessage()
  const { modal } = App.useApp()
  const { t } = useTranslation()

  const feedbackKey = `${topicId ?? 0}:${message.timestamp}`
  const [feedback, setFeedback] = useState<Feedback>(() => readFeedback(feedbackKey))
  const [savingMemory, setSavingMemory] = useState(false)
  const [branching, setBranching] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)

  useEffect(() => {
    setFeedback(readFeedback(feedbackKey))
  }, [feedbackKey])

  const handleFeedback = useCallback(
    (next: Exclude<Feedback, null>) => {
      const value: Feedback = feedback === next ? null : next
      setFeedback(value)
      try {
        if (value) localStorage.setItem(FEEDBACK_KEY + feedbackKey, value)
        else localStorage.removeItem(FEEDBACK_KEY + feedbackKey)
      } catch {
        /* 本地存储不可用时只保留内存态 */
      }
      viewMessage(
        'msg-feedback',
        'success',
        value === 'up'
          ? t('harness.messageActions.feedbackUpRecorded')
          : value === 'down'
            ? t('harness.messageActions.feedbackDownRecorded')
            : t('harness.messageActions.feedbackCanceled'),
        1.5
      )
    },
    [feedback, feedbackKey, viewMessage, t]
  )

  /**
   * 存入记忆 = 交给后台「记忆整理」子代理。
   *
   * 渲染层不再把正文截断后直接写热记忆：一条回复动辄几千字，直接塞进去只会把热记忆
   * 撑满、还把一次性进度写成了长期事实。改由子代理读这一轮问答，自己判断哪些是可复用
   * 事实、该落哪一层（热记忆 / 项目文档 / 长期记忆空间）再写入；进度在顶部栏后台代理入口看。
   */
  const handleSaveToMemory = useCallback(async (): Promise<void> => {
    const text = (message.content ?? '').trim()
    if (!text) {
      viewMessage('msg-memory', 'warning', t('harness.messageActions.saveToMemoryEmpty'), 2)
      return
    }
    if (topicId == null) {
      viewMessage('msg-memory', 'warning', t('harness.messageActions.saveToMemoryNoTopic'), 2)
      return
    }
    setSavingMemory(true)
    try {
      const result = await api.harness.startMemoryAgent({
        topicId,
        answer: text,
        dialogueId: message.dialogueId,
        // 这条回复自己用的供应商（用量行快照）：让整理跟着同一条模型走；
        // 没有用量行时主进程回退到默认供应商
        providerId: usage?.provider_id ?? undefined
      })
      if (result.ok) {
        viewMessage('msg-memory', 'success', t('harness.messageActions.saveToMemoryStarted'), 3)
      } else if (result.reason === 'memory-disabled') {
        viewMessage('msg-memory', 'warning', t('harness.messageActions.saveToMemoryDisabled'), 3)
      } else if (result.reason === 'no-model') {
        viewMessage('msg-memory', 'warning', t('harness.messageActions.saveToMemoryNoModel'), 3)
      } else {
        viewMessage('msg-memory', 'error', t('harness.messageActions.saveToMemoryFailed'), 2)
      }
    } catch (error) {
      console.error('Failed to hand the answer to the memory agent:', error)
      viewMessage('msg-memory', 'error', t('harness.messageActions.saveToMemoryFailed'), 2)
    } finally {
      setSavingMemory(false)
    }
  }, [api, message.content, message.dialogueId, topicId, usage, viewMessage, t])

  /** 分支：建话题、复制消息、刷新列表、切换视图都在 hooks 里，这里只负责按钮态 */
  const handleBranch = useCallback(async (): Promise<void> => {
    setBranching(true)
    try {
      await onBranch(index)
    } catch (error) {
      console.error('Failed to branch conversation:', error)
    } finally {
      setBranching(false)
    }
  }, [index, onBranch])

  /* 用时：本轮提问时间 → 回答结束时间（流式中取最后 chunk，落库消息取自己的时间戳） */
  const elapsedMs = ((): number => {
    if (message.loading) return 0
    const started = turnStartedAt ?? message.timestamp
    const ended = message.lastChunkAt ?? message.timestamp
    return Math.max(0, ended - started)
  })()

  /** 用时文案：秒级以下给一位小数，分钟级给「x分y秒」 */
  const elapsedText = ((): string => {
    if (elapsedMs <= 0) return ''
    if (elapsedMs < 60_000) {
      return t('harness.messageActions.elapsedSeconds', {
        seconds: (elapsedMs / 1000).toFixed(1)
      })
    }
    const minutes = Math.floor(elapsedMs / 60_000)
    const seconds = Math.round((elapsedMs % 60_000) / 1000)
    return t('harness.messageActions.elapsedMinutes', { minutes, seconds })
  })()

  /** 用量：只显示模型真实回传的 token（没回传就不显示，绝不估算） */
  const formatTokens = (value: number): string =>
    value >= 10_000
      ? `${Math.round(value / 1000)}k`
      : value >= 1000
        ? `${(value / 1000).toFixed(1)}k`
        : String(value)
  const usageText =
    usage?.total_tokens != null
      ? t('harness.usagePanel.tokensValue', { value: formatTokens(usage.total_tokens) })
      : ''
  /** 悬停用量徽标时弹出的「本轮用量」面板（缓存命中/推理等明细在 usage_metadata 里） */
  const usageDetails = useMemo(() => buildUsageDetails(usage), [usage])

  /**
   * 这一排按钮的提示统一放**下方**（用户 2026-09-19：「这些按键的提示内容，需要在底部，像『在新对话中分支』
   * 这种提示组件」——那条当时是 antd 自动翻转刚好落到下面）。原因也顺手记下：操作栏紧贴在正文下方，
   * 提示放到上方会盖住用户正在读的那段文字；固定 bottom 之后行为一致，不再随位置翻来翻去。
   *
   * 后续两条（同一天）：**不要箭头**（arrow: false）+ **贴近内容**（align.offset 压到 4px）。
   * antd 的默认间距是 `halfArrowWidth + marginXXS(8)`（带箭头时约 12px）；关掉箭头后 arrowWidth=0，
   * 再显式给 offset 才能压到 4px。
   */
  const tooltipCommon = {
    placement: 'bottom' as const,
    arrow: false,
    align: { offset: [0, 4] }
  }

  const iconButton = (
    icon: React.ReactNode,
    title: string,
    onClick: () => void,
    options?: { active?: boolean; danger?: boolean; disabled?: boolean }
  ): React.ReactNode => (
    <Tooltip title={title} {...tooltipCommon}>
      <button
        type="button"
        aria-label={title}
        aria-pressed={options?.active}
        disabled={options?.disabled}
        onClick={onClick}
        className="p-1.5 rounded-lg transition-colors"
        style={{
          color: options?.active
            ? token.colorPrimary
            : options?.danger
              ? token.colorTextTertiary
              : token.colorTextTertiary,
          background: options?.active ? token.colorPrimaryBg : 'transparent',
          opacity: options?.disabled ? 0.5 : 1,
          cursor: options?.disabled ? 'default' : 'pointer'
        }}
        onMouseEnter={(e) => {
          if (options?.disabled) return
          e.currentTarget.style.background = options?.active
            ? token.colorPrimaryBg
            : token.colorFillTertiary
          e.currentTarget.style.color = options?.danger
            ? token.colorError
            : options?.active
              ? token.colorPrimary
              : token.colorTextSecondary
        }}
        onMouseLeave={(e) => {
          if (options?.disabled) return
          e.currentTarget.style.background = options?.active ? token.colorPrimaryBg : 'transparent'
          e.currentTarget.style.color = options?.danger
            ? token.colorTextTertiary
            : token.colorTextTertiary
        }}
      >
        {icon}
      </button>
    </Tooltip>
  )

  const chip = (icon: React.ReactNode, text: string, title?: string): React.ReactNode => (
    <Tooltip title={title ?? ''} {...tooltipCommon}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 22,
          padding: '0 8px',
          borderRadius: 11,
          background: token.colorFillTertiary,
          color: token.colorTextTertiary,
          fontSize: 11,
          whiteSpace: 'nowrap'
        }}
      >
        {icon}
        {text}
      </span>
    </Tooltip>
  )

  return (
    <div className="flex items-center gap-1 mt-2 flex-wrap">
      {iconButton(
        isCopied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />,
        isCopied ? t('harness.messageActions.copied') : t('harness.messageActions.copy'),
        () => onCopy(getCopyText(), message.id)
      )}
      {iconButton(
        <RiThumbUpLine size={16} />,
        feedback === 'up'
          ? t('harness.messageActions.feedbackUpMarked')
          : t('harness.messageActions.feedbackUp'),
        () => handleFeedback('up'),
        { active: feedback === 'up' }
      )}
      {iconButton(
        <RiThumbDownLine size={16} />,
        feedback === 'down'
          ? t('harness.messageActions.feedbackDownMarked')
          : t('harness.messageActions.feedbackDown'),
        () => handleFeedback('down'),
        { active: feedback === 'down' }
      )}
      {iconButton(
        <RiBrainLine size={16} />,
        savingMemory
          ? t('harness.messageActions.savingToMemory')
          : t('harness.messageActions.saveToMemory'),
        () => {
          void handleSaveToMemory()
        },
        { disabled: savingMemory }
      )}
      {iconButton(
        <RiGitBranchLine size={16} />,
        branching ? t('harness.messageActions.branching') : t('harness.messageActions.branch'),
        () => {
          void handleBranch()
        },
        { disabled: branching }
      )}
      {iconButton(
        <RiDeleteBin6Line size={16} />,
        t('harness.messageActions.deleteTurn'),
        () =>
          modal.confirm({
            title: t('harness.messageActions.deleteConfirmTitle'),
            content: t('harness.messageActions.deleteConfirmContent'),
            okText: t('common.action.delete'),
            cancelText: t('common.action.cancel'),
            okButtonProps: { danger: true },
            onOk: () => onDelete(index)
          }),
        { danger: true }
      )}

      {/* 分割线：左边是可交互操作，右边是只读元信息 */}
      <span
        style={{
          width: 1,
          height: 14,
          margin: '0 4px',
          background: token.colorBorderSecondary,
          flexShrink: 0
        }}
      />

      {usageText && usageDetails && (
        /* 悬停出「本轮用量」面板：结构与 DSH 一致——标题（左标签 / 右总量）+ 发丝线 + dt/dd 明细 */
        <span
          style={{ position: 'relative', display: 'inline-flex' }}
          onMouseEnter={() => setUsageOpen(true)}
          onMouseLeave={() => setUsageOpen(false)}
        >
          {chip(<RiDatabase2Line size={12} />, usageText, t('harness.messageActions.usageTooltip'))}
          {usageOpen && (
            <span
              style={{
                position: 'absolute',
                // 用量面板**挂上方**（用户 2026-09-19：「这个提示内容不需要放在下面啊」）：
                // 它有 7 行明细，挂下面会压住下一条消息；而按钮那种一行提示统一在下方。
                bottom: 'calc(100% + 4px)',
                left: 0,
                zIndex: 30,
                display: 'block'
              }}
            >
              <UsagePanel details={usageDetails} />
            </span>
          )}
        </span>
      )}
      {elapsedText &&
        chip(
          <RiTimerLine size={12} />,
          t('harness.messageActions.elapsed', { elapsed: elapsedText }),
          t('harness.messageActions.elapsedTooltip')
        )}

      <span style={{ flex: 1 }} />

      <span style={{ fontSize: 11, color: token.colorTextQuaternary }}>
        {dayjs(message.timestamp).format('HH:mm')}
      </span>
    </div>
  )
}

export default MessageActions
