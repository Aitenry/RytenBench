import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'

// ============================================================================
// Document Handlers
// ============================================================================

async function searchDocsHandler(params: {
  query: string
  page?: number
  pageSize?: number
}): Promise<string> {
  const { getAllDocs } = await import('../../database/mapper/document')
  const result = await getAllDocs(params.page ?? 1, params.pageSize ?? 10, undefined, params.query)
  if (!result.items.length) return `没有找到匹配 "${params.query}" 的文档。`
  const lines = [`**搜索 "${params.query}"**（共 ${result.total} 条）\n`]
  for (const doc of result.items) {
    lines.push(`  [${doc.id}] **${doc.title}**`)
    if (doc.tags) {
      const tagList = JSON.parse(doc.tags) as string[]
      lines.push(`    标签：${tagList.join('、')}`)
    }
    if (doc.summary) lines.push(`    摘要：${doc.summary}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function getDocHandler(params: { docId: number; headingId?: string }): Promise<string> {
  const { getDocById } = await import('../../database/mapper/document')
  const doc = await getDocById(params.docId)
  if (!doc) return `未找到 ID 为 ${params.docId} 的文档。`

  const rawContent = (doc as unknown as Record<string, unknown>).content
  const content = typeof rawContent === 'string' ? rawContent : ''
  if (!content) return `文档 "${doc.title}" 没有内容。`

  const tags = doc.tags ? `\n标签：${JSON.parse(doc.tags).join('、')}` : ''
  const summary = doc.summary ? `\n摘要：${doc.summary}` : ''

  if (!params.headingId) {
    return `**${doc.title}**${tags}${summary}\n\n---\n${content}\n---`
  }

  const lines = content.split('\n')

  interface HeadingRef {
    id: string
    level: number
    title: string
    lineIndex: number
  }

  const headings: HeadingRef[] = []
  let counter = 0
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({
        id: `h-${counter++}`,
        level: match[1].length,
        title: match[2].trim(),
        lineIndex: i
      })
    }
  }

  const targetIdx = headings.findIndex((h) => h.id === params.headingId)
  if (targetIdx === -1)
    return `未找到标题 ID "${params.headingId}"。可用标题：${headings.map((h) => `[${h.id}] ${h.title}`).join('、')}`

  const target = headings[targetIdx]

  let endLine = lines.length
  for (let i = targetIdx + 1; i < headings.length; i++) {
    if (headings[i].level <= target.level) {
      endLine = headings[i].lineIndex
      break
    }
  }

  const section = lines.slice(target.lineIndex, endLine).join('\n')
  return `**${doc.title}** › ${'#'.repeat(target.level)} ${target.title}${tags}${summary}\n\n---\n${section}\n---`
}

async function getDocTocHandler(params: { docId: number }): Promise<string> {
  const { getDocById } = await import('../../database/mapper/document')
  const doc = await getDocById(params.docId)
  if (!doc) return `未找到 ID 为 ${params.docId} 的文档。`

  const rawContent = (doc as unknown as Record<string, unknown>).content
  const content = typeof rawContent === 'string' ? rawContent : ''
  if (!content) return `文档 "${doc.title}" 没有内容。`

  interface HeadingRef {
    id: string
    level: number
    title: string
  }

  const headings: HeadingRef[] = []
  let counter = 0
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({
        id: `h-${counter++}`,
        level: match[1].length,
        title: match[2].trim()
      })
    }
  }

  if (!headings.length) return `文档 "${doc.title}" 没有标题结构。`

  const output = [`**${doc.title}** 的目录结构（共 ${headings.length} 个标题）\n`]
  const stack: { level: number }[] = []
  for (const h of headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop()
    }
    const depth = stack.length
    const indent = '  '.repeat(depth)
    output.push(`${indent}  [${h.id}] ${'#'.repeat(h.level)} ${h.title}`)
    stack.push({ level: h.level })
  }

  return output.join('\n')
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManageDocsTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        case 'search':
          return searchDocsHandler(params as Parameters<typeof searchDocsHandler>[0])
        case 'toc':
          return getDocTocHandler(params as Parameters<typeof getDocTocHandler>[0])
        case 'get':
          return getDocHandler(params as Parameters<typeof getDocHandler>[0])
        default:
          return `未知命令：${command}。支持：search, toc, get`
      }
    },
    {
      name: 'manage_docs',
      description:
        '管理文档（渐进式浏览）。\n' +
        '  命令：\n' +
        '    search - 全文搜索文档，返回 id、标题、标签、摘要，需要 query，可选 page, pageSize\n' +
        '    toc - 获取文档的 Markdown 标题目录树（id、标题，按 # 层级缩进），需要 docId\n' +
        '    get - 获取文档内容。不指定 headingId 返回全文（不截断）；指定 headingId 返回对应段落，需要 docId，可选 headingId',
      schema: z.object({
        command: z.enum(['search', 'toc', 'get']).describe('操作类型'),
        query: z.string().optional().describe('[search] 搜索关键词'),
        page: z.number().optional().default(1).describe('[search] 页码'),
        pageSize: z.number().optional().default(10).describe('[search] 每页条数'),
        docId: z.number().optional().describe('[toc/get] 文档 ID（从 search 获取）'),
        headingId: z
          .string()
          .optional()
          .describe('[get] 标题 ID（从 toc 获取，如 h-2），不填返回全文')
      })
    }
  )
}
