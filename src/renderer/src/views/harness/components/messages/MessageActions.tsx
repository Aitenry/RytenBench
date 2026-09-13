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
  copyText: string
  isCopied: boolean
  onCopy: (text: string, id: string) => void
  onDelete: (index: number) => void
}

/** 存入记忆的内容上限：热记忆总量有限，超长回答截断后再存 */
const MEMORY_MAX_CHARS = 500
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
 * - 存入记忆写的是 Mnemon 热记忆（MEMORY），超长回答截断到 500 字；
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
  copyText,
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

  /** 存入 Mnemon 热记忆（MEMORY） */
  const handleSaveToMemory = useCallback(async (): Promise<void> => {
    const text = (message.content ?? '').trim()
    if (!text) {
      viewMessage('msg-memory', 'warning', t('harness.messageActions.saveToMemoryEmpty'), 2)
      return
    }
    const content = text.length > MEMORY_MAX_CHARS ? `${text.slice(0, MEMORY_MAX_CHARS)}…` : text
    setSavingMemory(true)
    try {
      const result = await api.harness.mnemonRuntimeMutate({
        action: 'add',
        target: 'memory',
        content,
        importance: 'normal'
      })
      viewMessage('msg-memory', result.success ? 'success' : 'warning', result.message, 3)
    } catch (error) {
      console.error('Failed to save answer to memory:', error)
      viewMessage('msg-memory', 'error', t('harness.messageActions.saveToMemoryFailed'), 2)
    } finally {
      setSavingMemory(false)
    }
  }, [api, message.content, viewMessage, t])

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

  const iconButton = (
    icon: React.ReactNode,
    title: string,
    onClick: () => void,
    options?: { active?: boolean; danger?: boolean; disabled?: boolean }
  ): React.ReactNode => (
    <Tooltip title={title}>
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
    <Tooltip title={title ?? ''}>
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
        () => onCopy(copyText, message.id)
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
                bottom: 'calc(100% + 8px)',
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
