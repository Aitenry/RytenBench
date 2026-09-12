import React, { useState, useEffect, useMemo } from 'react'
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
import AgentSettings from '@renderer/views/harness/components/settings/AgentSettings'
import SkillsSettings from '@renderer/views/harness/components/settings/SkillsSettings'
import MemorySettings from '@renderer/views/harness/components/settings/MemorySettings'

export type SettingsTab =
  'general' | 'model' | 'music' | 'graph' | 'system' | 'agents' | 'skills' | 'memory'

interface TabItem {
  key: SettingsTab
  label: string
  icon: React.ReactNode
}

/** 全部设置页元数据 */
const TAB_META: Record<SettingsTab, TabItem> = {
  general: { key: 'general', label: '通用', icon: <RiSettings3Line size={16} /> },
  model: { key: 'model', label: '模型', icon: <RiBrainAi3Line size={16} /> },
  music: { key: 'music', label: '音乐', icon: <RiMusicLine size={16} /> },
  graph: { key: 'graph', label: '图谱', icon: <RiMindMap size={16} /> },
  system: { key: 'system', label: '系统', icon: <RiComputerLine size={16} /> },
  agents: { key: 'agents', label: '智能体', icon: <RiAiAgentLine size={16} /> },
  skills: { key: 'skills', label: '技能', icon: <RiFileAi2Line size={16} /> },
  memory: { key: 'memory', label: '记忆', icon: <RiBrain4Line size={16} /> }
}

/** 完整设置的分组导航：常规 + 助手 */
const NAV_GROUPS: { label: string; items: TabItem[] }[] = [
  {
    label: '常规',
    items: ['general', 'model', 'music', 'graph', 'system'].map((k) => TAB_META[k as SettingsTab])
  },
  {
    label: '助手',
    items: ['agents', 'skills', 'memory'].map((k) => TAB_META[k as SettingsTab])
  }
]

/**
 * 助手设置（聚焦模式）页签：智能体 → 模型 → 技能 → 记忆。
 *
 * 侧边栏「助手设置」入口用这一组：只显示助手相关内容，通用 / 音乐 / 图谱 / 系统等
 * 系统级页面不出现（模型页按用户要求排在技能之前）。
 */
const ASSISTANT_SETTINGS_TABS: SettingsTab[] = ['agents', 'model', 'skills', 'memory']

/** 设置弹窗的展示范围：full = 全部设置页；assistant = 只显示助手相关的四页 */
export type SettingsScope = 'full' | 'assistant'

/** 从候选里挑一个可用页签：白名单内优先用传入值，否则退回白名单第一项 */
function pickTab(
  tab: SettingsTab | undefined,
  only: SettingsTab[] | null | undefined
): SettingsTab {
  if (only && only.length > 0) {
    return tab && only.includes(tab) ? tab : only[0]
  }
  return tab ?? 'general'
}

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  initialTab?: SettingsTab
  /** 展示范围：assistant = 聚焦模式（只显示助手设置四页）；默认 full = 全部设置页 */
  scope?: SettingsScope
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  initialTab,
  scope = 'full'
}) => {
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

  /** 聚焦模式下生效的页签白名单（其余页面整组隐藏） */
  const onlyTabs = scope === 'assistant' ? ASSISTANT_SETTINGS_TABS : null

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => pickTab(initialTab, onlyTabs))

  // 每次打开弹窗时同步外部传入的 initialTab（聚焦模式下收敛到白名单内的页签）
  useEffect(() => {
    if (open) {
      setActiveTab(pickTab(initialTab, onlyTabs))
    }
  }, [open, initialTab, onlyTabs])

  /** 聚焦模式只渲染白名单内的分组，其余系统级页面整组隐藏 */
  const navGroups = useMemo(() => {
    if (!onlyTabs || onlyTabs.length === 0) return NAV_GROUPS
    return [{ label: '助手', items: onlyTabs.map((key) => TAB_META[key]) }]
  }, [onlyTabs])

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
          {navGroups.map((group, gi) => (
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
