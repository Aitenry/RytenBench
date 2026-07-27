/** 通知类型 */
export type NotificationType = 'build_progress'

/** 通知基础字段 */
export interface BaseNotification {
  id: string
  type: NotificationType
  title: string
  description: string
  timestamp: number
  read: boolean
  onClick?: () => void
}

/** 图谱构建进度通知 */
export interface BuildProgressNotification extends BaseNotification {
  type: 'build_progress'
  wikiId: number
  wikiTitle: string
  phaseLabel: string
  phaseProgress: number
  overallProgress: number
  entityCount: number
  relationCount: number
  message: string
  completed: boolean
  minimized: boolean
}

/** 所有通知类型的联合 */
export type NotificationItem = BuildProgressNotification
