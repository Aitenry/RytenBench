import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef
} from 'react'
import FileExplorer from './FileExplorer'
import FileEditor, { OpenFile } from './FileEditor'
import type { ToolDetailTab } from './ToolDetailView'
import type { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTranslation } from '@renderer/i18n'

interface WorkspacePanelProps {
  workspacePath: string
  isDarkMode: boolean
  colorBgContainer: string
  borderRadiusLG: number
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  onHasOpenFilesChange?: (hasOpen: boolean) => void
}

/** 右侧面板的对外能力（由聊天区的工具卡片经 WorkspaceBridge 调用） */
export interface WorkspacePanelHandle {
  /**
   * 打开工具卡片里的文件（虚拟路径）。工作区内的文件按真实路径打开（可保存、
   * 资源管理器同步高亮），工作区之外（如 /memories/...）以只读页签打开。
   */
  openVirtualFile: (virtualPath: string, realPath: string | null) => void
  /** 在资源管理器中定位并展开某目录（真实绝对路径） */
  revealPath: (realPath: string) => void
  /** 打开工具结果详情页签（ls / glob / grep / execute） */
  openToolDetail: (tab: Omit<ToolDetailTab, 'key' | 'name'>) => void
}

/** 从路径里取文件名（两种分隔符都吃） */
function baseName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || filePath
}

