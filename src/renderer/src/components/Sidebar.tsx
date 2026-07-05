import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme, Menu, Card, Select } from 'antd'
import type { MenuProps } from 'antd'
import {
  RiDashboardLine,
  RiQuillPenAiLine,
  RiCalendar2Line,
  RiSunCloudyLine,
  RiMusicLine,
  RiBook2Line,
  RiToolsLine,
  RiFileListLine,
  RiDatabase2Line,
  RiBubbleChartLine,
  RiCodeSSlashLine,
  RiAiGenerate3dLine,
  RiTodoLine,
  RiCalendarTodoLine,
  RiChatAiLine,
  RiSettings3Line,
  RiComputerLine
} from '@remixicon/react'
import LogoLight from '../assets/logo-light.png'
import LogoNight from '../assets/logo-night.png'
import MusicMiniPlayer from './MusicMiniPlayer'
import { useTheme } from '@renderer/contexts/ThemeContext'

interface SidebarProps {
  currentKey: string
  setCurrentKey: (key: string) => void
  onUserMenuClick?: MenuProps['onClick']
}

const Sidebar: React.FC<SidebarProps> = ({ currentKey, setCurrentKey }) => {
  const navigate = useNavigate()
  const {
    token: { colorBgContainer, borderRadiusLG, colorFillAlter, colorTextSecondary }
  } = theme.useToken()
  const { effectiveTheme } = useTheme()
  const isDark = effectiveTheme === 'dark'

  const [cardType, setCardType] = useState<'music' | 'weather'>('music')

  const currentLogo = useMemo(() => (isDark ? LogoNight : LogoLight), [isDark])

  // 主菜单项
  const mainMenuItems: MenuProps['items'] = [
    { key: 'home', label: '首页', icon: <RiDashboardLine size={18} /> },
    {
      key: 'notes',
      label: '笔记',
      icon: <RiQuillPenAiLine size={18} />,
      children: [{ key: 'notes/manage', label: '所有笔记', icon: <RiFileListLine size={18} /> }]
    },
    {
      key: 'knowledge',
      label: '知识',
      icon: <RiBook2Line size={18} />,
      children: [
        { key: 'knowledge/manage', label: '知识库', icon: <RiDatabase2Line size={18} /> },
        { key: 'knowledge/graph', label: '知识图谱', icon: <RiBubbleChartLine size={18} /> }
      ]
    },
    {
      key: 'planner',
      label: '计划',
      icon: <RiCalendar2Line size={18} />,
      children: [
        { key: 'planner/schedule', label: '计划总览', icon: <RiCalendarTodoLine size={18} /> },
        { key: 'planner/matters', label: '待办事项', icon: <RiTodoLine size={18} /> }
      ]
    },
    {
      key: 'tools',
      label: '工具',
      icon: <RiToolsLine size={18} />,
      children: [
        { key: 'tools/mcp', label: 'MCP 仓库', icon: <RiAiGenerate3dLine size={18} /> },
        { key: 'tools/api', label: 'API 调用', icon: <RiCodeSSlashLine size={18} /> }
      ]
    },
    {
      key: 'settings',
      label: '设置',
      icon: <RiSettings3Line size={18} />,
      children: [
        { key: 'settings/provider', label: '模型配置', icon: <RiAiGenerate3dLine size={18} /> },
        { key: 'settings/system', label: '系统设置', icon: <RiComputerLine size={18} /> }
      ]
    },
    { key: 'chat', label: '助手', icon: <RiChatAiLine size={18} /> },
    { key: 'weather', label: '天气', icon: <RiSunCloudyLine size={18} /> },
    { key: 'music', label: '音乐', icon: <RiMusicLine size={18} /> }
  ]

  const onClickMenu: MenuProps['onClick'] = (e) => {
    navigate(`/${e.key}`)
    setCurrentKey(e.key)
  }

  const WeatherMiniCard = (): React.JSX.Element => (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">上海</div>
        <div className="text-xs" style={{ color: colorTextSecondary }}>
          多云
        </div>
      </div>
      <div className="text-2xl font-light">18°</div>
    </div>
  )

  return (
    <>
      {/* 自定义滚动条样式 - 仅作用于侧边栏菜单区域 */}
      <style>{`
        .ant-menu-submenu-title {
          padding-left: 16px !important;
        }
        .sidebar-menu-container {
          scrollbar-width: none;
          scrollbar-color: rgba(128, 128, 128, 0.2) transparent;
        }
        .sidebar-menu-container::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .sidebar-menu-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-menu-container::-webkit-scrollbar-thumb {
          background: rgba(128, 128, 128, 0.25);
          border-radius: 4px;
          transition: background 0.2s;
        }
        .sidebar-menu-container::-webkit-scrollbar-thumb:hover {
          background: rgba(128, 128, 128, 0.45);
        }
      `}</style>

      <div
        style={{
          width: 240,
          background: colorBgContainer,
          height: 'calc(100vh - 16px)',
          margin: '8px',
          borderRadius: borderRadiusLG,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center py-3">
          <img
            alt="logo"
            style={{ height: '43px', width: '215px', borderRadius: 8 }}
            src={currentLogo}
          />
        </div>

        {/* 主菜单区域 - 可滚动，添加自定义滚动条类名 */}
        <div
          style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
          className="px-2 sidebar-menu-container"
        >
          <Menu
            mode="inline"
            items={mainMenuItems}
            onClick={onClickMenu}
            style={{ background: 'transparent', border: 'none' }}
            styles={{ item: { paddingLeft: 16 }, subMenu: { item: { paddingLeft: 26 } } }}
            selectedKeys={[currentKey]}
          />
        </div>

        {/* 底部卡片 - 固定 */}
        <div className="px-1 pb-1" style={{ flexShrink: 0 }}>
          <Card
            size="small"
            variant="borderless"
            style={{
              background: colorFillAlter,
              borderRadius: 16,
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
            }}
            styles={{ body: { padding: '12px' } }}
            title={
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: colorTextSecondary }}>
                  {cardType === 'music' ? '当前播放' : '本地天气'}
                </span>
                <Select
                  value={cardType}
                  onChange={(value) => setCardType(value as 'music' | 'weather')}
                  variant="borderless"
                  size="small"
                  popupMatchSelectWidth={false}
                  style={{ width: 49 }}
                  options={[
                    {
                      value: 'music',
                      label: <RiMusicLine style={{ margin: '4px 0' }} size={16} />
                    },
                    {
                      value: 'weather',
                      label: <RiSunCloudyLine style={{ margin: '4px 0' }} size={16} />
                    }
                  ]}
                />
              </div>
            }
          >
            <div key={cardType} className="animate__animated animate__slideInUp animate__faster">
              {cardType === 'music' ? <MusicMiniPlayer /> : <WeatherMiniCard />}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

export default Sidebar
