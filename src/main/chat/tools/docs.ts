import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'

// ============================================================================
// Document Handlers — 渐进式浏览 + CRUD
// ============================================================================

// ── 查询 ──

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
  const image = doc.image ? '\n有封面图片' : ''

  if (!params.headingId) {
    return `**${doc.title}** [${doc.id}]${tags}${summary}${image}\n\n---\n${content}\n---`
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

// ── 文档 CRUD ──

async function createDocHandler(params: {
  title: string
  summary?: string
  tags?: string
  content?: string
}): Promise<string> {
  const { addDoc } = await import('../../database/mapper/document')
  const id = await addDoc({
    title: params.title,
    summary: params.summary ?? null,
    tags: params.tags ?? null,
    content: params.content ?? null,
    image: null
  })
  return `文档创建成功！ID: ${id}, 标题: "${params.title}"。创建后可将其归档到知识库目录中（使用 manage_wikis 的 archive 命令）。`
}

async function updateDocHandler(params: {
  docId: number
  title?: string
  summary?: string
  tags?: string
  content?: string
}): Promise<string> {
  const { updateDoc, getDocById } = await import('../../database/mapper/document')
  const doc = await getDocById(params.docId)
  if (!doc) return `未找到 ID 为 ${params.docId} 的文档。`

  const updates: Record<string, string | null> = {}
  if (params.title !== undefined) updates.title = params.title
  if (params.summary !== undefined) updates.summary = params.summary
  if (params.tags !== undefined) updates.tags = params.tags
  if (params.content !== undefined) updates.content = params.content

  if (Object.keys(updates).length === 0) return '没有需要更新的字段。'

  await updateDoc(params.docId, updates)
  return `文档 [${params.docId}] "${doc.title}" 更新成功。`
}

async function deleteDocHandler(params: { docId: number }): Promise<string> {
  const { deleteDoc, getDocById } = await import('../../database/mapper/document')
  const doc = await getDocById(params.docId)
  if (!doc) return `未找到 ID 为 ${params.docId} 的文档。`
  await deleteDoc(params.docId)
  return `文档 [${params.docId}] "${doc.title}" 已彻底删除。`
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManageDocsTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        // 查询
        case 'search':
          return searchDocsHandler(params as unknown as Parameters<typeof searchDocsHandler>[0])
        case 'toc':
          return getDocTocHandler(params as unknown as Parameters<typeof getDocTocHandler>[0])
        case 'get':
          return getDocHandler(params as unknown as Parameters<typeof getDocHandler>[0])
        // CRUD
        case 'create':
          return createDocHandler(params as unknown as Parameters<typeof createDocHandler>[0])
        case 'update':
          return updateDocHandler(params as unknown as Parameters<typeof updateDocHandler>[0])
        case 'delete':
          return deleteDocHandler(params as unknown as Parameters<typeof deleteDocHandler>[0])
        default:
          return `未知命令：${command}。支持：search, toc, get, create, update, delete`
      }
    },
    {
      name: 'manage_docs',
      description:
        '管理文档（渐进式浏览 + CRUD）。\n' +
        '  查询命令：\n' +
        '    search - 全文搜索文档，返回 id、标题、标签、摘要，需要 query，可选 page, pageSize\n' +
        '    toc - 获取文档的 Markdown 标题目录树（id、标题，按 # 层级缩进），需要 docId\n' +
        '    get - 获取文档内容。不指定 headingId 返回全文；指定 headingId 返回对应段落，需要 docId，可选 headingId\n' +
        '  文档 CRUD：\n' +
        '    create - 创建新文档，需要 title，可选 summary, tags（JSON数组字符串）, content（Markdown格式）\n' +
        '    update - 更新文档，需要 docId，可选 title, summary, tags, content\n' +
        '    delete - 彻底删除文档（不可恢复），需要 docId\n' +
        '  典型工作流：search → toc → get（按需浏览段落）；或通过 manage_wikis 工具 list → directories → docs 获取文档 ID 后，用 get 阅读内容。',
      schema: z.object({
        command: z
          .enum(['search', 'toc', 'get', 'create', 'update', 'delete'])
          .describe('操作类型'),
        query: z.string().optional().describe('[search] 搜索关键词'),
        page: z.number().optional().default(1).describe('[search] 页码'),
        pageSize: z.number().optional().default(10).describe('[search] 每页条数'),
        docId: z.number().optional().describe('[toc/get/update/delete] 文档 ID'),
        headingId: z
          .string()
          .optional()
          .describe('[get] 标题 ID（从 toc 获取，如 h-2），不填返回全文'),
        title: z.string().optional().describe('[create/update] 文档标题'),
        summary: z.string().optional().describe('[create/update] 文档摘要'),
        tags: z
          .string()
          .optional()
          .describe('[create/update] 文档标签（JSON数组字符串，如 \'["标签1","标签2"]\'）'),
        content: z.string().optional().describe('[create/update] 文档内容（Markdown格式）')
      })
    }
  )
}
