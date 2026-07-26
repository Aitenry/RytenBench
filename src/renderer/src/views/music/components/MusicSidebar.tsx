import React from 'react'
import { theme, Button, Tooltip, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  RiFolderMusicLine,
  RiAddLine,
  RiPlayListLine,
  RiMoreLine,
  RiHistoryLine,
  RiHeartLine
} from '@remixicon/react'
import type { MusicFolder } from '../../../types/music'
import type { MusicSidebarProps } from '@renderer/types/components'

const MusicSidebar: React.FC<MusicSidebarProps> = ({
  folders,
  specialFolders,
  selectedFolderId,
  onSelectFolder,
  onAddTracks,
  onEditFolder,
  onDeleteFolder,
  onCreateClick,
  colorBgContainer,
  borderRadiusLG
}) => {
  const {
    token: { colorTextSecondary, colorTextTertiary, colorBorderSecondary }
  } = theme.useToken()

  const getMenuItems = (folder: MusicFolder): MenuProps['items'] => [
    {
      key: 'add',
      label: '添加歌曲',
      onClick: () => onAddTracks(folder.id)
    },
    {
      key: 'edit',
      label: '编辑歌单',
      onClick: () => onEditFolder(folder)
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除歌单',
      danger: true,
      onClick: () => onDeleteFolder(folder.id)
    }
  ]

  const renderFolderItem = (folder: MusicFolder, isSpecial: boolean): React.ReactNode => {
    const isSelected = selectedFolderId === folder.id
    const icon = isSpecial ? (
      SPECIAL_ICONS[folder.id]
    ) : (
      <RiFolderMusicLine size={18} className="flex-shrink-0 mr-3" />
    )

    return (
      <div
        key={folder.id}
        className="group flex items-center px-3 py-2.5 rounded-lg cursor-pointer mb-0.5 transition-colors"
        style={{
          color: colorTextSecondary,
          background: isSelected ? colorBorderSecondary : undefined
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = colorBorderSecondary
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = ''
        }}
        onClick={() => onSelectFolder(folder)}
      >
        {icon}
        <span className="text-sm truncate flex-1 min-w-0">{folder.name}</span>
        {!isSpecial && (
          <Dropdown
            menu={{ items: getMenuItems(folder) }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button
              type="text"
              size="small"
              icon={<RiMoreLine size={14} />}
              onClick={(e) => e.stopPropagation()}
              style={{ color: colorTextTertiary }}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </Dropdown>
        )}
      </div>
    )
  }

  return (
    <aside
      className="flex-shrink-0 w-60 flex flex-col rounded-lg overflow-hidden"
      style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}
    >
      <div className="py-1.5 px-3 border-b" style={{ borderColor: colorBorderSecondary }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: colorTextSecondary }}>
            歌单
          </span>
          <Tooltip title="新建歌单">
            <Button
              type="text"
              size="small"
              icon={<RiAddLine size={16} />}
              onClick={onCreateClick}
            />
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {specialFolders.length + folders.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-12"
            style={{ color: colorTextTertiary }}
          >
            <RiPlayListLine size={40} />
            <p className="mt-2 text-xs text-center">点击右上角 + 创建歌单</p>
          </div>
        )}
        {specialFolders.map((folder) => renderFolderItem(folder, true))}
        {specialFolders.length > 0 && folders.length > 0 && (
          <div className="my-1.5 mx-3 border-t" style={{ borderColor: colorBorderSecondary }} />
        )}
        {folders.map((folder) => renderFolderItem(folder, false))}
      </div>
    </aside>
  )
}

const SPECIAL_ICONS: Record<string, React.ReactNode> = {
  __recent__: <RiHistoryLine size={18} className="flex-shrink-0 mr-3" />,
  __liked__: <RiHeartLine size={18} className="flex-shrink-0 mr-3" />
}

export default MusicSidebar