const WorkspacePanel = forwardRef<WorkspacePanelHandle, WorkspacePanelProps>(
  (
    {
      workspacePath,
      isDarkMode,
      colorBgContainer,
      borderRadiusLG,
      colorText,
      colorTextSecondary,
      colorTextTertiary,
      onHasOpenFilesChange
    },
    ref
  ) => {
    const { t } = useTranslation()
    const { viewMessage } = useMessage()
    const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
    const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
    /** 请求资源管理器定位到的目录（真实路径 + 递增序号；序号变化即重新展开） */
    const [revealRequest, setRevealRequest] = useState<{ path: string; nonce: number } | null>(null)
    const revealNonceRef = useRef(0)
    const [explorerWidth, setExplorerWidth] = useState(220)
    const draggingRef = useRef(false)

    const hasOpenFiles = openFiles.length > 0

    useEffect(() => {
      onHasOpenFilesChange?.(hasOpenFiles)
    }, [hasOpenFiles, onHasOpenFilesChange])

    const readFileContent = useCallback(async (filePath: string): Promise<string> => {
      const win = window as unknown as Window
      return win.api.workspace.readFile(filePath)
    }, [])

    /** 打开页签（已打开则仅切换，避免重复读取文件） */
    const addTab = useCallback((tab: OpenFile) => {
      setOpenFiles((prev) => (prev.some((f) => f.path === tab.path) ? prev : [...prev, tab]))
      setActiveFilePath(tab.path)
    }, [])

    const handleOpenFile = useCallback(
      async (filePath: string, fileName: string) => {
        const existing = openFiles.find((f) => f.path === filePath)
        if (existing) {
          setActiveFilePath(filePath)
          return
        }
        try {
          const content = await readFileContent(filePath)
          addTab({ path: filePath, name: fileName, content, isDirty: false })
        } catch (err) {
          console.error('Failed to open file:', err)
          viewMessage('workspace-open-file', 'error', t('harness.fileExplorer.openFailed'))
        }
      },
      [openFiles, readFileContent, addTab, viewMessage, t]
    )

    /**
     * 工具卡片「打开文件」：按虚拟路径读取。
     *
     * 与资源管理器打开的区别：这里走主进程的挂载解析（工作区 + 记忆目录都合法），
     * 因此 /memories/... 这类不在资源管理器里的文件也能看；工作区内的文件用真实
     * 路径做页签键（与资源管理器打开的是同一个页签，且仍可编辑保存）。
     */
    const handleOpenVirtualFile = useCallback(
      async (virtualPath: string, realPath: string | null) => {
        const key = realPath ?? virtualPath
        const existing = openFiles.find((f) => f.path === key)
        if (existing) {
          setActiveFilePath(key)
          return
        }
        try {
          const win = window as unknown as Window
          const result = await win.api.harness.readVirtualFile(virtualPath)
          if ('error' in result) {
            viewMessage('workspace-open-file', 'error', result.error)
            return
          }
          addTab({
            path: key,
            name: baseName(virtualPath),
            content: result.content,
            isDirty: false,
            readOnly: !realPath
          })
        } catch (err) {
          console.error('Failed to open virtual file:', err)
          viewMessage('workspace-open-file', 'error', t('harness.fileExplorer.openFailed'))
        }
      },
      [openFiles, addTab, viewMessage, t]
    )

    const handleOpenToolDetail = useCallback(
      (tab: Omit<ToolDetailTab, 'key' | 'name'>) => {
        const key = `tool:${tab.topicId}:${tab.callId}`
        const existing = openFiles.find((f) => f.path === key)
        if (existing) {
          setActiveFilePath(key)
          return
        }
        // 页签名：路径取末段（'src'），命令/模式取首行前 20 字符（命令整条太长会顶掉其它页签）
        const raw = tab.title.trim()
        const name = tab.kind === 'file' || tab.kind === 'dir' ? baseName(raw) : raw.slice(0, 20)
        const detail: ToolDetailTab = { ...tab, key, name: name || tab.kind }
        addTab({
          path: key,
          name: detail.name,
          content: '',
          isDirty: false,
          readOnly: true,
          tool: detail
        })
      },
      [openFiles, addTab]
    )

    useImperativeHandle(
      ref,
      () => ({
        openVirtualFile: (virtualPath, realPath) => {
          void handleOpenVirtualFile(virtualPath, realPath)
        },
        revealPath: (realPath) => {
          revealNonceRef.current += 1
          setRevealRequest({ path: realPath, nonce: revealNonceRef.current })
        },
        openToolDetail: (tab) => handleOpenToolDetail(tab)
      }),
      [handleOpenVirtualFile, handleOpenToolDetail]
    )

    const handleCloseFile = useCallback(
      (filePath: string) => {
        setOpenFiles((prev) => {
          const idx = prev.findIndex((f) => f.path === filePath)
          const next = prev.filter((f) => f.path !== filePath)
          if (activeFilePath === filePath && next.length > 0) {
            const newIdx = Math.min(idx, next.length - 1)
            setActiveFilePath(next[newIdx].path)
          } else if (next.length === 0) {
            setActiveFilePath(null)
          }
          return next
        })
      },
      [activeFilePath]
    )

    const handleSelectFile = useCallback((filePath: string) => {
      setActiveFilePath(filePath)
    }, [])

    const handleContentChange = useCallback((filePath: string, content: string) => {
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === filePath ? { ...f, content, isDirty: true } : f))
      )
    }, [])

    const handleSaveFile = useCallback(
      async (filePath: string) => {
        const file = openFiles.find((f) => f.path === filePath)
        if (!file || file.readOnly || file.tool) return
        try {
          const win = window as unknown as Window
          await win.api.workspace.saveFile(filePath, file.content)
          setOpenFiles((prev) =>
            prev.map((f) => (f.path === filePath ? { ...f, isDirty: false } : f))
          )
        } catch (err) {
          console.error('Failed to save file:', err)
          viewMessage('workspace-save-file', 'error', t('harness.fileExplorer.saveFailed'))
        }
      },
      [openFiles, viewMessage, t]
    )

    const handleResizerMouseDown = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault()
        draggingRef.current = true
        const startX = e.clientX
        const startWidth = explorerWidth

        const handleMouseMove = (ev: MouseEvent): void => {
          if (!draggingRef.current) return
          const newWidth = Math.min(300, Math.max(220, startWidth - (ev.clientX - startX)))
          setExplorerWidth(newWidth)
        }

        const handleMouseUp = (): void => {
          draggingRef.current = false
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
          document.body.style.cursor = ''
          document.body.style.userSelect = ''
        }

        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
      },
      [explorerWidth]
    )

    return (
      <div
        className="flex h-full overflow-hidden"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <style>{`
        .workspace-resizer {
          width: 6px;
          cursor: col-resize;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }
        .workspace-resizer-dragger {
          width: 2px;
          height: calc(100% - 16px);
          border-radius: 1px;
          background: ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'};
          transition: background 0.15s;
        }
        .workspace-resizer:hover .workspace-resizer-dragger {
          background: ${isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'};
        }
      `}</style>
        {/* When files are open → editor (flex-1) + resizer + explorer (fixed width) */}
        {/* When no files open → explorer takes full width, editor hidden */}
        {hasOpenFiles && (
          <>
            <div className="flex-1 min-w-0 overflow-hidden">
              <FileEditor
                openFiles={openFiles}
                activeFilePath={activeFilePath}
                isDarkMode={isDarkMode}
                colorBgContainer={colorBgContainer}
                colorText={colorText}
                colorTextSecondary={colorTextSecondary}
                colorTextTertiary={colorTextTertiary}
                onCloseFile={handleCloseFile}
                onSelectFile={handleSelectFile}
                onContentChange={handleContentChange}
                onSaveFile={handleSaveFile}
              />
            </div>

            <div className="workspace-resizer" onMouseDown={handleResizerMouseDown}>
              <div className="workspace-resizer-dragger" />
            </div>
          </>
        )}

        <div
          style={{
            width: hasOpenFiles ? explorerWidth : '100%',
            flexShrink: 0
          }}
        >
          <FileExplorer
            workspacePath={workspacePath}
            isDarkMode={isDarkMode}
            colorBgContainer={colorBgContainer}
            colorText={colorText}
            colorTextSecondary={colorTextSecondary}
            colorTextTertiary={colorTextTertiary}
            onOpenFile={handleOpenFile}
            activeFilePath={activeFilePath}
            revealRequest={revealRequest}
          />
        </div>
      </div>
    )
  }
)

WorkspacePanel.displayName = 'WorkspacePanel'

export default WorkspacePanel
