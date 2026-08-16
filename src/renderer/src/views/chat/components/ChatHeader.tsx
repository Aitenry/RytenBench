import React, { useState } from 'react'
import { Button } from 'antd'
import {
  RiListSettingsLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiApps2AddLine,
  RiLayoutRightLine,
  RiLayoutRightFill
} from '@remixicon/react'
import ChatSettingsModal from './settings/ChatSettingsModal'

interface ChatHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  panelOpen: boolean
  onTogglePanel: () => void
  colorBorderSecondary: string
  onNewChat: () => void
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  panelOpen,
  onTogglePanel,
  colorBorderSecondary,
  onNewChat
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div
      className="flex items-center justify-between px-2 py-1.5"
      style={{ borderBottom: `1px solid ${colorBorderSecondary}` }}
    >
      <div className="flex items-center gap-2">
        <Button
          type="text"
          size="small"
          icon={sidebarOpen ? <RiSidebarFoldLine size={16} /> : <RiSidebarUnfoldLine size={16} />}
          onClick={onToggleSidebar}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="text" size="small" icon={<RiApps2AddLine size={16} />} onClick={onNewChat} />
        <Button
          type="text"
          size="small"
          icon={<RiListSettingsLine size={16} />}
          onClick={() => setSettingsOpen(true)}
        />
        <Button
          type="text"
          size="small"
          icon={panelOpen ? <RiLayoutRightFill size={16} /> : <RiLayoutRightLine size={16} />}
          onClick={onTogglePanel}
        />
      </div>
      <ChatSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default ChatHeader
