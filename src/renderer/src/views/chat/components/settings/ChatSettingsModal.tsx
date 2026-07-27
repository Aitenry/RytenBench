import React, { useState } from 'react'
import { Modal, theme } from 'antd'
import { RiSettings4Line, RiFileAi2Line, RiServerLine, RiListIndefinite } from '@remixicon/react'
import SkillsSettings from './SkillsSettings'
import GeneralSettings from './GeneralSettings'

type SettingsTab = 'general' | 'skills' | 'mcp'

const TAB_ITEMS: {
  key: SettingsTab
  label: string
  icon: React.ReactNode
}[] = [
  { key: 'general', label: '通用', icon: <RiListIndefinite size={18} /> },
  { key: 'skills', label: '技能', icon: <RiFileAi2Line size={18} /> },
  { key: 'mcp', label: 'MCP', icon: <RiServerLine size={18} /> }
]

interface ChatSettingsModalProps {
  open: boolean
  onClose: () => void
}

const ChatSettingsModal: React.FC<ChatSettingsModalProps> = ({ open, onClose }) => {
  const {
    token: {
      colorTextSecondary,
      colorBgContainer,
      colorFillAlter,
      colorBorderSecondary,
      borderRadiusLG,
      borderRadius,
      colorPrimary
    }
  } = theme.useToken()

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const renderContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />
      case 'skills':
        return <SkillsSettings />
      case 'mcp':
        return (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: colorTextSecondary }}
          >
            MCP 设置（即将上线）
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <RiSettings4Line size={18} />
          <span>设置</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={820}
      styles={{
        body: { padding: 0 }
      }}
      destroyOnHidden
    >
      <div
        className="flex"
        style={{ minHeight: 460, overflow: 'hidden', borderRadius: borderRadiusLG }}
      >
        {/* 左侧菜单 */}
        <div
          className="flex-shrink-0 flex flex-col py-3"
          style={{
            width: 140,
            borderRight: `1px solid ${colorBorderSecondary}`,
            background: colorFillAlter
          }}
        >
          {TAB_ITEMS.map((item) => {
            const isActive = activeTab === item.key
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className="flex items-center gap-2 mx-2 px-3 py-2 text-sm border-none cursor-pointer transition-all"
                style={{
                  background: isActive ? colorBgContainer : 'transparent',
                  color: isActive ? colorPrimary : colorTextSecondary,
                  fontWeight: isActive ? 600 : 400,
                  borderRadius: borderRadius,
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })}
        </div>

        {/* 右侧内容 */}
        <div
          className="flex-1 py-4 px-5 custom-scrollbar"
          style={{
            maxHeight: 500,
            overflowY: 'auto',
            background: colorBgContainer
          }}
        >
          {renderContent()}
        </div>
      </div>
    </Modal>
  )
}

export default ChatSettingsModal
