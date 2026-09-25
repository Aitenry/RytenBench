/** 首页（思源风格三栏布局）共享类型 */

/** 左侧树中打开文档时携带的来源信息（用于面包屑） */
export interface DocSourceInfo {
  wikiId: number
  dirId?: number
  wikiTitle?: string
  dirName?: string
}

export type Selection =
  | { kind: 'doc'; docId: number; source?: DocSourceInfo }
  | { kind: 'todo'; todoId: number }
  | { kind: 'wiki-graph'; wikiId: number }
  | { kind: 'doc-graph'; wikiId: number; docId: number }
  | null
