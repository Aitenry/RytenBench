import type { TodoItemRow } from '../../../main/database/mapper/todo'
import type {
  WikiRow as WikiRowFromDb,
  WikiDirectoryRow as WikiDirectoryRowFromDb
} from '../../../main/database/mapper/wiki'
import type { DocListItem as DocListItemFromDb } from '../../../main/database/mapper/document'

/** 知识库行数据（复用主进程 mapper 推导出的行类型，避免两处手工维护） */
export type WikiRow = WikiRowFromDb

/** 知识库目录行数据（sort_order / level / 时间戳在库中可空） */
export type WikiDirectoryRow = WikiDirectoryRowFromDb

/** 文档列表项（复用主进程 mapper 推导出的行类型，避免两处手工维护） */
export type DocListItem = DocListItemFromDb

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

/**
 * 待办事项。
 * 直接复用主进程 mapper 的行类型（由 drizzle schema 推导），避免渲染层再手抄一份导致漂移；
 * 可空列（content / priority / status / created_at / updated_at）在库里确实允许 NULL。
 */
export type TodoItem = TodoItemRow

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
