import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'

// ============================================================================
// Graph Handler
// ============================================================================

async function searchGraphHandler(params: { wikiId?: number; query: string }): Promise<string> {
  const { getAllWikis } = await import('../../database/mapper/wiki')
  const { searchEntities } = await import('../../database/mapper/graph')
  const wikis = params.wikiId ? [{ id: params.wikiId }] : (await getAllWikis()).items
  const lines: string[] = [`**知识图谱搜索 "${params.query}"**\n`]
  let totalFound = 0
  for (const wiki of wikis) {
    const entities = await searchEntities(wiki.id, params.query)
    if (entities.length > 0) {
      lines.push(`  Wiki [${wiki.id}]：`)
      for (const e of entities) {
        const aliases = e.aliases ? `（别名：${JSON.parse(e.aliases).join(', ')}）` : ''
        const desc = e.description ? ` - ${e.description.slice(0, 100)}` : ''
        lines.push(
          `    [${e.type}] ${e.name}${aliases}（置信度 ${(e.confidence * 100).toFixed(0)}%）${desc}`
        )
      }
      totalFound += entities.length
    }
  }
  if (totalFound === 0) return `未在知识图谱中找到与 "${params.query}" 相关的实体。`
  return lines.join('\n')
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildSearchGraphTool(): StructuredToolInterface {
  return tool(async (params) => searchGraphHandler(params), {
    name: 'search_graph',
    description:
      '在知识图谱中搜索实体（人物、地点、概念、组织等）。知识图谱是从文档中自动提取的实体和关系网络。',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      wikiId: z.number().optional().describe('限定在指定知识库中搜索（不填则在所有知识库中搜索）')
    })
  })
}
