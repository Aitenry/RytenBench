import React, { useState } from 'react'
import { Popover } from 'antd'
import { RiNotification3Line, RiSettings3Line } from '@remixicon/react'
import { useTranslation } from '@renderer/i18n'
import NotificationList from '../NotificationList'

interface RightBarProps {
  onSettingsClick: () => void
  colorFillAlter: string
  colorText: string
  colorTextSecondary: string
}

const RightBar: React.FC<RightBarProps> = ({
  onSettingsClick,
  colorFillAlter,
  colorText,
  colorTextSecondary
}) => {
  const [notifOpen, setNotifOpen] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="frame-body-right">
      <div className="frame-menu">
        <Popover
          content={
            <NotificationList
              onClose={() => setNotifOpen(false)}
              colorFillAlter={colorFillAlter}
              colorText={colorText}
              colorTextSecondary={colorTextSecondary}
            />
          }
          trigger="click"
          open={notifOpen}
          onOpenChange={(open) => {
            setNotifOpen(open)
          }}
          placement="leftTop"
        >
          <button
            className="frame-menu-item"
            title={t('shell.rightBar.messages')}
            style={{ color: colorTextSecondary }}
          >
            <RiNotification3Line size={16} />
          </button>
        </Popover>
        <button
          className="frame-menu-item"
          onClick={onSettingsClick}
          title={t('shell.rightBar.settings')}
          style={{ color: colorTextSecondary }}
        >
          <RiSettings3Line size={16} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(RightBar)
