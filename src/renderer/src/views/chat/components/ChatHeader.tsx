import React from 'react'
import { Button } from 'antd'
import {
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiApps2AddLine,
  RiLayoutRightLine,
  RiLayoutRightFill
} from '@remixicon/react'
import BackgroundAgentsButton from './BackgroundAgentsButton'

interface ChatHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  panelOpen: boolean
  onTogglePanel: () => void
  colorBorderSecondary: string
  onNewChat: () => void
  currentTopicId: number | null
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  panelOpen,
  onTogglePanel,
  colorBorderSecondary,
  onNewChat,
  currentTopicId
}) => {
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
        <BackgroundAgentsButton currentTopicId={currentTopicId} />
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="text" size="small" icon={<RiApps2AddLine size={16} />} onClick={onNewChat} />
        <Button
          type="text"
          size="small"
          icon={panelOpen ? <RiLayoutRightFill size={16} /> : <RiLayoutRightLine size={16} />}
          onClick={onTogglePanel}
        />
      </div>
    </div>
  )
}

export default ChatHeader
