import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'

// ============================================================================
// Wiki Handlers — 渐进式披露：列表 → 目录 → 文档
// ============================================================================

async function listWikisHandler(): Promise<string> {
  const { getAllWikis } = await import('../../database/mapper/wiki')
  const result = await getAllWikis()
  if (!result.items.length) return '还没有创建任何知识库。'
  const lines = [`**知识库列表**（共 ${result.items.length} 个）\n`]
  for (const wiki of result.items) {
    lines.push(`  [${wiki.id}] **${wiki.title}**`)
    if (wiki.tags) lines.push(`    标签：${wiki.tags}`)
    if (wiki.summary) lines.push(`    描述：${wiki.summary}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function getWikiDirectoriesHandler(params: { wikiId: number }): Promise<string> {
  const { getWikiById, getDirectoriesByWikiId, getDocsByDirectoryId } =
    await import('../../database/mapper/wiki')
  const wiki = await getWikiById(params.wikiId)
  if (!wiki) return `未找到 ID 为 ${params.wikiId} 的知识库。`
  const directories = await getDirectoriesByWikiId(params.wikiId)
  if (!directories.length) return `知识库 "${wiki.title}" 下还没有目录。`

  const docCountMap = new Map<number, number>()
  await Promise.all(
    directories.map(async (dir) => {
      const docs = await getDocsByDirectoryId(dir.id)
      docCountMap.set(dir.id, docs.length)
    })
  )

  const sorted = [...directories].sort((a, b) => a.sort_order - b.sort_order)

  interface DirNode {
    id: number
    name: string
    parent_id: number | null
    doc_count: number
    children: DirNode[]
  }

  const nodeMap = new Map<number, DirNode>()
  for (const d of sorted) {
    nodeMap.set(d.id, {
      id: d.id,
      name: d.name,
      parent_id: d.parent_id,
      doc_count: docCountMap.get(d.id) ?? 0,
      children: []
    })
  }
  const roots: DirNode[] = []
  for (const node of nodeMap.values()) {
    if (node.parent_id !== null && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const lines = [`**${wiki.title}** 的目录结构（共 ${directories.length} 个）\n`]

  function render(node: DirNode, depth: number, isLast: boolean): void {
    const indent = '  '.repeat(depth)
    const branch = depth > 0 ? (isLast ? '  └─ ' : '  ├─ ') : ''
    const countStr = node.doc_count > 0 ? `（${node.doc_count} 篇）` : '（空）'
    lines.push(`${indent}${branch}[${node.id}] ${node.name} ${countStr}`)
    for (let i = 0; i < node.children.length; i++) {
      render(node.children[i], depth + 1, i === node.children.length - 1)
    }
  }

  for (let i = 0; i < roots.length; i++) {
    render(roots[i], 1, i === roots.length - 1)
  }

  return lines.join('\n')
}

async function getDirectoryDocsHandler(params: { directoryId: number }): Promise<string> {
  const { getDocsByDirectoryId } = await import('../../database/mapper/wiki')
  const { getDocById } = await import('../../database/mapper/document')
  const docRefs = await getDocsByDirectoryId(params.directoryId)
  if (!docRefs.length) return '该目录下还没有文档。'
  const docs = await Promise.all(docRefs.map((ref) => getDocById(ref.doc_id)))
  const validDocs = docs.filter((d): d is NonNullable<typeof d> => d !== null)
  const lines = [`**目录文档列表**（共 ${validDocs.length} 篇）\n`]
  for (const doc of validDocs) {
    lines.push(`  [${doc.id}] **${doc.title}**`)
    if (doc.tags) {
      const tagList = JSON.parse(doc.tags) as string[]
      lines.push(`    标签：${tagList.join('、')}`)
    }
    if (doc.summary) lines.push(`    描述：${doc.summary}`)
    lines.push('')
  }
  return lines.join('\n')
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManageWikisTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        case 'list':
          return listWikisHandler()
        case 'directories':
          return getWikiDirectoriesHandler(
            params as Parameters<typeof getWikiDirectoriesHandler>[0]
          )
        case 'docs':
          return getDirectoryDocsHandler(params as Parameters<typeof getDirectoryDocsHandler>[0])
        default:
          return `未知命令：${command}。支持：list, directories, docs`
      }
    },
    {
      name: 'manage_wikis',
      description:
        '管理知识库（渐进式浏览）。\n' +
        '  命令：\n' +
        '    list - 获取所有知识库信息（id、标题、标签、描述）\n' +
        '    directories - 获取指定知识库的层级目录树（id、标题、文档数量），需要 wikiId\n' +
        '    docs - 获取指定目录下的文档列表（id、标题、标签、描述），需要 directoryId',
      schema: z.object({
        command: z.enum(['list', 'directories', 'docs']).describe('操作类型'),
        wikiId: z.number().optional().describe('[directories] 知识库 ID（从 list 获取）'),
        directoryId: z.number().optional().describe('[docs] 目录 ID（从 directories 获取）')
      })
    }
  )
}
