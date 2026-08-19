import React, { useState, useEffect } from 'react'
import { Modal, theme } from 'antd'
import {
  RiSettings3Line,
  RiMusicLine,
  RiMindMap,
  RiComputerLine,
  RiBrainAi3Line,
  RiAiAgentLine,
  RiFileAi2Line,
  RiBrain4Line
} from '@remixicon/react'
import GeneralSettings from './GeneralSettings'
import MusicSettings from './MusicSettings'
import GraphSettings from './GraphSettings'
import SystemInfo from './SystemInfo'
import ModelSettings from './ModelSettings'
import AgentSettings from '@renderer/views/chat/components/settings/AgentSettings'
import SkillsSettings from '@renderer/views/chat/components/settings/SkillsSettings'
import MemorySettings from '@renderer/views/chat/components/settings/MemorySettings'

export type SettingsTab =
  'general' | 'model' | 'music' | 'graph' | 'system' | 'agents' | 'skills' | 'memory'

interface TabItem {
  key: SettingsTab
  label: string
  icon: React.ReactNode
}

/** 分组导航：常规 + 助手（对话参数已由工程自动管理，无独立设置页） */
const NAV_GROUPS: { label: string; items: TabItem[] }[] = [
  {
    label: '常规',
    items: [
      { key: 'general', label: '通用', icon: <RiSettings3Line size={16} /> },
      { key: 'model', label: '模型', icon: <RiBrainAi3Line size={16} /> },
      { key: 'music', label: '音乐', icon: <RiMusicLine size={16} /> },
      { key: 'graph', label: '图谱', icon: <RiMindMap size={16} /> },
      { key: 'system', label: '系统', icon: <RiComputerLine size={16} /> }
    ]
  },
  {
    label: '助手',
    items: [
      { key: 'agents', label: '智能体', icon: <RiAiAgentLine size={16} /> },
      { key: 'skills', label: '技能', icon: <RiFileAi2Line size={16} /> },
      { key: 'memory', label: '记忆', icon: <RiBrain4Line size={16} /> }
    ]
  }
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose, initialTab }) => {
  const {
    token: {
      colorTextSecondary,
      colorTextTertiary,
      colorBgContainer,
      colorFillAlter,
      colorBorderSecondary,
      borderRadiusLG,
      borderRadius,
      colorPrimary
    }
  } = theme.useToken()

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'general')

  // 每次打开弹窗时同步外部传入的 initialTab
  useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab)
    }
  }, [open, initialTab])

  const renderContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />
      case 'model':
        return <ModelSettings />
      case 'music':
        return <MusicSettings />
      case 'graph':
        return <GraphSettings />
      case 'system':
        return <SystemInfo />
      case 'agents':
        return <AgentSettings />
      case 'skills':
        return <SkillsSettings />
      case 'memory':
        return <MemorySettings />
      default:
        return null
    }
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <RiSettings3Line size={18} style={{ color: colorPrimary }} />
          <span>设置</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={880}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
      <div
        className="flex"
        style={{ minHeight: 540, overflow: 'hidden', borderRadius: borderRadiusLG }}
      >
        {/* 左侧分组导航 */}
        <div
          className="flex-shrink-0 flex flex-col py-4"
          style={{
            width: 176,
            borderRight: `1px solid ${colorBorderSecondary}`,
            background: colorFillAlter
          }}
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} style={{ marginTop: gi === 0 ? 0 : 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: colorTextTertiary,
                  padding: '0 16px 6px',
                  userSelect: 'none'
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const isActive = activeTab === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className="flex items-center w-full text-left border-none cursor-pointer transition-colors"
                    style={{
                      gap: 10,
                      margin: '1px 8px',
                      padding: '8px 12px',
                      fontSize: 13,
                      width: 'calc(100% - 16px)',
                      background: isActive ? colorBgContainer : 'transparent',
                      color: isActive ? colorPrimary : colorTextSecondary,
                      fontWeight: isActive ? 600 : 400,
                      borderRadius,
                      boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        color: isActive ? colorPrimary : colorTextTertiary
                      }}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* 右侧内容 */}
        <div
          className="flex-1 custom-scrollbar"
          style={{
            padding: '24px 28px',
            maxHeight: 560,
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

export default SettingsModal
