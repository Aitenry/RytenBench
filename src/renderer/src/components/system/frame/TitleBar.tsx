import React, { useCallback, useEffect, useState } from 'react'
import { theme, Button, Popover, Input, Dropdown, App } from 'antd'
import {
  RiCollapseDiagonal2Line,
  RiExpandDiagonal2Line,
  RiFolderOpenLine,
  RiMoreLine,
  RiShutDownLine,
  RiSubtractLine
} from '@remixicon/react'
import logo from '@renderer/assets/logo.png'
import { useMessage } from '@renderer/hooks/useMessage'
import type { WorkspaceRow } from '../../../../../main/database/mapper/chat'
import type { Window } from '../../../../resource/types/window'

interface TitleBarProps {
  isMaximized: boolean
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  colorText: string
  colorTextSecondary: string
}

const TitleBar: React.FC<TitleBarProps> = ({
  isMaximized,
  onMinimize,
  onMaximize,
  onClose,
  colorText,
  colorTextSecondary
}) => {
  const { token } = theme.useToken()
  const { viewMessage } = useMessage()
  const { modal } = App.useApp()

  /* ── 工作区状态 ── */
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null)
  const [creatingName, setCreatingName] = useState('')
  const [creatingPath, setCreatingPath] = useState('')
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [hoveredWsId, setHoveredWsId] = useState<number | null>(null)

  const loadWorkspaces = useCallback(async (): Promise<void> => {
    try {
      const win = window as unknown as Window
      const [list, settings] = await Promise.all([
        win.api.chat.getAllWorkspaces(),
        win.api.systemSettings.getAll()
      ])
      setWorkspaces(list)
      setActiveWorkspaceId(settings.chat.activeWorkspaceId ?? null)
    } catch (err) {
      console.error('Failed to load workspaces:', err)
    }
  }, [])

  useEffect(() => {
    loadWorkspaces().then()
  }, [loadWorkspaces])

  /* 其他入口（如聊天引导页）创建/切换工作区时，同步刷新标题栏列表 */
  useEffect(() => {
    const onWorkspaceChanged = (): void => {
      loadWorkspaces().then()
    }
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', onWorkspaceChanged)
  }, [loadWorkspaces])

  /** 无工作区时点击直接走「选择文件夹」流程 */
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
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: ws.id } }))
      await loadWorkspaces()
    } catch (err) {
      console.error('Failed to switch workspace:', err)
    }
  }

  const handleDeleteWorkspace = (ws: WorkspaceRow): void => {
    modal.confirm({
      title: '删除工作区',
      content: `确定要删除「${ws.name}」吗？该工作区下的所有内容也将被删除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const win = window as unknown as Window
          await win.api.chat.deleteWorkspace(ws.id)
          if (activeWorkspaceId === ws.id) {
            // 删除的是当前工作区：自动切到剩余第一个；一个不剩则置 0（主进程按 0 查询为空）
            const remaining = await win.api.chat.getAllWorkspaces()
            if (remaining.length > 0) {
              const next = remaining[0]
              await win.api.systemSettings.update({
                chat: {
                  workspacePath: next.path,
                  activeWorkspaceId: next.id
                } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
              })
              setActiveWorkspaceId(next.id)
              window.dispatchEvent(
                new CustomEvent('workspace-changed', { detail: { workspaceId: next.id } })
              )
            } else {
              // 注意：systemSettings.update 会跳过 undefined，必须用 0 显式清空
              await win.api.systemSettings.update({
                chat: {
                  activeWorkspaceId: 0
                } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
              })
              setActiveWorkspaceId(null)
              window.dispatchEvent(
                new CustomEvent('workspace-changed', { detail: { workspaceId: null } })
              )
            }
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
      viewMessage('ws-create-validate', 'warning', '请输入工作区名称')
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
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }))
      await loadWorkspaces()
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)

  const workspaceContent = (
    <div
      style={{ width: 320, maxHeight: 360, overflowY: 'auto', background: token.colorBgElevated }}
    >
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
        <div className="mb-2 p-2 rounded" style={{ background: token.colorFillTertiary }}>
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
              className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors text-sm"
              style={{
                background:
                  ws.id === activeWorkspaceId
                    ? token.colorFillSecondary
                    : hoveredWsId === ws.id
                      ? token.colorFillTertiary
                      : 'transparent'
              }}
              onMouseEnter={() => setHoveredWsId(ws.id)}
              onMouseLeave={() => setHoveredWsId(null)}
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
    <div className="frame-titlebar" style={{ height: 36 }}>
      <div className="frame-titlebar-left">
        <img src={logo} alt="RytenBench" className="frame-titlebar-icon" />
        <span className="frame-titlebar-title" style={{ color: colorTextSecondary }}>
          RytenBench
        </span>

        {/* 标题与工作区切换器之间的低调分隔 */}
        <div
          style={{
            width: 1,
            height: 14,
            margin: '0 10px',
            background: colorTextSecondary,
            opacity: 0.15,
            flexShrink: 0
          }}
        />

        {/* 工作区切换器 */}
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
            style={
              {
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 12,
                color: colorTextSecondary,
                WebkitAppRegion: 'no-drag'
              } as React.CSSProperties
            }
          >
            {activeWs ? activeWs.name : '选择工作区'}
          </Button>
        </Popover>
      </div>

      <div className="frame-titlebar-controls" style={{ color: colorText }}>
        <button className="frame-titlebar-btn" onClick={onMinimize} title="最小化">
          <RiSubtractLine size={16} />
        </button>
        <button
          className="frame-titlebar-btn"
          onClick={onMaximize}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <RiCollapseDiagonal2Line size={16} />
          ) : (
            <RiExpandDiagonal2Line size={16} />
          )}
        </button>
        <button
          className="frame-titlebar-btn frame-titlebar-btn-close"
          onClick={onClose}
          title="关闭"
        >
          <RiShutDownLine size={16} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(TitleBar)
