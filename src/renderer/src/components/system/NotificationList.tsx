import React from 'react'
import { Progress, Tag, Typography } from 'antd'
import { useNotification } from '@renderer/contexts/useNotification'
import type { BuildProgressNotification } from '@renderer/types/notification'

interface NotificationListProps {
  onClose: () => void
  colorFillAlter: string
  colorText: string
  colorTextSecondary: string
}

const NotificationList: React.FC<NotificationListProps> = ({
  onClose,
  colorFillAlter,
  colorText,
  colorTextSecondary
}) => {
  const { notifications } = useNotification()

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
        暂无消息
      </div>
    )
  }

  return (
    <div style={{ maxHeight: 360, overflow: 'auto', width: 320 }}>
      {notifications.map((item) => {
        const isBuild = item.type === 'build_progress'
        const buildItem = isBuild ? (item as BuildProgressNotification) : null
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
              {buildItem && buildItem.completed && (
                <Tag color="success" style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
                  已完成
                </Tag>
              )}
              {buildItem && !buildItem.completed && (
                <Tag color="processing" style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}>
                  {buildItem.phaseLabel}
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 12, color: colorTextSecondary, marginTop: 2 }}>
              <div style={{ marginBottom: buildItem && !buildItem.completed ? 6 : 0 }}>
                {item.description}
              </div>
              {buildItem && !buildItem.completed && (
                <Progress
                  percent={buildItem.overallProgress}
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
