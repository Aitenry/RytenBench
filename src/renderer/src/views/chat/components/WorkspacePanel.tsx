import React, { useState, useCallback, useRef, useEffect } from 'react'
import FileExplorer from './FileExplorer'
import FileEditor, { OpenFile } from './FileEditor'
import type { Window } from '../../../../resource/types/window'

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

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({
  workspacePath,
  isDarkMode,
  colorBgContainer,
  borderRadiusLG,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  onHasOpenFilesChange
}) => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
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

  const handleOpenFile = useCallback(
    async (filePath: string, fileName: string) => {
      const existing = openFiles.find((f) => f.path === filePath)
      if (existing) {
        setActiveFilePath(filePath)
        return
      }
      try {
        const content = await readFileContent(filePath)
        setOpenFiles((prev) => [
          ...prev,
          { path: filePath, name: fileName, content, isDirty: false }
        ])
        setActiveFilePath(filePath)
      } catch (err) {
        console.error('Failed to open file:', err)
      }
    },
    [openFiles, readFileContent]
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
      if (!file) return
      try {
        const win = window as unknown as Window
        await win.api.workspace.saveFile(filePath, file.content)
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === filePath ? { ...f, isDirty: false } : f))
        )
      } catch (err) {
        console.error('Failed to save file:', err)
      }
    },
    [openFiles]
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
        />
      </div>
    </div>
  )
}

export default WorkspacePanel
