import React from 'react'
import { Button } from 'antd'
import {
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
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
  currentTopicId: number | null
}

/** 会话头部：侧边栏折叠 / 后台智能体 / 工作区面板开关（新建会话在侧边栏的工作区行上） */
const ChatHeader: React.FC<ChatHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  panelOpen,
  onTogglePanel,
  colorBorderSecondary,
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
