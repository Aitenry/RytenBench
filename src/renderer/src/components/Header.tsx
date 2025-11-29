import React from 'react'
import { useNavigate } from 'react-router-dom' // Import useNavigate
import { theme, Menu, Avatar, Dropdown, Input } from 'antd'
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

interface HeaderProps {
  currentKey: string
  setCurrentKey: (key: string) => void
  onUserMenuClick: MenuProps['onClick']
}

const Header: React.FC<HeaderProps> = ({ currentKey, setCurrentKey, onUserMenuClick }) => {
  const navigate = useNavigate()
  const {
    token: { colorBgContainer, borderRadiusLG, colorPrimary }
  } = theme.useToken()

  // 工作台主菜单
  const mainMenuItems: MenuProps['items'] = [
    {
      key: 'home',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiDashboardLine size={17} />
          <span className="text-xs mt-1">首页</span>
        </div>
      )
    },
    {
      key: 'notes',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiQuillPenAiLine size={17} />
          <span className="text-xs mt-1">笔记</span>
        </div>
      )
    },
    {
      key: 'knowledge',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiBook2Line size={17} />
          <span className="text-xs mt-1">知识</span>
        </div>
      )
    },
    {
      key: 'planner',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiCalendar2Line size={17} />
          <span className="text-xs mt-1">计划</span>
        </div>
      )
    },
    {
      key: 'tools',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiToolsLine size={17} />
          <span className="text-xs mt-1">工具</span>
        </div>
      )
    },
    {
      key: 'weather',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiSunCloudyLine size={17} />
          <span className="text-xs mt-1">天气</span>
        </div>
      )
    },
    {
      key: 'music',
      label: (
        <div className="flex flex-col items-center justify-center">
          <RiMusicLine size={17} />
          <span className="text-xs mt-1">音乐</span>
        </div>
      )
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
    <header
      className="m-2.5 flex items-center justify-between"
      style={{
        background: colorBgContainer,
        minHeight: '77px',
        borderRadius: borderRadiusLG,
        padding: '0 20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
      }}
    >
      {/* Logo 区域 */}
      <div className="flex items-center" style={{ width: '230px' }}>
        <img alt="logo" style={{ height: '39px', imageRendering: 'crisp-edges' }} src={Logo} />
      </div>

      {/* 居中菜单 - 轻量级工作台功能 */}
      <div className="flex items-center justify-center flex-1">
        <Menu
          mode="horizontal"
          items={mainMenuItems}
          onClick={onClickMenu}
          style={{
            background: colorBgContainer,
            border: 'none',
            flex: '0 1 auto'
          }}
          selectedKeys={[currentKey]} // Use currentKey from props
        />
      </div>

      {/* 右侧功能区域 - 搜索框和用户头像 */}
      <div className="flex items-center space-x-2" style={{ width: '230px' }}>
        {/* 搜索框 */}
        <Input
          placeholder="搜索..."
          prefix={<RiSearchLine size={16} />}
          style={{ width: '100%' }}
        />

        {/* 用户下拉菜单 */}
        <Dropdown
          menu={{
            items: userMenuItems,
            onClick: onUserMenuClick,
            style: { width: '115px' }
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <div className="cursor-pointer hover:bg-gray-200 p-1 rounded transition-colors">
            <Avatar style={{ backgroundColor: colorPrimary }} icon={<RiUserLine size={16} />} />
          </div>
        </Dropdown>
      </div>
    </header>
  )
}

export default Header
