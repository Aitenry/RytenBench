import React, { useState, useEffect, useCallback } from 'react'
import { Button, Popover, Input, Modal, Dropdown, App } from 'antd'
import {
  RiListSettingsLine,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiApps2AddLine,
  RiFolderOpenLine,
  RiMoreLine,
  RiLayoutRightLine,
  RiLayoutRightFill
} from '@remixicon/react'
import ChatSettingsModal from './settings/ChatSettingsModal'
import type { WorkspaceRow } from '../../../../../main/database/mapper/chat'
import type { Window } from '../../../../resource/types/window'

interface ChatHeaderProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  panelOpen: boolean
  onTogglePanel: () => void
  colorBorderSecondary: string
  onNewChat: () => void
  onWorkspaceChange: () => Promise<void>
  refreshTrigger?: number
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  sidebarOpen,
  onToggleSidebar,
  panelOpen,
  onTogglePanel,
  colorBorderSecondary,
  onNewChat,
  onWorkspaceChange,
  refreshTrigger
}) => {
  const { message } = App.useApp()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null)
  const [creatingName, setCreatingName] = useState('')
  const [creatingPath, setCreatingPath] = useState('')

  const loadWorkspaces = useCallback(async () => {
    try {
      const win = window as unknown as Window
      const [list, settings] = await Promise.all([
        win.api.chat.getAllWorkspaces(),
        win.api.systemSettings.getAll()
      ])
      setWorkspaces(list)
      setActiveWorkspaceId(settings.chat.activeWorkspaceId ?? null)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces, refreshTrigger])

  const handleWorkspaceButtonClick = async (): Promise<void> => {
    if (workspaces.length === 0) {
      await handleBrowseFolder()
    } else {
      setWorkspaceOpen(true)
    }
  }

  const handleSelectWorkspace = async (ws: WorkspaceRow): Promise<void> => {
    try {
      const win = window as unknown as Window
      await win.api.systemSettings.update({
        chat: {
          workspacePath: ws.path,
          activeWorkspaceId: ws.id
        } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
      })
      setActiveWorkspaceId(ws.id)
      setWorkspaceOpen(false)
      onNewChat()
      onWorkspaceChange().then()
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: ws.id } }))
    } catch (err) {
      console.error('Failed to switch workspace:', err)
    }
  }

  const handleDeleteWorkspace = async (ws: WorkspaceRow): Promise<void> => {
    Modal.confirm({
      title: '删除工作区',
      content: `确定要删除「${ws.name}」吗？该工作区下的所有对话记录也将被删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const win = window as unknown as Window
          await win.api.chat.deleteWorkspace(ws.id)
          if (activeWorkspaceId === ws.id) {
            await win.api.systemSettings.update({
              chat: {
                workspacePath: undefined,
                activeWorkspaceId: undefined
              } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
            })
            setActiveWorkspaceId(null)
            onNewChat()
            onWorkspaceChange().then()
            window.dispatchEvent(
              new CustomEvent('workspace-changed', { detail: { workspaceId: null } })
            )
          }
          await loadWorkspaces()
        } catch (err) {
          console.error('Failed to delete workspace:', err)
        }
      }
    })
  }

  const handleBrowseFolder = async (): Promise<void> => {
    try {
      const dir = await (window as unknown as Window).api.chat.selectWorkspace()
      if (dir) {
        setCreatingPath(dir)
        // 取路径最后一级作为默认名称
        const defaultName =
          dir
            .replace(/[/\\]$/, '')
            .split(/[/\\]/)
            .pop() || dir
        setCreatingName(defaultName)
        setWorkspaceOpen(true)
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
    }
  }

  const handleCreateWorkspace = async (): Promise<void> => {
    const name = creatingName.trim()
    if (!name || !creatingPath) {
      message.warning('请输入工作区名称')
      return
    }
    try {
      const win = window as unknown as Window
      const id = await win.api.chat.createWorkspace(name, creatingPath)
      await win.api.systemSettings.update({
        chat: {
          workspacePath: creatingPath,
          activeWorkspaceId: id
        } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
      })
      setActiveWorkspaceId(id)
      setCreatingName('')
      setCreatingPath('')
      setWorkspaceOpen(false)
      onNewChat()
      onWorkspaceChange().then()
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }))
      await loadWorkspaces()
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)

  const workspaceContent = (
    <div style={{ width: 320, maxHeight: 360, overflowY: 'auto' }}>
      {/* 选择文件夹 */}
      <div className="mb-2">
        <Button
          block
          icon={<RiFolderOpenLine size={14} />}
          onClick={handleBrowseFolder}
          size="small"
        >
          选择文件夹
        </Button>
      </div>

      {/* 新工作区名称 & 路径 & 创建按钮 */}
      {creatingPath && (
        <div className="mb-2 p-2 rounded" style={{ background: 'rgba(0,0,0,0.04)' }}>
          <div className="text-xs mb-1" style={{ wordBreak: 'break-all', opacity: 0.6 }}>
            {creatingPath}
          </div>
          <div className="flex items-center gap-1">
            <Input
              size="small"
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              placeholder="工作区名称"
              onPressEnter={handleCreateWorkspace}
              style={{ flex: 1 }}
            />
            <Button size="small" type="primary" onClick={handleCreateWorkspace}>
              创建
            </Button>
          </div>
        </div>
      )}

      {/* 工作区列表 */}
      {workspaces.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ opacity: 0.5 }}>
            工作区列表
          </div>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-black/5 transition-colors text-sm"
              style={{
                background: ws.id === activeWorkspaceId ? 'rgba(0,0,0,0.06)' : undefined
              }}
              onClick={() => handleSelectWorkspace(ws)}
            >
              <span className="truncate flex-1">{ws.name}</span>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'delete',
                      label: '删除',
                      danger: true,
                      onClick: () => handleDeleteWorkspace(ws)
                    }
                  ]
                }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button
                  type="text"
                  size="small"
                  icon={<RiMoreLine size={14} />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div
      className="flex items-center justify-between px-2 py-1.5"
      style={{ borderBottom: `1px solid ${colorBorderSecondary}` }}
    >
      <div className="flex items-center gap-2">
        <Button
          type="text"
          size="small"
          icon={sidebarOpen ? <RiSidebarFoldLine size={16} /> : <RiSidebarUnfoldLine size={16} />}
          onClick={onToggleSidebar}
        />
        <Popover
          content={workspaceContent}
          title={null}
          trigger={workspaces.length === 0 ? [] : 'click'}
          open={workspaceOpen}
          onOpenChange={setWorkspaceOpen}
          placement="bottomLeft"
          overlayStyle={{ width: 340 }}
        >
          <Button
            type="text"
            size="small"
            onClick={handleWorkspaceButtonClick}
            style={{
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {activeWs ? activeWs.name : '选择工作区'}
          </Button>
        </Popover>
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="text" size="small" icon={<RiApps2AddLine size={16} />} onClick={onNewChat} />
        <Button
          type="text"
          size="small"
          icon={<RiListSettingsLine size={16} />}
          onClick={() => setSettingsOpen(true)}
        />
        <Button
          type="text"
          size="small"
          icon={panelOpen ? <RiLayoutRightFill size={16} /> : <RiLayoutRightLine size={16} />}
          onClick={onTogglePanel}
        />
      </div>
      <ChatSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default ChatHeader
