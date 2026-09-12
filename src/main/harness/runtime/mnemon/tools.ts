import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import logger from 'electron-log'
import type { MnemonService } from './service'
import type { RuntimeMemoryController } from './runtime-memory'
import type { DocumentController } from './documents'
import {
  MNEMON_CATEGORIES,
  MNEMON_EDGE_TYPES,
  MNEMON_SOURCES,
  type RuntimeMemoryTarget
} from './types'

/**
 * mnemon_* 模型工具集
 *
 * 移植自 dsh-mnemon 的工具面：
 * - 只读：mnemon_memory_bodies / mnemon_recall / mnemon_related / mnemon_status / mnemon_document_search
 * - 写：mnemon_runtime_memory / mnemon_document_manage / mnemon_remember / mnemon_link /
 *       mnemon_forget / mnemon_memory_body_create / mnemon_memory_body_update / mnemon_memory_body_merge
 *
 * 与 dsh-mnemon 的差异：本实现不区分 root/worker 路径（RytenBench 无 worker 体系），
 * 全部直接调用确定性服务层。
 */

export interface MnemonToolContext {
  service: MnemonService
  runtimeMemory: RuntimeMemoryController
  documents: DocumentController
  /** 当前工作区名（用于默认记忆空间命名） */
  workspaceName?: string
}

const categoryEnum = z.enum(MNEMON_CATEGORIES)
const sourceEnum = z.enum(MNEMON_SOURCES)
const edgeTypeEnum = z.enum(MNEMON_EDGE_TYPES)
const targetEnum = z.enum(['user', 'memory'])

