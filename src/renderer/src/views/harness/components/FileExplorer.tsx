import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  RiFolder3Line,
  RiFolderOpenLine,
  RiFileLine,
  RiArrowRightSLine,
  RiRefreshLine
} from '@remixicon/react'
import type { Window } from '../../../../resource/types/window'
import { useTranslation } from '@renderer/i18n'

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
  /**
   * 请求定位到的（真实绝对）路径：变化即逐级展开目录树并高亮。
   * 由工具卡片（ls）触发——「在资源管理器中查看这个目录」。
   * 带 nonce：同一目录被再次请求时（用户收起树后又点了一次卡片）也要重新展开。
   */
  revealRequest?: { path: string; nonce: number } | null
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
  activeFilePath,
  revealRequest
}) => {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const { t } = useTranslation()
  /** 树的当前快照：定位（revealPath）需要在不触发额外渲染的前提下逐级读取/装载子节点 */
  const rootNodesRef = useRef<TreeNode[]>([])
  rootNodesRef.current = rootNodes

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
      // 修复：此前无 catch,目录被删/权限异常时产生未处理 rejection,界面只有空白
      .catch((err) => {
        console.error('Failed to load workspace root:', err)
        setRootNodes([])
      })
      .finally(() => setLoading(false))
  }, [workspacePath, fetchDir])

  useEffect(() => {
    loadRoot()
  }, [loadRoot])

  /**
   * 定位（工具卡片 ls 点开）：从根出发逐级找到目标目录并展开。
   *
   * 比较路径时统一正斜杠——工作区路径与主进程返回的子路径在 Windows 上都是反斜杠，
   * 但渲染层手里的目标路径来自虚拟路径拼接，两边的分隔符不保证一致。
   * 未装载过的层级就地装载（与 toggleExpand 同一套 fetchDir），最后整体刷新一次。
   */
  useEffect(() => {
    const target = revealRequest?.path
    if (!target) return
    let cancelled = false
    const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

    const run = async (): Promise<void> => {
      const rootNorm = normalize(workspacePath)
      const targetNorm = normalize(target)
      const segments = targetNorm.startsWith(rootNorm)
        ? targetNorm.slice(rootNorm.length).split('/').filter(Boolean)
        : []
      if (segments.length === 0) return

      let nodes = rootNodesRef.current
      let parentNorm = rootNorm
      for (const segment of segments) {
        const wanted = `${parentNorm}/${segment}`
        const node = nodes.find((n) => normalize(n.path) === wanted)
        if (!node || !node.isDirectory) return
        if (!node.loaded) {
          try {
            const entries = await fetchDir(node.path)
            if (cancelled) return
            node.children = entries.map((e) => ({
              ...e,
              children: null,
              expanded: false,
              loaded: false
            }))
            node.loaded = true
          } catch (err) {
            console.warn('Failed to reveal directory:', err)
            return
          }
        }
        node.expanded = true
        parentNorm = normalize(node.path)
        nodes = node.children ?? []
      }
      if (!cancelled) setRootNodes([...rootNodesRef.current])
    }
    void run()
    return () => {
      cancelled = true
    }
    // rootNodes.length 进依赖：面板刚挂载时根目录还在异步加载，定位请求会扑空；
    // 根节点装载完成后（长度变化）自动重跑一次。run 是幂等的（只做展开），不会自激。
  }, [revealRequest, workspacePath, fetchDir, rootNodes.length])

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
          {t('harness.fileExplorer.title')}
        </span>
        <button
          className="flex items-center justify-center w-6 h-6 rounded-md hover:opacity-70 transition-opacity"
          onClick={loadRoot}
          title={t('harness.fileExplorer.refresh')}
          style={{ color: colorTextTertiary }}
        >
          <RiRefreshLine size={14} />
        </button>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto py-1 history-scrollbar">
        {loading ? (
          <p className="text-xs text-center py-6" style={{ color: colorTextTertiary }}>
            {t('harness.fileExplorer.loading')}
          </p>
        ) : rootNodes.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: colorTextTertiary }}>
            {t('harness.fileExplorer.empty')}
          </p>
        ) : (
          rootNodes.map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  )
}

export default FileExplorer
