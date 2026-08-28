/**
 * 上下文压缩（compaction）— 对应 deepseek-harness 的 compaction 体系
 * （dsh-compaction / dsh-compaction-tool-result-pruner / dsh-compaction-basic）
 *
 * 两臂（参考 DSH 机制）：
 * 1. 工具结果智能裁剪（pruneToolOutput，无模型成本）：
 *    - 在历史回灌路径（convertDialoguesToMessages）执行，实时工具执行由溢出策略
 *      （spill.ts）负责内联上限；
 *    - 回放安全：原始完整结果保留在会话记录（chat_dialogue.blocks），裁剪文本只进
 *      本轮模型上下文（参考 dsh-compaction-tool-result-pruner）。
 * 2. LLM 摘要压缩（summarizeDialogues + CompactionCache）：
 *    - 压力触发：历史字符总量 ≥ 窗口 × PRESSURE_RATIO 时，把最老一段对话用一次
 *      LLM 调用压缩为结构化 checkpoint，最近 RETAIN_RATIO 段保持原样
 *      （参考 dsh-compaction-basic 的 thresholdRatio/retainRatio）；
 *    - 增量缓存：进程级 CompactionCache 按 topicId 记住上次摘要边界，后续轮次只把
 *      新增的早期对话合并进既有摘要（一次调用），避免每轮全量重摘要；
 *    - 失败兜底：摘要失败时回退为原有字符预算截断行为。
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import logger from 'electron-log'

/** 历史回灌时单个工具结果的内联预算（字符） */
export const TOOL_RESULT_PRUNE_CHARS = 4_000
/** 裁剪保留：头部字符数 */
const PRUNE_HEAD_CHARS = 2_800
/** 裁剪保留：尾部字符数 */
const PRUNE_TAIL_CHARS = 1_000

/** 压缩压力阈值比例：历史总量 ≥ 窗口 × 0.7 即触发摘要压缩（字符启发式，略保守于 DSH 的 0.8，补偿中文/JSON 低估） */
export const PRESSURE_RATIO = 0.7
/** 保留比例：最近 20% 的对话保持原样不参与摘要（DSH retainRatio=0.16） */
export const RETAIN_RATIO = 0.2
/** 摘要输出的目标上限（字符，提示词约束，非硬截断） */
const SUMMARY_TARGET_CHARS = 2_000

/** checkpoint 落地包裹文案（参考 DSH CHECKPOINT_PREAMBLE，中文意译） */
const CHECKPOINT_PREAMBLE =
  '以下为早期对话的自动压缩摘要（checkpoint），视作既定背景直接继续任务，无需复述或致谢：'

/** 压缩指令（结构逐字保留 DSH COMPACTION_INSTRUCTION；输出语言改为跟随对话语言） */
const COMPACTION_INSTRUCTION = `You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.

Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section. Write content in the same language as the conversation (中文对话用中文输出).

## Primary Request and Intent
- [the user's original and evolving goals; quote verbatim where the exact wording matters]
## Key Technical Concepts
- [technologies, frameworks, patterns, and conventions in play]
## Files and Code
- [exact path: why it matters, key changes or snippets]
## Errors and Fixes
- [error: how it was resolved, plus any related user feedback]
## Pending Jobs
- [explicitly requested work not yet completed]
## Current Work
- [precisely what was in progress at this checkpoint]
## Next Step
- [the single next action, directly in line with the most recent request, or "(none)"]
## Critical Context
- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]

Rules:
- Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.
- Capture user feedback and explicit instructions faithfully, especially corrections.
- Do NOT mention this summarization request or that the context was compacted.
- Output only the checkpoint text: do not call any tool or take any other action.
- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.
请在 ${SUMMARY_TARGET_CHARS} 字符以内完成输出。`

/** 摘要输入单条记录形态 */
export interface TranscriptDialogue {
  role: 'user' | 'assistant'
  content: string
  blocks?: string | null
}