/** 构建全部 mnemon 工具 */
export function buildMnemonTools(ctx: MnemonToolContext): StructuredToolInterface[] {
  const { service, runtimeMemory, documents } = ctx

  return [
    // ========================================================================
    // 只读工具
    // ========================================================================

    tool(
      async () => {
        const catalog = await service.bodies()
        return JSON.stringify({
          total: catalog.total,
          activeCount: catalog.activeCount,
          directory: catalog.directory,
          bodies: catalog.items.map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            active: b.active,
            totalInsights: b.stats?.totalInsights ?? 0,
            edgeCount: b.stats?.edgeCount ?? 0
          }))
        })
      },
      {
        name: 'mnemon_memory_bodies',
        description:
          '列出全部记忆空间（Memory Space）目录：名称、描述、激活状态与统计。召回前可先用本工具确认可用的记忆空间。',
        schema: z.object({})
      }
    ),

    tool(
      async ({ query, mode, limit, category, memory_body_ids }) => {
        const result = await service.search({
          query,
          mode: (mode as 'smart' | 'keyword' | 'basic' | undefined) ?? 'smart',
          limit: limit ?? 10,
          category: category as never,
          memoryBodyIds: memory_body_ids
        })
        const summary = result.results.map((r) => ({
          id: r.id,
          memory_body_id: r.memoryBodyId,
          memory_body_name: r.memoryBodyName,
          category: r.category,
          importance: r.importance,
          score: r.score,
          content: r.content
        }))
        return JSON.stringify({
          query: result.query,
          mode: result.mode,
          total: result.results.length,
          hint: result.hint,
          results: summary
        })
      },
      {
        name: 'mnemon_recall',
        description:
          '从已激活的记忆空间召回历史记忆证据。当用户问题涉及先前对话、已沉淀的决策/偏好/事实，或需要跨会话记忆时使用。',
        schema: z.object({
          query: z.string().describe('聚焦的召回查询（自然语言或关键词）'),
          mode: z
            .enum(['smart', 'keyword', 'basic'])
            .optional()
            .describe('smart=语义评分（默认），keyword=全词元命中，basic=模糊匹配'),
          limit: z.number().int().min(1).max(12).optional().describe('返回条数上限，默认 10'),
          category: categoryEnum.optional().describe('按类别过滤'),
          memory_body_ids: z
            .array(z.string())
            .optional()
            .describe('限定召回的记忆空间 ID 列表；缺省使用全部激活空间')
        })
      }
    ),

    tool(
      async ({ id, depth, edge, memory_body_id }) => {
        const results = await service.related(id, depth ?? 2, edge as never, memory_body_id)
        return JSON.stringify({
          source_id: id,
          total: results.length,
          results: results.map((r) => ({
            id: r.id,
            depth: r.depth,
            edge_type: r.edgeType,
            content: r.content,
            memory_body_id: r.memoryBodyId
          }))
        })
      },
      {
        name: 'mnemon_related',
        description:
          '从已知记忆 ID 沿关系图遍历相关记忆（temporal/semantic/causal/entity）。需要解释记忆间关系时，先用 mnemon_recall 拿到完整 ID 再调用本工具。',
        schema: z.object({
          id: z.string().describe('起始记忆的精确 ID'),
          depth: z.number().int().min(1).max(2).optional().describe('遍历跳数，默认 2'),
          edge: edgeTypeEnum.optional().describe('按关系类型过滤'),
          memory_body_id: z.string().optional().describe('记忆所属空间 ID')
        })
      }
    ),

    tool(
      async () => {
        const catalog = await service.bodies()
        const active = catalog.items.filter((b) => b.active)
        return JSON.stringify({
          storage_root: service.storageRoot,
          memory_bodies_total: catalog.total,
          memory_bodies_active: catalog.activeCount,
          active_spaces: active.map((b) => ({
            id: b.id,
            name: b.name,
            totalInsights: b.stats?.totalInsights ?? 0
          })),
          runtime_memory_configured: runtimeMemory.snapshot().entries.length > 0,
          documents_configured: documents.snapshot().total > 0
        })
      },
      {
        name: 'mnemon_status',
        description: '记忆系统聚合状态：存储根、记忆空间、热记忆与档案概览。',
        schema: z.object({})
      }
    ),

    tool(
      async ({ query, include_archived, limit }) => {
        const result = await documents.search(query, {
          includeArchived: include_archived ?? false,
          limit: limit ?? 10
        })
        return JSON.stringify({
          query: result.query,
          total: result.total,
          results: result.results.map((d) => ({
            id: d.id,
            title: d.title,
            description: d.description,
            status: d.status,
            updated_at: d.updatedAt,
            excerpt: d.excerpt,
            content: d.content.slice(0, 2000)
          }))
        })
      },
      {
        name: 'mnemon_document_search',
        description:
          '确定性搜索项目档案（Project Documents）。档案比单条记忆更完整（设计文档、流程、调查结论、交接说明），需要快速完整阅读时使用。',
        schema: z.object({
          query: z.string().describe('搜索关键词'),
          include_archived: z.boolean().optional().describe('是否包含已归档文档，默认 false'),
          limit: z.number().int().min(1).max(20).optional().describe('返回条数上限，默认 10')
        })
      }
    ),

    // ========================================================================
    // 写工具
    // ========================================================================

    tool(
      async ({ action, target, content, old_text, importance }) => {
        if (action === 'add') {
          const result = await runtimeMemory.mutate({
            action: 'add',
            target: target as RuntimeMemoryTarget,
            content,
            importance: importance as never
          })
          if (!result.success) return result.message
          const usage = result.usage
          return `已添加到${target === 'user' ? '用户画像' : '项目记忆'}（${usage.used}/${usage.limit} 字节，共 ${result.entryCount} 条）。${
            result.maintenance ? `已触发容量维护：${result.maintenance.summary}` : ''
          }`
        }
        if (action === 'replace') {
          const result = await runtimeMemory.mutate({
            action: 'replace',
            target: target as RuntimeMemoryTarget,
            content,
            oldText: old_text,
            importance: importance as never
          })
          if (!result.success) return result.message
          return `已替换记忆条目。`
        }
        const result = await runtimeMemory.mutate({
          action: 'remove',
          target: target as RuntimeMemoryTarget,
          oldText: old_text
        })
        if (!result.success) return result.message
        return `已移除记忆条目。`
      },
      {
        name: 'mnemon_runtime_memory',
        description:
          '维护运行时热记忆（每轮直接注入 prompt 的紧凑记忆）：user=用户画像（身份/偏好/习惯，4KiB），memory=项目记忆（决策/约定/环境事实/经验，10KiB）。add 添加独立新事实（完全相同不重复）；replace/remove 用唯一子串定位。适合保存明确偏好、稳定约定、环境事实与高频经验。',
        schema: z.object({
          action: z.enum(['add', 'replace', 'remove']).describe('操作类型'),
          target: targetEnum.describe('user=用户画像，memory=项目记忆'),
          content: z.string().optional().describe('add/replace 的新内容'),
          old_text: z.string().optional().describe('replace/remove 定位用的唯一子串'),
          importance: z
            .enum(['critical', 'normal', 'low'])
            .optional()
            .describe('保留优先级：critical=必须保留，normal=默认，low=可整理')
        })
      }
    ),

    tool(
      async ({ action, id, title, description, content, source_paths, archive_summary }) => {
        if (action === 'create') {
          if (!title || !content) return '创建档案需要 title 与 content'
          const result = await documents.mutate({
            action: 'create',
            title,
            description,
            content,
            sourcePaths: source_paths
          })
          return `已创建档案《${result.document.title}》（id=${result.document.id}）`
        }
        if (action === 'update') {
          if (!id) return '更新档案需要 id'
          const result = await documents.mutate({
            action: 'update',
            id,
            title,
            description,
            content
          })
          return `已更新档案《${result.document.title}》（revision=${result.document.revision}）`
        }
        // archive
        if (!id) return '归档档案需要 id'
        const doc = documents.get(id)
        if (!doc) return `档案不存在: ${id}`
        const result = await documents.archive(id, {
          summary: archive_summary ?? '由智能体归档'
        })
        return `已归档档案《${result.document.title}》：${archive_summary ?? '由智能体归档'}`
      },
      {
        name: 'mnemon_document_manage',
        description:
          '创建、更新或归档项目档案（Project Documents）。档案适合保存形成完整结构和理由的设计、调查结论、操作流程、交接说明——比单条记忆更完整。不要把普通聊天、临时进度、秘密写入档案。',
        schema: z.object({
          action: z.enum(['create', 'update', 'archive']).describe('操作类型'),
          id: z.string().optional().describe('update/archive 的档案 ID'),
          title: z.string().optional().describe('create 必填：档案标题'),
          description: z.string().optional().describe('档案描述（用于搜索）'),
          content: z.string().optional().describe('create/update 的 Markdown 正文'),
          source_paths: z
            .array(z.string())
            .optional()
            .describe('来源文件路径（只读引用，不会被修改）'),
          archive_summary: z.string().optional().describe('归档摘要（archive 时）')
        })
      }
    ),

    tool(
      async ({ content, category, importance, tags, entities, source, memory_body_id }) => {
        try {
          const insight = await service.remember({
            content,
            category: category as never,
            importance,
            tags,
            entities,
            source: source as never,
            memoryBodyId: memory_body_id
          })
          return JSON.stringify({
            success: true,
            id: insight.id,
            memory_body_id: insight.memoryBodyId,
            memory_body_name: insight.memoryBodyName,
            category: insight.category,
            importance: insight.importance
          })
        } catch (err) {
          return `沉淀失败: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'mnemon_remember',
        description:
          '把一条洞察沉淀到长期记忆空间（Memory Space）。适合明确要求跨任务保留、或适合图关系与深召回的稳定洞察。写入前会按内容查重。不要在长期层保存问题、猜测、临时进度、完成日志、秘密或易重新发现的仓库事实。',
        schema: z.object({
          content: z.string().describe('要沉淀的洞察内容（自包含、单条）'),
          category: categoryEnum
            .optional()
            .describe(
              '类别：preference=偏好/decision=决策/fact=事实/insight=洞察/context=背景/general=通用'
            ),
          importance: z.number().int().min(1).max(5).optional().describe('重要度 1-5，默认 3'),
          tags: z.array(z.string()).optional().describe('标签（便于检索）'),
          entities: z.array(z.string()).optional().describe('命名实体（人物/项目/技术等）'),
          source: sourceEnum.optional().describe('来源：user/agent/external'),
          memory_body_id: z.string().optional().describe('目标记忆空间 ID；缺省用第一个激活空间')
        })
      }
    ),

    tool(
      async ({ source_id, target_id, type, weight, reason, memory_body_id }) => {
        try {
          const result = await service.link(
            source_id,
            target_id,
            type as never,
            weight ?? 1,
            reason,
            memory_body_id
          )
          return `已建立 ${result.type} 关系：${result.sourceId} → ${result.targetId}`
        } catch (err) {
          return `建立关系失败: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'mnemon_link',
        description:
          '在两个已知记忆 ID 之间建立 typed 关系（temporal=时间先后/semantic=语义相似/causal=因果/entity=实体关联）。只在确实能改善未来召回时建立关系。',
        schema: z.object({
          source_id: z.string().describe('源记忆 ID'),
          target_id: z.string().describe('目标记忆 ID'),
          type: edgeTypeEnum.describe('关系类型'),
          weight: z.number().min(0).max(1).optional().describe('关系置信度，默认 1'),
          reason: z.string().optional().describe('建立关系的理由'),
          memory_body_id: z.string().optional().describe('记忆所属空间 ID')
        })
      }
    ),

    tool(
      async ({ id, memory_body_id }) => {
        try {
          await service.forget(id, memory_body_id)
          return `已软删除记忆 ${id}`
        } catch (err) {
          return `删除失败: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'mnemon_forget',
        description:
          '按精确 ID 软删除一条长期记忆（破坏性语义操作）。只在用户明确要求删除、或内容已被验证错误/过时时使用。',
        schema: z.object({
          id: z.string().describe('要删除的记忆精确 ID'),
          memory_body_id: z.string().optional().describe('记忆所属空间 ID')
        })
      }
    ),

    tool(
      async ({ name, description }) => {
        try {
          const body = await service.createBody({ name, description })
          return `已创建记忆空间「${body.name}」（id=${body.id}，已激活）`
        } catch (err) {
          return `创建失败: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'mnemon_memory_body_create',
        description:
          '创建独立记忆空间（Memory Space）。只在出现反复出现、边界清晰的独立领域时创建；常规记忆写入已有空间即可。',
        schema: z.object({
          name: z.string().describe('空间名称（人类可读，如「Blog 项目」「DSH 环境」）'),
          description: z.string().describe('路由边界：什么内容属于这里、何时召回')
        })
      }
    ),

    tool(
      async ({ id, name, description, active }) => {
        try {
          const body = service.updateBody(id, { name, description, active })
          return `已更新记忆空间「${body.name}」（active=${body.active}）`
        } catch (err) {
          return `更新失败: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'mnemon_memory_body_update',
        description: '更新记忆空间的名称、路由描述或激活状态（激活状态控制是否参与召回）。',
        schema: z.object({
          id: z.string().describe('空间 ID'),
          name: z.string().optional().describe('新名称'),
          description: z.string().optional().describe('新路由描述'),
          active: z.boolean().optional().describe('是否参与读取（召回）')
        })
      }
    ),

    tool(
      async ({ target_body_id, source_body_ids, deactivate_sources }) => {
        try {
          const result = await service.mergeBodies(
            target_body_id,
            source_body_ids,
            deactivate_sources ?? true
          )
          return `合并完成：导入 ${result.imported} 条，跳过重复 ${result.skippedDuplicates} 条${
            (deactivate_sources ?? true) ? '；源空间已设为未激活' : ''
          }`
        } catch (err) {
          return `合并失败: ${err instanceof Error ? err.message : String(err)}`
        }
      },
      {
        name: 'mnemon_memory_body_merge',
        description:
          '把源记忆空间的内容非破坏性导入目标记忆空间（按内容哈希查重），默认将源空间设为未激活。用于空间整合。',
        schema: z.object({
          target_body_id: z.string().describe('目标空间 ID'),
          source_body_ids: z.array(z.string()).describe('源空间 ID 列表'),
          deactivate_sources: z.boolean().optional().describe('是否将源空间设为未激活，默认 true')
        })
      }
    )
  ]
}

/** 工具错误统一记录（供调用方诊断） */
export function logToolError(name: string, err: unknown): void {
  logger.warn(`[Mnemon] 工具 ${name} 失败:`, err)
}
