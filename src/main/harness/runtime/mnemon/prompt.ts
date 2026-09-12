import type { RuntimeMemoryController } from './runtime-memory'
import { RUNTIME_ENTRY_DELIMITER } from './types'

/**
 * Mnemon 系统提示词注入
 *
 * 移植自 dsh-mnemon 的两个 prompt section：
 * - `mnemon:routing`：分层查询边界（何时用哪一层记忆）；
 * - `mnemon:runtime-memory`：USER.md / MEMORY.md 内容 + 保存准入规则。
 */

/** 分层查询边界（routing section） */
export function buildRoutingSection(): string {
  return `\n\n## 记忆系统（Mnemon）
本工作台配备三层记忆：
1. **热记忆**（运行时记忆）：每轮直接注入的紧凑用户画像（USER）与项目记忆（MEMORY），是当前轮次立即可用的上下文；
2. **项目档案**（Project Documents）：完整 Markdown 设计/流程/交接文档，用 mnemon_document_search 快速完整阅读；
3. **长期记忆空间**（Memory Spaces）：跨会话沉淀的稳定洞察，按需用 mnemon_recall 召回。

查询梯度：当前对话与仓库事实 → 热记忆（已在上下文中）→ 搜索项目档案 → 召回长期记忆空间 → 需要全文时才追踪冷引用。
如果用户已经提供当前事实，或仓库可以直接回答，不要为了「展示记忆」而召回。`
}

/** 热记忆内容 + 保存准入规则（runtime-memory section） */
export function buildRuntimeMemorySection(controller: RuntimeMemoryController): string {
  const snapshot = controller.snapshot()
  const userEntries = snapshot.entries.filter((e) => e.target === 'user')
  const memoryEntries = snapshot.entries.filter((e) => e.target === 'memory')

  let section = `\n\n## 运行时记忆（每轮注入，保存前先查重）
### 用户画像（USER，容量 ${snapshot.targets.user.used}/${snapshot.targets.user.limit} 字节）`
  if (userEntries.length === 0) {
    section += `\n（暂无条目）`
  } else {
    section += `\n` + userEntries.map((e) => `- ${e.content}`).join('\n')
  }
  section += `\n\n### 项目记忆（MEMORY，容量 ${snapshot.targets.memory.used}/${snapshot.targets.memory.limit} 字节）`
  if (memoryEntries.length === 0) {
    section += `\n（暂无条目）`
  } else {
    section += `\n` + memoryEntries.map((e) => `- ${e.content}`).join('\n')
  }
  section += `\n\n### 保存准入规则
- **热记忆（mnemon_runtime_memory）**：用户明确偏好、稳定项目约定、环境事实和高频经验；target=user 保存身份/角色/长期偏好/沟通风格，target=memory 保存项目/环境/决策/约定/可复用经验；importance=critical|normal|low 决定整理优先级；内容完全相同不重复添加；replace/remove 必须提供唯一子串。
- **项目档案（mnemon_document_manage）**：形成完整结构和理由的设计、调查、流程或交接。
- **长期空间（mnemon_remember）**：明确要求跨任务保留、或适合图关系和深召回的稳定洞察。
- **跳过**：问题、猜测、临时进度、完成日志、原始输出、秘密、可轻易重新发现的仓库事实。`
  return section
}

export { RUNTIME_ENTRY_DELIMITER }
