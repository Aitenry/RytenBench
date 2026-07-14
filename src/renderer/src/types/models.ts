/** 知识库行数据 */
export interface WikiRow {
  id: number
  title: string
  summary: string | null
  image: string | null
  created_at: string
  updated_at: string
  doc_count: number
  tags: string | null
}

/** 知识库目录行数据 */
export interface WikiDirectoryRow {
  id: number
  wiki_id: number
  parent_id: number | null
  name: string
  sort_order: number
  level: number
  created_at: string
  updated_at: string
}

/** 文档列表项 */
export interface DocListItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  created_at: string
  updated_at: string
  word_count: number
}

/** 文档项（含内容和置顶），用于 DocumentCard 和 DocumentPreviewModal */
export interface DocItem extends DocListItem {
  content?: string | null
  isPinned?: boolean
}

/** 目录下的文档详情 */
export interface DirectoryDocWithDetail extends DocListItem {
  directory_id: number
  content?: string | null
}

/** 待办事项 */
export interface TodoItem {
  id: number
  title: string
  description: string
  due_date: string | null
  priority: number
  status: number
  category: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  started_at: string | null
}

/** 树节点 */
export interface TreeNode {
  key: number
  title: string
  children: TreeNode[]
}

/** 文档选项（用于知识图谱工具栏） */
export interface DocOption {
  id: number
  title: string
}
