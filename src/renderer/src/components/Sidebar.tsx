import React from 'react'
import { useNavigate } from 'react-router-dom'
import { theme, Menu, Avatar, Dropdown, Input, Layout } from 'antd'
import type { MenuProps } from 'antd'
import {
  RiDashboardLine,
  RiQuillPenAiLine,
  RiCalendar2Line,
  RiSunCloudyLine,
  RiMusicLine,
  RiBook2Line,
  RiSettings2Line,
  RiNotification3Line,
  RiMailLine,
  RiUserLine,
  RiSearchLine,
  RiToolsLine,
  RiShieldKeyholeLine
} from '@remixicon/react'
import Logo from '../assets/logo.png'

interface SidebarProps {
  currentKey: string
  setCurrentKey: (key: string) => void
  onUserMenuClick: MenuProps['onClick']
}

const Sidebar: React.FC<SidebarProps> = ({ currentKey, setCurrentKey, onUserMenuClick }) => {
  const navigate = useNavigate()
  const {
    token: { colorBgContainer, borderRadiusLG, colorPrimary, colorText }
  } = theme.useToken()

  // 工作台主菜单
  const mainMenuItems: MenuProps['items'] = [
    {
      key: 'home',
      label: (
        <div className="flex items-center">
          <span>首页</span>
        </div>
      ),
      icon: <RiDashboardLine size={18} />
    },
    {
      key: 'notes',
      label: (
        <div className="flex items-center">
          <span>笔记</span>
        </div>
      ),
      icon: <RiQuillPenAiLine size={18} />
    },
    {
      key: 'knowledge',
      label: (
        <div className="flex items-center">
          <span>知识</span>
        </div>
      ),
      icon: <RiBook2Line size={18} />
    },
    {
      key: 'planner',
      label: (
        <div className="flex items-center">
          <span>计划</span>
        </div>
      ),
      icon: <RiCalendar2Line size={18} />
    },
    {
      key: 'tools',
      label: (
        <div className="flex items-center">
          <span>工具</span>
        </div>
      ),
      icon: <RiToolsLine size={18} />
    },
    {
      key: 'weather',
      label: (
        <div className="flex items-center">
          <span>天气</span>
        </div>
      ),
      icon: <RiSunCloudyLine size={18} />
    },
    {
      key: 'music',
      label: (
        <div className="flex items-center">
          <span>音乐</span>
        </div>
      ),
      icon: <RiMusicLine size={18} />
    }
  ]

  const onClickMenu: MenuProps['onClick'] = (e) => {
    navigate(`/${e.key}`)
    setCurrentKey(e.key)
  }

  // 用户菜单
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'settings',
      label: '系统设置',
      icon: <RiSettings2Line size={16} />
    },
    {
      key: 'notifications',
      label: '系统通知',
      icon: <RiNotification3Line size={16} />
    },
    {
      key: 'messages',
      label: '邮件消息',
      icon: <RiMailLine size={16} />
    },
    {
      type: 'divider'
    },
    {
      key: 'lock',
      label: '系统锁屏',
      icon: <RiShieldKeyholeLine size={16} />
    }
  ]

  return (
    <Layout.Sider
      width={240}
      style={{
        background: colorBgContainer,
        height: 'calc(100vh - 16px)',
        margin: '8px',
        borderRadius: borderRadiusLG,
        padding: '16px 0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden'
      }}
      collapsible={false}
      collapsed={false}
    >
      {/* Logo 区域 */}
      <div className="flex items-center justify-center mb-6">
        <img alt="logo" style={{ height: '40px', imageRendering: 'crisp-edges' }} src={Logo} />
      </div>

      {/* 搜索框 */}
      <div className="px-4 mb-6">
        <Input
          placeholder="搜索..."
          prefix={<RiSearchLine size={16} />}
          style={{ width: '100%' }}
        />
      </div>

      {/* 主菜单 */}
      <Menu
        mode="inline"
        items={mainMenuItems}
        onClick={onClickMenu}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0 8px'
        }}
        selectedKeys={[currentKey]}
      />

      {/* 用户区域 */}
      <div className="absolute bottom-4 left-0 right-0 px-4">
        <Dropdown
          menu={{
            items: userMenuItems,
            onClick: onUserMenuClick,
            style: { width: '208px' }
          }}
          trigger={['click']}
          placement="topRight"
        >
          <div className="flex items-start justify-center cursor-pointer">
            <div className="flex items-center px-6 py-2 hover:bg-gray-100 rounded-lg transition-colors duration-200">
              <Avatar
                size={39}
                style={{ backgroundColor: colorPrimary }}
                icon={<RiUserLine size={16} />}
              />
              <div className="ml-2 flex flex-col">
                <span className="font-medium" style={{ color: colorText }}>
                  Aitenry
                </span>
                <span className="text-sm" style={{ color: colorText }}>
                  aitenry@126.com
                </span>
              </div>
            </div>
          </div>
        </Dropdown>
      </div>
    </Layout.Sider>
  )
}

export default Sidebar
