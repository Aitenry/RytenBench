import React from 'react'
import { Progress, Tag, Typography } from 'antd'
import { useNotification } from '@renderer/hooks/useNotification'
import { useTranslation } from '@renderer/i18n'

/**
 * 通知列表（外壳）。
 *
 * 通知的**载体**属外壳，**形状**属产生它的插件：core 只按字段名读取通用字段
 * （title/description）+ 已知的进度字段（phaseLabel/overallProgress/completed，
 * 缺失即不渲染对应片段）。插件停用后不会再产生新通知，历史通知仍能正常渲染。
 */
interface NotificationListProps {
  onClose: () => void
  colorFillAlter: string
  colorText: string
  colorTextSecondary: string
}

/** 进度类通知的展示字段（插件扩展字段，缺省时该片段不渲染） */
interface ProgressNotificationFields {
  phaseLabel?: string
  overallProgress?: number
  completed?: boolean
}

const NotificationList: React.FC<NotificationListProps> = ({
  onClose,
  colorFillAlter,
  colorText,
  colorTextSecondary
}) => {
  const { notifications } = useNotification()
  const { t } = useTranslation()

  if (notifications.length === 0) {
    return (
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: colorTextSecondary,
          fontSize: 13
        }}
      >
        {t('shell.notificationList.empty')}
      </div>
    )
  }

  return (
    <div style={{ maxHeight: 360, overflow: 'auto', width: 320 }}>
      {notifications.map((item) => {
        const progress: ProgressNotificationFields | null =
          item.type === 'build_progress' ? (item as unknown as ProgressNotificationFields) : null
        const isBuilding = Boolean(progress) && progress?.completed !== true
        return (
          <div
            key={item.id}
            style={{
              cursor: 'pointer',
              padding: '10px 16px',
              borderBottom: `1px solid ${colorFillAlter}`
            }}
            onClick={() => {
              item.onClick?.()
              onClose()
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}
            >
              <Typography.Text style={{ fontSize: 13, color: colorText, flex: 1 }} ellipsis>
                {item.title}
              </Typography.Text>
              {progress?.completed && (
                <Tag color="success" style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
                  {t('shell.notificationList.completed')}
                </Tag>
              )}
              {isBuilding && progress?.phaseLabel && (
                <Tag color="processing" style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
                  {progress.phaseLabel}
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: colorTextSecondary, marginTop: 2 }}>
              <div style={{ marginBottom: isBuilding ? 6 : 0 }}>{item.description}</div>
              {isBuilding && (
                <Progress
                  percent={progress?.overallProgress ?? 0}
                  size="small"
                  strokeColor="#1677ff"
                  showInfo={false}
                  style={{ marginBottom: 4 }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default NotificationList
