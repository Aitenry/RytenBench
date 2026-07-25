import React, { useState } from 'react'
import { Button, Select } from 'antd'
import {
  RiMessageAi3Line,
  RiSettings4Line,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine
} from '@remixicon/react'
import ChatSettingsModal from './settings/Index'

interface ChatHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  selectedProviderId: number | null
  onSelectProvider: (value: number) => void
  groupedProviderOptions: {
    label: string
    options: { value: number; label: string; providerType: string }[]
  }[]
  colorBorderSecondary: string
  onNewChat: () => void
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  selectedProviderId,
  onSelectProvider,
  groupedProviderOptions,
  colorBorderSecondary,
  onNewChat
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{ borderBottom: `1px solid ${colorBorderSecondary}` }}
    >
      <div className="flex items-center gap-2">
        <Button
          type="text"
          size="small"
          icon={sidebarOpen ? <RiSidebarFoldLine size={16} /> : <RiSidebarUnfoldLine size={16} />}
          onClick={onToggleSidebar}
        />
        <Select
          size="small"
          value={selectedProviderId}
          onChange={(value) => onSelectProvider(value)}
          style={{ minWidth: 100 }}
          placeholder="选择模型"
          showSearch={{
            filterOption: (input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
          }}
          popupMatchSelectWidth={false}
          popupStyle={{ minWidth: 260 }}
          options={groupedProviderOptions}
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="text"
          size="small"
          icon={<RiMessageAi3Line size={16} />}
          onClick={onNewChat}
        />
        <Button
          type="text"
          size="small"
          icon={<RiSettings4Line size={16} />}
          onClick={() => setSettingsOpen(true)}
        />
      </div>
      <ChatSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default ChatHeader
