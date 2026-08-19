import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage
} from '@langchain/core/messages'
import logger from 'electron-log'
import type { StructuredMessage, ToolCallDetail } from '../types'

/** 数据库中的对话记录（精简版，避免循环依赖） */
export interface HistoryDialogue {
  id: number
  topic_id: number
  role: 'user' | 'assistant'
  content: string
  blocks: string | null
  created_at: string
}

/** 历史加载回调：根据 topicId 返回对话记录 */
export type LoadHistoryFn = (topicId: number) => Promise<HistoryDialogue[]>

/** 适配 DeepSeek-R1 等模型在 additional_kwargs 中返回的推理内容 */
interface ReasoningMessage {
  additional_kwargs?: {
    reasoning_content?: string
    reasoning?: string
  }
}

/**
 * 从 LangChain 消息列表中提取结构化的消息输出
 */
export function extractStructuredMessages(messages: BaseMessage[]): StructuredMessage[] {
  const result: StructuredMessage[] = []
  const toolOutputs = new Map<string, string>()

  // 第一遍：收集所有工具输出
  for (const msg of messages) {
    if (msg.type === 'tool') {
      const tm = msg as unknown as { tool_call_id: string; content: unknown }
      const rawContent = tm.content
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)
      toolOutputs.set(tm.tool_call_id, content)
    }
  }

  // 第二遍：提取内容和工具调用
  for (const msg of messages) {
    if (msg.type === 'human') continue

    // 推理内容
    const reasoningContent = (msg as unknown as ReasoningMessage).additional_kwargs
      ?.reasoning_content
    if (reasoningContent) {
      result.push({ reasoning_content: reasoningContent })
    }

    // 文本内容
    const content = typeof msg.content === 'string' ? msg.content : ''
    if (content) {
      result.push({ content })
    }

    // 工具调用
    const toolCalls = (
      msg as unknown as {
        tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>
      }
    ).tool_calls
    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        result.push({
          tool: {
            name: tc.name,
            input: tc.args,
            output: toolOutputs.get(tc.id) || ''
          }
        })
      }
    }
  }

  return result
}

/**
 * 历史上下文默认字符预算：超出后自动省略更早的对话（仅保留最近内容），
 * 防止长对话累积导致上下文溢出。工程自动处理，不再暴露为设置项。
 * （24,000 字符 ≈ 中文约 2-3 万 token，对主流上下文窗口均安全）
 */
export const HISTORY_MAX_CHARS = 24000

/** 历史上下文转换结果 */
export interface HistoryContext {
  messages: BaseMessage[]
  /** 是否发生了截断（更早的对话被省略） */
  truncated: boolean
}

/**
 * 将数据库中的对话记录转换为 LangChain BaseMessage 数组。
 * 上下文压缩策略：从最近一条向前累计字符数，超过预算即停止（自动省略更早内容）；
 * 发生截断时在消息头部插入 SystemMessage 说明，避免模型困惑于缺失的历史。
 */
export function convertDialoguesToMessages(
  dialogues: HistoryDialogue[],
  maxChars: number = HISTORY_MAX_CHARS
): HistoryContext {
  // 从后往前选取最近的对话，直到累计字符数超过预算（至少保留最后一条）
  const selected: HistoryDialogue[] = []
  let totalChars = 0
  let truncated = false
  for (let i = dialogues.length - 1; i >= 0; i--) {
    const d = dialogues[i]
    const chars = d.content.length + (d.blocks ? d.blocks.length : 0)
    if (totalChars + chars > maxChars && selected.length > 0) {
      truncated = true
      break
    }
    selected.unshift(d)
    totalChars += chars
  }

  const messages: BaseMessage[] = []

  // 截断说明：置于最前，告知模型早期历史被省略
  if (truncated) {
    messages.push(
      new SystemMessage('（注：更早的对话因篇幅过长已自动省略，本次仅携带最近的内容。）')
    )
  }

  for (const d of selected) {
    if (d.role === 'user') {
      messages.push(new HumanMessage(d.content))
    } else if (d.role === 'assistant') {
      let blocks: { type: string; text?: string; tool?: ToolCallDetail; reasoning?: string }[]
      try {
        blocks = d.blocks ? JSON.parse(d.blocks) : []
      } catch {
        logger.warn(
          `[History] Failed to parse blocks for dialogue id=${d.id}, falling back to plain text`
        )
        messages.push(new AIMessage(d.content))
        continue
      }

      const textBlocks = blocks.filter((b) => b.type === 'text')
      const toolBlocks = blocks.filter((b) => b.type === 'tool')
      const content = textBlocks.map((b) => b.text || '').join('\n') || d.content

      if (toolBlocks.length > 0) {
        // 构建 AIMessage 的 tool_calls 数组
        const toolCalls: { name: string; args: Record<string, unknown>; id: string }[] = []
        for (const tb of toolBlocks) {
          const callId = `hist_${d.id}_${toolCalls.length}`
          toolCalls.push({
            id: callId,
            name: tb.tool!.name,
            args: tb.tool!.input
          })
        }

        if (toolCalls.length > 0) {
          messages.push(
            new AIMessage({
              content,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                args: tc.args
              }))
            })
          )
          // 每个工具调用后跟一个 ToolMessage
          for (let ti = 0; ti < toolCalls.length; ti++) {
            const tb = toolBlocks[ti]
            const rawOutput = tb.tool!.output
            messages.push(
              new ToolMessage({
                content: rawOutput,
                tool_call_id: toolCalls[ti].id
              })
            )
          }
        } else {
          // 所有工具调用都被窗口截断了，只保留文本
          messages.push(new AIMessage(content))
        }
      } else {
        messages.push(new AIMessage(content))
      }
    }
  }

  return { messages, truncated }
}
