import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import { getActiveWorkspaceId } from '../../database/workspace-context'

// ============================================================================
// Wiki Handlers — 渐进式披露：列表 → 目录 → 文档
// 同时支持 CRUD：创建/编辑/删除 知识库、目录，以及文档归档/移除
// ============================================================================

// ── 查询 ──

async function listWikisHandler(): Promise<string> {
  const { getAllWikis } = await import('../../database/mapper/wiki')
  const result = await getAllWikis(getActiveWorkspaceId())
  if (!result.items.length) return '还没有创建任何知识库。'
  const lines = [`**知识库列表**（共 ${result.items.length} 个）\n`]
  for (const wiki of result.items) {
    lines.push(`  [${wiki.id}] **${wiki.title}**`)
    if (wiki.tags) {
      const tagList = JSON.parse(wiki.tags) as string[]
      lines.push(`    标签：${tagList.join('、')}`)
    }
    if (wiki.summary) lines.push(`    描述：${wiki.summary}`)
    lines.push(`    文档数：${wiki.doc_count}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function getWikiHandler(params: { wikiId: number }): Promise<string> {
  const { getWikiById } = await import('../../database/mapper/wiki')
  const wiki = await getWikiById(params.wikiId)
  if (!wiki) return `未找到 ID 为 ${params.wikiId} 的知识库。`
  const tags = wiki.tags ? `\n标签：${JSON.parse(wiki.tags).join('、')}` : ''
  const summary = wiki.summary ? `\n描述：${wiki.summary}` : ''
  const image = wiki.image ? '\n有封面图片' : ''
  return `**${wiki.title}**[${wiki.id}]${tags}${summary}\n文档总数：${wiki.doc_count}${image}\n创建时间：${wiki.created_at}\n更新时间：${wiki.updated_at}`
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

// ── Wiki CRUD ──

async function createWikiHandler(params: {
  title: string
  summary?: string
  tags?: string
}): Promise<string> {
  const { addWiki } = await import('../../database/mapper/wiki')
  const id = await addWiki(getActiveWorkspaceId(), {
    title: params.title,
    summary: params.summary ?? null,
    tags: params.tags ?? null,
    image: null
  })
  return `知识库创建成功！ID: ${id}, 标题: "${params.title}"`
}

async function updateWikiHandler(params: {
  wikiId: number
  title?: string
  summary?: string
  tags?: string
}): Promise<string> {
  const { updateWiki, getWikiById } = await import('../../database/mapper/wiki')
  const wiki = await getWikiById(params.wikiId)
  if (!wiki) return `未找到 ID 为 ${params.wikiId} 的知识库。`

  const updates: Record<string, string | null> = {}
  if (params.title !== undefined) updates.title = params.title
  if (params.summary !== undefined) updates.summary = params.summary
  if (params.tags !== undefined) updates.tags = params.tags

  if (Object.keys(updates).length === 0) return '没有需要更新的字段。'

  await updateWiki(params.wikiId, updates)
  return `知识库 [${params.wikiId}] "${wiki.title}" 更新成功。`
}

async function deleteWikiHandler(params: { wikiId: number }): Promise<string> {
  const { deleteWiki, getWikiById } = await import('../../database/mapper/wiki')
  const wiki = await getWikiById(params.wikiId)
  if (!wiki) return `未找到 ID 为 ${params.wikiId} 的知识库。`
  await deleteWiki(params.wikiId)
  return `知识库 [${params.wikiId}] "${wiki.title}" 已删除。`
}

// ── 目录 CRUD ──

async function createDirectoryHandler(params: {
  wikiId: number
  parentId?: number
  name: string
}): Promise<string> {
  const { getWikiById, addDirectory, getDirectoriesByWikiId } =
    await import('../../database/mapper/wiki')
  const wiki = await getWikiById(params.wikiId)
  if (!wiki) return `未找到 ID 为 ${params.wikiId} 的知识库。`

  let level = 0
  if (params.parentId) {
    const dirs = await getDirectoriesByWikiId(params.wikiId)
    const parent = dirs.find((d) => d.id === params.parentId)
    if (!parent) {
      // 修复：父目录不存在/不属于本知识库时,parent_id 仍原值写入会造出跨库/悬空父节点
      return `父目录不存在或不属于知识库 [${params.wikiId}]，创建已取消。`
    }
    level = parent.level + 1
  }

  const id = await addDirectory({
    wiki_id: params.wikiId,
    parent_id: params.parentId ?? null,
    name: params.name,
    sort_order: 0,
    level
  })
  return `目录创建成功！ID: ${id}, 名称: "${params.name}", 所属知识库: "${wiki.title}"`
}

async function updateDirectoryHandler(params: {
  directoryId: number
  name: string
}): Promise<string> {
  const { updateDirectory } = await import('../../database/mapper/wiki')
  await updateDirectory(params.directoryId, { name: params.name })
  return `目录 [${params.directoryId}] 已更新为 "${params.name}"。`
}

async function deleteDirectoryHandler(params: { directoryId: number }): Promise<string> {
  const { deleteDirectory } = await import('../../database/mapper/wiki')
  await deleteDirectory(params.directoryId)
  return `目录 [${params.directoryId}] 已删除。`
}

// ── 文档归档 / 移除 ──

async function archiveDocsHandler(params: {
  directoryId: number
  docIds: number[]
}): Promise<string> {
  const { addDocToDirectory } = await import('../../database/mapper/wiki')
  const results: string[] = []
  for (const docId of params.docIds) {
    try {
      await addDocToDirectory(params.directoryId, docId)
      results.push(`  文档 [${docId}] 归档成功`)
    } catch {
      results.push(`  文档 [${docId}] 归档失败（可能已存在）`)
    }
  }
  return `归档完成：\n${results.join('\n')}`
}

async function removeDocHandler(params: { directoryId: number; docId: number }): Promise<string> {
  const { removeDocFromDirectory } = await import('../../database/mapper/wiki')
  const ok = await removeDocFromDirectory(params.directoryId, params.docId)
  return ok
    ? `文档 [${params.docId}] 已从目录 [${params.directoryId}] 移除。`
    : `移除失败：文档 [${params.docId}] 不在目录 [${params.directoryId}] 中。`
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManageWikisTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        // 查询
        case 'list':
          return listWikisHandler()
        case 'get':
          return getWikiHandler(params as Parameters<typeof getWikiHandler>[0])
        case 'directories':
          return getWikiDirectoriesHandler(
            params as unknown as Parameters<typeof getWikiDirectoriesHandler>[0]
          )
        case 'docs':
          return getDirectoryDocsHandler(
            params as unknown as Parameters<typeof getDirectoryDocsHandler>[0]
          )
        // Wiki CRUD
        case 'create':
          return createWikiHandler(params as unknown as Parameters<typeof createWikiHandler>[0])
        case 'update':
          return updateWikiHandler(params as unknown as Parameters<typeof updateWikiHandler>[0])
        case 'delete':
          return deleteWikiHandler(params as unknown as Parameters<typeof deleteWikiHandler>[0])
        // 目录 CRUD
        case 'create_directory':
          return createDirectoryHandler(
            params as unknown as Parameters<typeof createDirectoryHandler>[0]
          )
        case 'update_directory':
          return updateDirectoryHandler(
            params as unknown as Parameters<typeof updateDirectoryHandler>[0]
          )
        case 'delete_directory':
          return deleteDirectoryHandler(
            params as unknown as Parameters<typeof deleteDirectoryHandler>[0]
          )
        // 归档 / 移除
        case 'archive':
          return archiveDocsHandler(params as unknown as Parameters<typeof archiveDocsHandler>[0])
        case 'remove_doc':
          return removeDocHandler(params as unknown as Parameters<typeof removeDocHandler>[0])
        default:
          return `未知命令：${command}。支持：list, get, directories, docs, create, update, delete, create_directory, update_directory, delete_directory, archive, remove_doc`
      }
    },
    {
      name: 'manage_wikis',
      description:
        '管理知识库（渐进式浏览 + CRUD）。\n' +
        '  浏览命令：\n' +
        '    list - 获取所有知识库信息（id、标题、标签、描述、文档数）\n' +
        '    get - 获取单个知识库详情，需要 wikiId\n' +
        '    directories - 获取指定知识库的层级目录树（id、名称、文档数量），需要 wikiId\n' +
        '    docs - 获取指定目录下的文档列表（id、标题、标签、描述），需要 directoryId\n' +
        '  知识库 CRUD：\n' +
        '    create - 创建知识库，需要 title，可选 summary, tags\n' +
        '    update - 更新知识库，需要 wikiId，可选 title, summary, tags\n' +
        '    delete - 删除知识库，需要 wikiId\n' +
        '  目录 CRUD：\n' +
        '    create_directory - 创建目录，需要 wikiId, name，可选 parentId（父目录ID）\n' +
        '    update_directory - 重命名目录，需要 directoryId, name\n' +
        '    delete_directory - 删除目录，需要 directoryId\n' +
        '  文档管理：\n' +
        '    archive - 将文档归档到目录，需要 directoryId, docIds（文档ID数组）\n' +
        '    remove_doc - 从目录移除文档（不删除文档本身），需要 directoryId, docId\n' +
        '  典型工作流：list → get → directories → docs，获得 docId 后可用 manage_docs 工具阅读文档内容。',
      schema: z.object({
        command: z
          .enum([
            'list',
            'get',
            'directories',
            'docs',
            'create',
            'update',
            'delete',
            'create_directory',
            'update_directory',
            'delete_directory',
            'archive',
            'remove_doc'
          ])
          .describe('操作类型'),
        wikiId: z.number().optional().describe('[get/directories/create_directory] 知识库 ID'),
        directoryId: z
          .number()
          .optional()
          .describe('[docs/archive/remove_doc/update_directory/delete_directory] 目录 ID'),
        title: z.string().optional().describe('[create/update] 知识库标题'),
        summary: z.string().optional().describe('[create/update] 知识库描述'),
        tags: z
          .string()
          .optional()
          .describe('[create/update] 知识库标签（JSON数组字符串，如 \'["标签1","标签2"]\'）'),
        name: z.string().optional().describe('[create_directory/update_directory] 目录名称'),
        parentId: z
          .number()
          .optional()
          .describe('[create_directory] 父目录 ID（创建子目录时使用）'),
        docIds: z.array(z.number()).optional().describe('[archive] 要归档的文档 ID 数组'),
        docId: z.number().optional().describe('[remove_doc] 要移除的文档 ID')
      })
    }
  )
}
