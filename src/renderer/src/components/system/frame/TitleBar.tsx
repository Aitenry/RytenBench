import React, { useCallback, useEffect, useRef, useState } from 'react'
import { theme, Button, Popover, Input, Dropdown, App, Modal } from 'antd'
import type { InputRef } from 'antd'
import {
  RiCollapseDiagonal2Line,
  RiExpandDiagonal2Line,
  RiFolderLine,
  RiFolderOpenLine,
  RiMoreLine,
  RiShutDownLine,
  RiSubtractLine,
  RiSearchLine,
  RiCloseLine
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [hoveredWsId, setHoveredWsId] = useState<number | null>(null)

  /* 重命名弹窗 */
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<WorkspaceRow | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  /* 搜索模式 */
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<InputRef | null>(null)
  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus()
  }, [searchMode])

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
    // 至少保留一个工作区（主进程 deleteWorkspace 同样有校验，这里提前拦截）
    if (workspaces.length <= 1) {
      viewMessage('ws-delete-last', 'warning', '至少需要保留一个工作区')
      return
    }
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
            // 删除的是当前工作区：自动切到剩余第一个
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
            }
          }
          await loadWorkspaces()
        } catch (err) {
          console.error('Failed to delete workspace:', err)
        }
      }
    })
  }

  /* 选择文件夹后直接创建并激活工作区（名称取目录名，之后可重命名） */
  const handleBrowseFolder = async (): Promise<void> => {
    try {
      const win = window as unknown as Window
      const dir = await win.api.chat.selectWorkspace()
      if (!dir) return
      const name =
        dir
          .replace(/[/\\]$/, '')
          .split(/[/\\]/)
          .pop() || '工作区'
      const id = await win.api.chat.createWorkspace(name, dir)
      await win.api.systemSettings.update({
        chat: {
          workspacePath: dir,
          activeWorkspaceId: id
        } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
      })
      setActiveWorkspaceId(id)
      setWorkspaceOpen(true)
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }))
      await loadWorkspaces()
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }

  /* 打开重命名弹窗 */
  const openRename = (ws: WorkspaceRow): void => {
    setRenameTarget(ws)
    setRenameName(ws.name)
    setRenameOpen(true)
  }

  /* 保存重命名 */
  const handleRenameSave = async (): Promise<void> => {
    const name = renameName.trim()
    if (!name || !renameTarget) {
      viewMessage('ws-rename-validate', 'warning', '请输入工作区名称')
      return
    }
    try {
      setRenameSaving(true)
      const win = window as unknown as Window
      await win.api.chat.updateWorkspace(renameTarget.id, { name })
      setRenameOpen(false)
      await loadWorkspaces()
      viewMessage('ws-rename-done', 'success', '工作区已重命名', 2)
    } catch (err) {
      console.error('Failed to rename workspace:', err)
      viewMessage('ws-rename-error', 'error', '重命名失败')
    } finally {
      setRenameSaving(false)
    }
  }

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)

  /* 搜索过滤后的工作区列表 */
  const filteredWorkspaces = searchQuery.trim()
    ? workspaces.filter((w) => w.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : workspaces

  /* 头部小图标按钮 */
  const iconBtn = (title: string, onClick: () => void, icon: React.ReactNode): React.ReactNode => (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: token.colorTextSecondary,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = token.colorFillTertiary
        e.currentTarget.style.color = token.colorText
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = token.colorTextSecondary
      }}
    >
      {icon}
    </button>
  )

  /* 工作区列表（搜索模式与普通模式共用，滚动高度不同） */
  const listNode = (
    <div style={{ maxHeight: searchMode ? 210 : 260, overflowY: 'auto' }}>
      {filteredWorkspaces.length === 0 ? (
        <div
          style={{
            padding: '18px 0',
            textAlign: 'center',
            fontSize: 12,
            color: token.colorTextTertiary
          }}
        >
          {searchQuery ? '无匹配的工作区' : '暂无工作区'}
        </div>
      ) : (
        filteredWorkspaces.map((ws) => (
          <div
            key={ws.id}
            className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors"
            style={{
              fontSize: 12,
              margin: '0 4px',
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
            <RiFolderLine size={14} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
            <span className="truncate flex-1 ml-1.5">{ws.name}</span>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'rename',
                    label: '重命名',
                    onClick: () => openRename(ws)
                  },
                  /* 仅剩一个工作区时不提供删除（保留重命名） */
                  ...(workspaces.length > 1
                    ? [
                        {
                          key: 'delete',
                          label: '删除',
                          danger: true as const,
                          onClick: () => handleDeleteWorkspace(ws)
                        }
                      ]
                    : [])
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
        ))
      )}
    </div>
  )

  const workspaceContent = (
    <div style={{ width: 200, background: token.colorBgElevated }}>
      {searchMode ? (
        /* 搜索模式：搜索框与结果合并为一个整体面板 */
        <div
          style={{
            margin: 6,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 10,
            overflow: 'hidden',
            background: token.colorFillQuaternary
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 6px 6px 10px' }}
          >
            <Input
              ref={searchInputRef}
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onPressEnter={() => {
                if (filteredWorkspaces.length > 0) handleSelectWorkspace(filteredWorkspaces[0])
              }}
              placeholder="搜索工作区"
              allowClear
              variant="borderless"
              prefix={<RiSearchLine size={14} style={{ color: token.colorTextTertiary }} />}
              style={{ flex: 1, background: 'transparent' }}
            />
            {iconBtn(
              '退出搜索',
              () => {
                setSearchMode(false)
                setSearchQuery('')
              },
              <RiCloseLine size={15} />
            )}
          </div>
          <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>{listNode}</div>
        </div>
      ) : (
        <>
          {/* 头部：工作区标题 + 搜索 / 添加 */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 10px 8px' }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: token.colorText,
                paddingLeft: 2,
                userSelect: 'none'
              }}
            >
              工作区
            </span>
            <span style={{ flex: 1 }} />
            {iconBtn('搜索工作区', () => setSearchMode(true), <RiSearchLine size={15} />)}
            <span style={{ width: 6, flexShrink: 0 }} />
            {iconBtn('添加工作区', handleBrowseFolder, <RiFolderOpenLine size={15} />)}
          </div>

          {/* 工作区列表 */}
          <div style={{ padding: '0 0 6px' }}>{listNode}</div>
        </>
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
            margin: '0 6px',
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
          overlayStyle={{ width: 200 }}
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
                padding: '0 2px',
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

      {/* 重命名工作区弹窗 */}
      <Modal
        title="重命名工作区"
        open={renameOpen}
        onCancel={() => {
          setRenameOpen(false)
          setRenameTarget(null)
        }}
        onOk={handleRenameSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={renameSaving}
        width={380}
      >
        <Input
          autoFocus
          placeholder="工作区名称"
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={handleRenameSave}
        />
      </Modal>
    </div>
  )
}

export default React.memo(TitleBar)
