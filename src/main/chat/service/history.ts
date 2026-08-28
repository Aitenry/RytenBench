import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
  SystemMessage
} from '@langchain/core/messages'
import logger from 'electron-log'
import type { StructuredMessage, ToolCallDetail } from '../types'
import {
  pruneToolOutput,
  buildCheckpointMessage,
  buildTranscript,
  compactionError,
  PRESSURE_RATIO,
  RETAIN_RATIO,
  type CompactionCache,
  type SummarizerFn
} from '../runtime/compaction'

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
  /** 是否发生了截断（更早的对话被省略；摘要压缩可用时不再发生） */
  truncated: boolean
  /** 是否发生了摘要压缩（早期对话被压缩为 checkpoint 摘要） */
  compacted?: boolean
}

/** 历史转换选项（摘要压缩可选开启） */
export interface HistoryConvertOptions {
  /** 字符预算（默认 HISTORY_MAX_CHARS） */
  maxChars?: number
  /** 摘要回调：由 ChatService 用当前模型注入；缺省时超预算回退为字符截断 */
  summarizer?: SummarizerFn
  /** 摘要缓存（进程级单例，按 topicId 增量合并） */
  cache?: CompactionCache
  /** 话题 ID（缓存键） */
  topicId?: number
}

/** 单条对话的字符成本（正文 + blocks） */
function dialogueChars(d: HistoryDialogue): number {
  return d.content.length + (d.blocks ? d.blocks.length : 0)
}

/**
 * 将数据库中的对话记录转换为 LangChain BaseMessage 数组。
 *
 * 上下文压缩策略（参考 dsh-compaction-basic 的阈值/保留机制）：
 * 1. 字符总量 ≥ 预算 × PRESSURE_RATIO 且提供了摘要器时：把最老一段对话用一次
 *    LLM 调用压缩为 checkpoint 摘要（增量缓存合并），最近 RETAIN_RATIO 段保持原样；
 * 2. 无摘要器或摘要失败：回退为原有字符预算截断（省略更早对话 + 头部说明）；
 * 3. 工具结果统一经智能裁剪（pruneToolOutput），原始内容保留在数据库中可精确回放。
 */
export async function convertDialoguesToMessages(
  dialogues: HistoryDialogue[],
  options?: HistoryConvertOptions
): Promise<HistoryContext> {
  const maxChars = options?.maxChars ?? HISTORY_MAX_CHARS
  const totalChars = dialogues.reduce((sum, d) => sum + dialogueChars(d), 0)

  // 摘要压缩路径：压力达标且有摘要器
  if (options?.summarizer && options.topicId != null && totalChars >= maxChars * PRESSURE_RATIO) {
    try {
      const result = await compactWithSummarizer(dialogues, maxChars, options)
      if (result) return result
    } catch (err) {
      compactionError(err)
      options.cache?.clear(options.topicId)
    }
  }

  // 回退路径：从后往前选取最近的对话，直到累计字符数超过预算（至少保留最后一条）
  const selected: HistoryDialogue[] = []
  let total = 0
  let truncated = false
  for (let i = dialogues.length - 1; i >= 0; i--) {
    const d = dialogues[i]
    if (total + dialogueChars(d) > maxChars && selected.length > 0) {
      truncated = true
      break
    }
    selected.unshift(d)
    total += dialogueChars(d)
  }

  const messages: BaseMessage[] = []

  // 截断说明：置于最前，告知模型早期历史被省略
  if (truncated) {
    messages.push(
      new SystemMessage('（注：更早的对话因篇幅过长已自动省略，本次仅携带最近的内容。）')
    )
  }

  appendDialogueMessages(messages, selected)
  return { messages, truncated }
}

/**
 * 摘要压缩编排：切分最老段 → （增量合并）LLM 摘要 → checkpoint 置于消息头。
 * 返回 null 表示无需要压缩的最老段（由调用方回退常规路径）。
 */
async function compactWithSummarizer(
  dialogues: HistoryDialogue[],
  maxChars: number,
  options: HistoryConvertOptions
): Promise<HistoryContext | null> {
  // 最近段：从尾部向前累计至保留预算（至少保留最后一条）
  const retainBudget = Math.max(1, Math.floor(maxChars * RETAIN_RATIO))
  let retainStart = dialogues.length
  let retainChars = 0
  for (let i = dialogues.length - 1; i >= 0; i--) {
    retainChars += dialogueChars(dialogues[i])
    retainStart = i
    if (retainChars >= retainBudget) break
  }
  const old = dialogues.slice(0, retainStart)
  const recent = dialogues.slice(retainStart)
  if (old.length === 0) return null

  // 增量合并：缓存边界之前的已摘要，只把新增的早期对话并入既有摘要
  const prior = options.cache?.get(options.topicId!)
  const lastOldId = old[old.length - 1].id
  let summary: string
  if (prior && prior.boundaryId < lastOldId) {
    const newlyOld = old.filter((d) => d.id > prior.boundaryId)
    summary = await options.summarizer!(buildTranscript(newlyOld), prior.summary)
  } else {
    summary = await options.summarizer!(buildTranscript(old))
  }
  options.cache?.set(options.topicId!, { boundaryId: lastOldId, summary })

  const messages: BaseMessage[] = [buildCheckpointMessage(summary)]
  appendDialogueMessages(messages, recent)
  logger.info(
    `[History] 摘要压缩完成 topicId=${options.topicId}（压缩 ${old.length} 条 → checkpoint，保留最近 ${recent.length} 条）`
  )
  return { messages, truncated: false, compacted: true }
}

/** 将选中的对话追加为 LangChain 消息（工具结果经智能裁剪） */
function appendDialogueMessages(messages: BaseMessage[], selected: HistoryDialogue[]): void {
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
            // 智能裁剪：超长工具结果在回灌时裁剪为 head/中间标记/tail（无模型成本；
            // 完整内容保留在数据库 blocks 中供精确回放与前端展示）
            const rawOutput = tb.tool!.output
            messages.push(
              new ToolMessage({
                content: pruneToolOutput(rawOutput),
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
}
