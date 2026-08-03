import React from 'react'

export interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
}

interface SidebarProps {
  currentKey: string
  menuItems: MenuItem[]
  onMenuClick: (key: string) => void
  colorTextSecondary: string
}

const Sidebar: React.FC<SidebarProps> = ({
  currentKey,
  menuItems,
  onMenuClick,
  colorTextSecondary
}) => {
  return (
    <div className="frame-body-left">
      <div className="frame-menu">
        {menuItems.map((item) => (
          <button
            key={item.key}
            className={`frame-menu-item ${currentKey === item.key ? 'frame-menu-item-active' : ''}`}
            onClick={() => onMenuClick(item.key)}
            title={item.label}
            style={{ color: currentKey === item.key ? undefined : colorTextSecondary }}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(Sidebar)