/** 构建角色标注的对话转录文本（含工具调用名与结果概要，供摘要器理解已完成的工作） */
export function buildTranscript(dialogues: TranscriptDialogue[]): string {
  const lines: string[] = []
  for (const d of dialogues) {
    if (d.role === 'user') {
      lines.push(`[用户] ${d.content}`)
      continue
    }
    // 助手消息：文本块 + 工具块概要
    let text = d.content
    if (d.blocks) {
      try {
        const blocks = JSON.parse(d.blocks) as Array<{
          type: string
          text?: string
          tool?: { name: string; input?: Record<string, unknown>; output?: string }
        }>
        const textBlocks = blocks.filter((b) => b.type === 'text').map((b) => b.text || '')
        const toolBlocks = blocks.filter((b) => b.type === 'tool' && b.tool)
        if (textBlocks.length > 0) text = textBlocks.join('\n')
        for (const tb of toolBlocks) {
          const inputText = JSON.stringify(tb.tool?.input ?? {}).slice(0, 300)
          const outputText = (tb.tool?.output ?? '').slice(0, 800)
          lines.push(`[工具调用] ${tb.tool?.name}（输入：${inputText}）`)
          if (outputText) lines.push(`[工具结果] ${outputText}`)
        }
      } catch {
        // blocks 解析失败：仅用 content
      }
    }
    lines.push(`[助手] ${text}`)
  }
  return lines.join('\n')
}

/** 摘要回调契约：transcript 为早期对话转录，priorSummary 为既有摘要（增量合并时传入） */
export type SummarizerFn = (transcript: string, priorSummary?: string) => Promise<string>

/** 用 LLM 生成 checkpoint 摘要（一次调用，只取文本输出；失败抛错由调用方兜底） */
export async function summarizeDialogues(
  model: BaseChatModel,
  transcript: string,
  priorSummary?: string
): Promise<string> {
  const mergeBlock = priorSummary
    ? `以下为既有 checkpoint（需要保留的旧摘要）：\n<compacted-summary>\n${priorSummary}\n</compacted-summary>\n\n以下为摘要之后新增的早期对话，请合并进上述 checkpoint：\n\n${transcript}`
    : `以下是需要压缩的对话内容：\n\n${transcript}`
  const response = await model.invoke([
    new SystemMessage('你是对话压缩引擎，只输出 checkpoint 文本，不调用任何工具。'),
    new HumanMessage(`${mergeBlock}\n\n${COMPACTION_INSTRUCTION}`)
  ])
  const text =
    typeof response.content === 'string'
      ? response.content
      : (response.content as Array<{ type?: string; text?: string }>)
          .filter((c) => c && c.type === 'text')
          .map((c) => c.text || '')
          .join('')
  const summary = text.trim()
  if (!summary) throw new Error('摘要输出为空')
  return summary
}

/** 组装 checkpoint 落地消息（置于消息头，模型视作既定背景） */
export function buildCheckpointMessage(summary: string): SystemMessage {
  return new SystemMessage(
    `${CHECKPOINT_PREAMBLE}\n\n<compacted-summary>\n${summary}\n</compacted-summary>`
  )
}

/** 压缩缓存条目（进程级，按 topicId 隔离） */
interface CompactionCacheEntry {
  /** 已摘要部分的最末对话记录 id（边界；后续只合并新增的早期对话） */
  boundaryId: number
  summary: string
}

/**
 * 压缩摘要缓存（进程级单例）：避免长对话每轮重复全量摘要。
 * 增量为「既有摘要 + 新增早期对话 → 合并出新摘要」一次调用。
 */
export class CompactionCache {
  private readonly entries = new Map<number, CompactionCacheEntry>()

  get(topicId: number): CompactionCacheEntry | undefined {
    return this.entries.get(topicId)
  }

  set(topicId: number, entry: CompactionCacheEntry): void {
    this.entries.set(topicId, entry)
  }

  /** 摘要失败或话题删除时清理 */
  clear(topicId: number): void {
    this.entries.delete(topicId)
  }
}

/** 进程级单例：跨请求共享（与 todoStore 同一模式） */
export const compactionCache = new CompactionCache()

/**
 * 工具结果裁剪：超预算时保留有界头/尾，中间替换为省略标记。
 * 未超预算时原样返回（无成本）。
 */
export function pruneToolOutput(text: string, budget = TOOL_RESULT_PRUNE_CHARS): string {
  if (!text || text.length <= budget) return text
  const omitted = text.length - PRUNE_HEAD_CHARS - PRUNE_TAIL_CHARS
  const head = text.slice(0, PRUNE_HEAD_CHARS)
  const tail = text.slice(-PRUNE_TAIL_CHARS)
  return `${head}\n……（中间 ${omitted.toLocaleString()} 字符已裁剪，完整内容保留在会话记录中）……\n${tail}`
}

/** 供日志使用的安全错误格式化 */
export function compactionError(err: unknown): void {
  logger.warn('[Compaction] 摘要压缩失败，回退字符预算截断:', err)
}
