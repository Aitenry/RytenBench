import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Flex, Typography, Tree, Spin } from 'antd'
import { FolderOutlined, FileTextOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { RiBook2Line } from '@remixicon/react'
import { Window } from '../../../resource/types/window'
import MarkdownView from '@renderer/components/markdown/MarkdownView'
import { useTheme } from '@renderer/contexts/useTheme'
import type { WikiDirectoryRow, DirectoryDocWithDetail, TreeNode } from '@renderer/types/models'
import type { WikiPreviewModalProps } from '@renderer/types/components'

const { Title, Text } = Typography

/* ── helpers (outside component to avoid stale references) ── */

const getAllKeys = (nodes: TreeNode[]): React.Key[] => {
  let keys: React.Key[] = []
  nodes.forEach((node) => {
    keys.push(node.key)
    if (node.children.length > 0) keys = keys.concat(getAllKeys(node.children))
  })
  return keys
}

/* ── component ── */

const WikiPreviewModal: React.FC<WikiPreviewModalProps> = ({ wiki, open, onClose }) => {
  const { effectiveTheme } = useTheme()
  const isDark = effectiveTheme === 'dark'

  /* ── state ── */
  const [directories, setDirectories] = useState<WikiDirectoryRow[]>([])
  const [directoryTree, setDirectoryTree] = useState<TreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [selectedDirectory, setSelectedDirectory] = useState<WikiDirectoryRow | null>(null)
  const [directoryDocs, setDirectoryDocs] = useState<DirectoryDocWithDetail[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<DirectoryDocWithDetail | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  /* ── helpers ── */

  const buildTree = useCallback((dirs: WikiDirectoryRow[]): TreeNode[] => {
    const map = new Map<number, TreeNode>()
    const roots: TreeNode[] = []
    dirs.forEach((dir) => map.set(dir.id, { key: dir.id, title: dir.name, children: [] }))
    dirs.forEach((dir) => {
      const node = map.get(dir.id)!
      if (dir.parent_id === null) roots.push(node)
      else map.get(dir.parent_id)?.children.push(node)
    })
    return roots
  }, [])

  /* ── load directories when wiki changes ── */

  useEffect(() => {
    if (!wiki || !open) return
    setSelectedDirectory(null)
    setDirectoryDocs([])
    setPreviewDoc(null)
    ;(async () => {
      try {
        const dirs = await (window as unknown as Window).api.wikis.getDirectories(wiki.id)
        const tree = buildTree(dirs)
        setDirectories(dirs)
        setDirectoryTree(tree)
        setExpandedKeys(getAllKeys(tree))
      } catch (error) {
        console.error('Failed to load directories:', error)
      }
    })()
  }, [wiki, open, buildTree])

  /* ── handlers ── */

  const handleSelectDirectory = useCallback(
    async (selectedKeys: React.Key[]): Promise<void> => {
      if (selectedKeys.length === 0) return
      const dirId = selectedKeys[0] as number
      const dir = directories.find((d) => d.id === dirId)
      if (!dir) return
      setSelectedDirectory(dir)
      setPreviewDoc(null)
      setDocsLoading(true)
      try {
        const noteIds = await (window as unknown as Window).api.wikis.getNotesByDirectory(dirId)
        const docsList: DirectoryDocWithDetail[] = []
        for (const { doc_id } of noteIds) {
          const doc = await (window as unknown as Window).api.docs.getById(doc_id)
          if (doc) docsList.push({ ...doc, directory_id: dirId })
        }
        setDirectoryDocs(docsList)
      } catch (error) {
        console.error('Failed to load directory docs:', error)
      } finally {
        setDocsLoading(false)
      }
    },
    [directories]
  )

  const handleSelectDoc = useCallback(async (doc: DirectoryDocWithDetail): Promise<void> => {
    setPreviewLoading(true)
    try {
      const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
      if (fullDoc) setPreviewDoc({ ...doc, content: fullDoc.content })
    } catch (error) {
      console.error('Failed to load doc content:', error)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  /* ── render ── */

  return (
    <Modal
      title={
        wiki ? (
          <Flex align="center" gap={8}>
            <RiBook2Line />
            <span>{wiki.title}</span>
          </Flex>
        ) : (
          '知识库预览'
        )
      }
      open={open}
      onCancel={onClose}
      width="100vw"
      centered
      footer={null}
      styles={{
        body: {
          height: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'row',
          gap: 0,
          padding: 0
        }
      }}
    >
      {/* Sidebar: directory tree */}
      <div
        style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {selectedDirectory ? (
            <>
              <ArrowLeftOutlined
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedDirectory(null)
                  setDirectoryDocs([])
                  setPreviewDoc(null)
                }}
              />
              <Text strong>{selectedDirectory.name}</Text>
            </>
          ) : (
            <Text strong>目录</Text>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {selectedDirectory ? (
            docsLoading ? (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <Spin />
              </div>
            ) : directoryDocs.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center' }}>
                <Text type="secondary">暂无文档</Text>
              </div>
            ) : (
              <div>
                {directoryDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDoc(doc)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 16px',
                      background: previewDoc?.id === doc.id ? 'rgba(22, 119, 255, 0.08)' : undefined
                    }}
                  >
                    <Flex align="center" gap={8} style={{ width: '100%' }}>
                      <FileTextOutlined />
                      <span className="truncate" style={{ flex: 1 }}>
                        {doc.title}
                      </span>
                    </Flex>
                  </div>
                ))}
              </div>
            )
          ) : directoryTree.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <Text type="secondary">暂无目录</Text>
            </div>
          ) : (
            <Tree
              showIcon
              defaultExpandAll
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              onSelect={handleSelectDirectory}
              selectedKeys={[]}
              treeData={directoryTree}
              style={{ padding: '10px 0' }}
              icon={<FolderOutlined />}
            />
          )}
        </div>
      </div>

      {/* Preview pane */}
      <div style={{ flex: 1, overflow: 'hidden', padding: '10px 16px', height: '100%' }}>
        {previewLoading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%'
            }}
          >
            <Spin />
          </div>
        ) : previewDoc ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Title level={4}>{previewDoc.title}</Title>
            {previewDoc.summary && (
              <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
                {previewDoc.summary}
              </Text>
            )}
            <div style={{ marginTop: 16, flex: 1, minHeight: 0 }}>
              <MarkdownView content={previewDoc.content || ''} isDarkMode={isDark} />
            </div>
          </div>
        ) : (
          <Flex flex={1} justify="center" align="center" style={{ height: '100%' }}>
            <Text type="secondary">选择左侧文档进行预览</Text>
          </Flex>
        )}
      </div>
    </Modal>
  )
}

export default WikiPreviewModal
