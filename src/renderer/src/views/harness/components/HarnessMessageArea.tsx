import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { Spin } from 'antd'
import type { Message } from '@renderer/types/harness'
import { Window } from '../../../../resource/types/window'
import type { HarnessDialogueUsageRow } from '../../../../../main/database/mapper/harness'
import UserMessage from './messages/UserMessage'
import AssistantMessage from './messages/AssistantMessage'
import ScrollToBottomButton from './ScrollToBottomButton'
import MessageLocator from './MessageLocator'
import WelcomeIntro from './WelcomeIntro'

interface HarnessMessageAreaProps {
  messages: Message[]
  isDarkMode: boolean
  /** 当前话题是否正在流式输出（驱动贴底跟随与按钮旋转光圈） */
  streaming: boolean
  /** 当前话题 id：切换话题 / 新建会话时重置为贴底状态 */
  currentTopicId: number | null
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  colorFillAlter: string
  colorBorderSecondary: string
  copiedId: string | null
  /** 分页 */
  hasMoreMessages: boolean
  isLoadingMoreMessages: boolean
  onCopy: (text: string, id: string) => Promise<void>
  onDelete: (msgIndex: number) => Promise<void>
  /** 分支：把到该条为止的消息复制到新话题并切过去（由 hooks 统一处理列表与切换） */
  onBranch: (upToIndex: number) => Promise<void>
  onLoadMoreMessages: () => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

/** 距离底部小于该值视为「贴底」 */
const STICK_THRESHOLD = 10
/** 点击按钮后平滑滚动期间（ms）：期间的 scroll 事件视为程序滚动，不算用户打断 */
const PROGRAMMATIC_WINDOW = 600

const HarnessMessageArea: React.FC<HarnessMessageAreaProps> = ({
  messages,
  isDarkMode,
  streaming,
  currentTopicId,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  colorFillAlter,
  colorBorderSecondary,
  copiedId,
  hasMoreMessages,
  isLoadingMoreMessages,
  onCopy,
  onDelete,
  onBranch,
  onLoadMoreMessages,
  messagesEndRef
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)
  const prevMessagesLengthRef = useRef(0)
  const prevFirstIdRef = useRef<string | null>(null)

  /** 贴底跟随开关：true 时新内容自动滚到底部；用户上滑阅读历史时关闭，回到底部或点击按钮恢复 */
  const stickToBottomRef = useRef(true)
  /** 按钮平滑滚动的生效窗口：期间产生的 scroll 事件不算用户打断 */
  const programmaticUntilRef = useRef(0)
  const [atBottom, setAtBottom] = useState(true)

  // 切换话题 / 新建会话后，默认回到最新位置
  useEffect(() => {
    stickToBottomRef.current = true
    setAtBottom(true)
    // 重置前插判定基线（话题切换后消息整体替换,不能按「首条 id 变化」判前插）
    prevFirstIdRef.current = null
  }, [currentTopicId])

  // 加载更多历史消息后，保持滚动位置不跳动
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const prevLen = prevMessagesLengthRef.current
    const newLen = messages.length
    const prevFirstId = prevFirstIdRef.current
    const firstId = messages[0]?.id ?? null
    // 仅当「头部出现新消息」（加载更早历史前插）时补偿滚动位置。
    // 修复：此前长度增长一律按前插补偿——用户上滑阅读历史时，目标自动续跑向当前话题
    // 尾部追加消息（首条 id 不变）也会强制下移阅读位置
    if (newLen > prevLen && prevLen > 0 && prevFirstId !== null && firstId !== prevFirstId) {
      const newScrollHeight = el.scrollHeight
      const delta = newScrollHeight - prevScrollHeightRef.current
      el.scrollTop += delta
    }
    prevScrollHeightRef.current = el.scrollHeight
    prevMessagesLengthRef.current = messages.length
    prevFirstIdRef.current = firstId
  }, [messages])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distFromBottom <= STICK_THRESHOLD
    setAtBottom(nearBottom)
    if (nearBottom) {
      // 用户自己滚回底部：恢复贴底跟随
      stickToBottomRef.current = true
    } else if (Date.now() >= programmaticUntilRef.current) {
      // 用户主动上滑阅读：打断持续滚动到底部
      stickToBottomRef.current = false
    }
    if (!isLoadingMoreMessages && hasMoreMessages && el.scrollTop <= 40) {
      onLoadMoreMessages()
    }
  }, [isLoadingMoreMessages, hasMoreMessages, onLoadMoreMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // 新消息 / 流式 chunk：贴底跟随滚动（用户上滑阅读时 stick=false，不打扰）
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  /* 用户发出提问：无条件回到最新消息处。
   *  发送就代表要接着往下看，不能因为此前上滑读过历史而停在原位；
   *  handleSend 在追加消息之前派发 harness-send-started，这里立刻贴底，
   *  随后 messages 变化会带着恢复的贴底开关再钉一次（覆盖消息尚未渲染的那一帧）。
   *  同时开一个程序滚动窗口：这一跳引发的 scroll 事件不算「用户上滑打断」，
   *  否则消息刚追加、内容变高时会被误判成离开底部而关掉贴底。 */
  useEffect(() => {
    const handleSendStarted = (): void => {
      stickToBottomRef.current = true
      setAtBottom(true)
      programmaticUntilRef.current = Date.now() + PROGRAMMATIC_WINDOW
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    window.addEventListener('harness-send-started', handleSendStarted)
    return () => window.removeEventListener('harness-send-started', handleSendStarted)
  }, [])

  // 内容异步长高（图片 / mermaid 渲染等）：贴底时保持钉在底部
  useEffect(() => {
    const el = scrollRef.current
    const inner = contentRef.current
    if (!el || !inner) return
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight
      }
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  /** 每条消息所属轮次的起点（最近一条用户消息的时间戳）：操作栏据此算「用时」 */
  const turnStartByIndex = useMemo(() => {
    const out: number[] = []
    let lastUserAt = 0
    messages.forEach((message, i) => {
      if (message.role === 'user') lastUserAt = message.timestamp
      out[i] = lastUserAt || message.timestamp
    })
    return out
  }, [messages])

  /** 对话真实用量（harness_dialogue_usage）：按 dialogue_id 回填到各条助手消息，不用估算值 */
  const [usageByDialogue, setUsageByDialogue] = useState<Record<string, HarnessDialogueUsageRow>>(
    {}
  )
  useEffect(() => {
    const api = (window as unknown as Window).api
    if (currentTopicId === null || streaming) return
    let cancelled = false
    void (async () => {
      try {
        const rows = await api.harness.getUsageByTopic(currentTopicId)
        if (cancelled) return
        setUsageByDialogue(
          Object.fromEntries(rows.map((row) => [String(row.dialogue_id), row])) as Record<
            string,
            HarnessDialogueUsageRow
          >
        )
      } catch (error) {
        console.error('Failed to load dialogue usage:', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentTopicId, streaming, messages.length])

  const handleScrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = true
    setAtBottom(true)
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_WINDOW
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  /** 定位标尺点击：平滑滚到该条消息；跳的是最后一条时恢复贴底跟随 */
  const handleJumpToMessage = useCallback(
    (index: number) => {
      const el = scrollRef.current
      const inner = contentRef.current
      if (!el || !inner) return
      const node = inner.querySelector<HTMLElement>(`[data-msg-i="${index}"]`)
      if (!node) return
      const offset = node.getBoundingClientRect().top - inner.getBoundingClientRect().top
      const isLast = index === messages.length - 1
      stickToBottomRef.current = isLast
      setAtBottom(isLast)
      programmaticUntilRef.current = Date.now() + PROGRAMMATIC_WINDOW
      el.scrollTo({ top: Math.max(0, offset - 12), behavior: 'smooth' })
    },
    [messages.length]
  )

  // 流式输出时按钮常驻（光圈即「生成中」指示）；平时仅在离开底部时出现
  const showScrollButton = messages.length > 0 && (!atBottom || streaming)

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        // 底部 pb-20 为悬浮的「回到底部」按钮预留空间：
        // 任务卡（输入框上方）展开压缩消息区高度时，按钮也不会盖住最后一条消息
        className="flex-1 overflow-y-scroll my-1 mr-1 ml-3 px-16 pt-7 harness-scrollbar"
      >
        <div ref={contentRef} className={messages.length === 0 ? 'h-full' : 'max-w-4xl mx-auto'}>
          {messages.length === 0 ? (
            <WelcomeIntro colorText={colorText} colorTextSecondary={colorTextSecondary} />
          ) : (
            <>
              {isLoadingMoreMessages && (
                <div className="flex justify-center py-3">
                  <Spin size="small" />
                </div>
              )}
              {messages.map((message, idx) => (
                /* data-msg-i：定位标尺按这个索引量每条消息在正文里的位置 */
                <div key={message.id} data-msg-i={idx}>
                  {message.role === 'user' ? (
                    <UserMessage
                      message={message}
                      isDarkMode={isDarkMode}
                      colorText={colorText}
                      colorTextSecondary={colorTextSecondary}
                      colorBorderSecondary={colorBorderSecondary}
                    />
                  ) : (
                    <AssistantMessage
                      message={message}
                      index={idx}
                      isDarkMode={isDarkMode}
                      copiedId={copiedId}
                      colorText={colorText}
                      colorTextSecondary={colorTextSecondary}
                      colorTextTertiary={colorTextTertiary}
                      colorFillAlter={colorFillAlter}
                      colorBorderSecondary={colorBorderSecondary}
                      topicId={currentTopicId}
                      turnStartedAt={turnStartByIndex[idx]}
                      usage={usageByDialogue[String(message.dialogueId ?? message.id)]}
                      onBranch={onBranch}
                      onCopy={onCopy}
                      onDelete={onDelete}
                    />
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>
      <MessageLocator
        messages={messages}
        scrollRef={scrollRef}
        contentRef={contentRef}
        onJumpTo={handleJumpToMessage}
      />
      <ScrollToBottomButton
        visible={showScrollButton}
        streaming={streaming}
        isDarkMode={isDarkMode}
        onClick={handleScrollToBottom}
      />
    </div>
  )
}

export default HarnessMessageArea
