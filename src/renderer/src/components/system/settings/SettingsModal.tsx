import React, { useState, useEffect } from 'react'
import { Modal, theme } from 'antd'
import {
  RiSettings3Line,
  RiMusicLine,
  RiMindMap,
  RiComputerLine,
  RiBrainAi3Line
} from '@remixicon/react'
import GeneralSettings from './GeneralSettings'
import MusicSettings from './MusicSettings'
import GraphSettings from './GraphSettings'
import SystemInfo from './SystemInfo'
import ModelSettings from './ModelSettings'

type SettingsTab = 'general' | 'music' | 'graph' | 'model' | 'system'

const TAB_ITEMS: {
  key: SettingsTab
  label: string
  icon: React.ReactNode
}[] = [
  { key: 'general', label: '通用', icon: <RiSettings3Line size={18} /> },
  { key: 'music', label: '音乐', icon: <RiMusicLine size={18} /> },
  { key: 'graph', label: '图谱', icon: <RiMindMap size={18} /> },
  { key: 'model', label: '模型', icon: <RiBrainAi3Line size={18} /> },
  { key: 'system', label: '系统', icon: <RiComputerLine size={18} /> }
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
      case 'music':
        return <MusicSettings />
      case 'graph':
        return <GraphSettings />
      case 'model':
        return <ModelSettings />
      case 'system':
        return <SystemInfo />
      default:
        return null
    }
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <RiSettings3Line size={18} />
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

export default SettingsModal
