import React, { useState, useEffect, useCallback } from 'react'
import {
  RiFolder3Line,
  RiFolderOpenLine,
  RiFileLine,
  RiArrowRightSLine,
  RiRefreshLine
} from '@remixicon/react'
import type { Window } from '../../../../resource/types/window'

export interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

interface FileExplorerProps {
  workspacePath: string
  isDarkMode: boolean
  colorBgContainer: string
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  onOpenFile: (filePath: string, fileName: string) => void
  activeFilePath?: string | null
}

interface TreeNode extends FileEntry {
  children: TreeNode[] | null
  expanded: boolean
  loaded: boolean
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  workspacePath,
  isDarkMode,
  colorBgContainer,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  onOpenFile,
  activeFilePath
}) => {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDir = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    const win = window as unknown as Window
    return win.api.workspace.listDir(dirPath)
  }, [])

  const loadRoot = useCallback(() => {
    if (!workspacePath) return
    setLoading(true)
    fetchDir(workspacePath)
      .then((entries) => {
        setRootNodes(
          entries.map((e) => ({
            ...e,
            children: e.isDirectory ? null : null,
            expanded: false,
            loaded: false
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [workspacePath, fetchDir])

  useEffect(() => {
    loadRoot()
  }, [loadRoot])

  const toggleExpand = useCallback(
    async (node: TreeNode) => {
      if (!node.isDirectory) {
        onOpenFile(node.path, node.name)
        return
      }
      if (node.expanded) {
        node.expanded = false
        setRootNodes([...rootNodes])
        return
      }
      if (!node.loaded) {
        const entries = await fetchDir(node.path)
        node.children = entries.map((e) => ({
          ...e,
          children: e.isDirectory ? null : null,
          expanded: false,
          loaded: false
        }))
        node.loaded = true
      }
      node.expanded = true
      setRootNodes([...rootNodes])
    },
    [rootNodes, fetchDir, onOpenFile]
  )

  const titleBarBg = isDarkMode ? '#252526' : '#f3f3f3'
  const titleBarBorder = isDarkMode ? '#1e1e1e' : '#e4e4e4'
  const hoverBg = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  const activeBg = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  const getRelativePath = (absPath: string): string => {
    const normalizedWs = workspacePath.replace(/\\/g, '/').replace(/\/$/, '')
    const normalizedPath = absPath.replace(/\\/g, '/')
    if (normalizedPath.startsWith(normalizedWs)) {
      return normalizedPath.slice(normalizedWs.length) || '/'
    }
    return '/' + normalizedPath.replace(/^\/+/, '')
  }

  const handleDragStart = (e: React.DragEvent, node: TreeNode): void => {
    const relativePath = getRelativePath(node.path)
    e.dataTransfer.setData('text/plain', relativePath)
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ path: relativePath, isDirectory: node.isDirectory })
    )
    e.dataTransfer.effectAllowed = 'copy'
  }

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const padLeft = 8 + depth * 16
    const isActiveFile = !node.isDirectory && activeFilePath === node.path
    return (
      <React.Fragment key={node.path}>
        <div
          draggable
          className="flex items-center gap-0.5 py-[2px] cursor-pointer select-none text-[13px]"
          style={{
            paddingLeft: padLeft,
            paddingRight: 8,
            color: colorText,
            background: isActiveFile ? activeBg : 'transparent'
          }}
          onClick={() => toggleExpand(node)}
          onDragStart={(e) => handleDragStart(e, node)}
          onMouseEnter={(e) => {
            if (!isActiveFile) e.currentTarget.style.background = hoverBg
          }}
          onMouseLeave={(e) => {
            if (!isActiveFile) e.currentTarget.style.background = 'transparent'
          }}
        >
          {node.isDirectory ? (
            <RiArrowRightSLine
              size={14}
              style={{
                color: colorTextTertiary,
                transform: node.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.1s',
                flexShrink: 0
              }}
            />
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          {node.isDirectory ? (
            node.expanded ? (
              <RiFolderOpenLine size={16} style={{ color: '#dcb67a', flexShrink: 0 }} />
            ) : (
              <RiFolder3Line size={16} style={{ color: '#dcb67a', flexShrink: 0 }} />
            )
          ) : (
            <RiFileLine
              size={16}
              style={{
                color: isActiveFile ? colorText : colorTextTertiary,
                flexShrink: 0
              }}
            />
          )}
          <span className="truncate leading-5">{node.name}</span>
        </div>
        {node.expanded &&
          node.children &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </React.Fragment>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: colorBgContainer }}>
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{
          height: 35,
          background: titleBarBg,
          borderBottom: `1px solid ${titleBarBorder}`
        }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: colorTextSecondary, letterSpacing: '0.3px' }}
        >
          资源编辑器
        </span>
        <button
          className="flex items-center justify-center w-6 h-6 rounded-md hover:opacity-70 transition-opacity"
          onClick={loadRoot}
          title="Refresh"
          style={{ color: colorTextTertiary }}
        >
          <RiRefreshLine size={14} />
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-1 history-scrollbar">
        {loading ? (
          <p className="text-xs text-center py-6" style={{ color: colorTextTertiary }}>
            Loading...
          </p>
        ) : rootNodes.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: colorTextTertiary }}>
            Empty folder
          </p>
        ) : (
          rootNodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  )
}

export default FileExplorer
