import React, { useState, useCallback, useEffect } from 'react'
import { theme, Modal, Button, Empty, Flex, Typography, Spin, Space, Input } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { RiBook2Line } from '@remixicon/react'
import DocumentCard from '@renderer/components/document/DocumentCard'
import DocumentPreviewModal from '@renderer/components/document/DocumentPreviewModal'
import WikiArchiveModal from '@renderer/components/wiki/WikiArchiveModal'
import DirectoryTree from '@renderer/views/knowledge/manage/components/DirectoryTree'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../resource/types/window'
import type { WikiRow, WikiDirectoryRow, DirectoryDocWithDetail } from '@renderer/types/models'
import type { DirectoryWithChildren } from '@renderer/types/knowledge'

const { Title, Text } = Typography

export interface WikiDetailProps {
  wiki: WikiRow
  onBack: () => void
  onEditWiki?: (wiki: WikiRow) => void
  showBackButton?: boolean
}

const WikiDetail: React.FC<WikiDetailProps> = ({ wiki, onBack, onEditWiki, showBackButton = true }) => {
  const { token } = theme.useToken()
  const { colorBgContainer, borderRadiusLG, colorBorder } = token
  const { viewMessage } = useMessage()

  /* ── directory state ── */
  const [directories, setDirectories] = useState<WikiDirectoryRow[]>([])
  const [directoryTree, setDirectoryTree] = useState<DirectoryWithChildren[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [selectedDirectory, setSelectedDirectory] = useState<WikiDirectoryRow | null>(null)
  const [directoryDocs, setDirectoryDocs] = useState<DirectoryDocWithDetail[]>([])
  const [directoryDocsLoading, setDirectoryDocsLoading] = useState(false)

  /* ── directory edit modal state ── */
  const [directoryModalOpen, setDirectoryModalOpen] = useState(false)
  const [isNewDirectory, setIsNewDirectory] = useState(false)
  const [editDirectoryName, setEditDirectoryName] = useState('')
  const [creatingSubDirectoryFor, setCreatingSubDirectoryFor] = useState<number | null>(null)
  const [currentDirectoryItem, setCurrentDirectoryItem] = useState<WikiDirectoryRow | null>(null)

  /* ── archive modal state ── */
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)

  /* ── preview modal state ── */
  const [previewDoc, setPreviewDoc] = useState<DirectoryDocWithDetail | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  /* ── utility: build tree ── */

  const buildTree = useCallback((dirs: WikiDirectoryRow[]): DirectoryWithChildren[] => {
    const map = new Map<number, DirectoryWithChildren>()
    const roots: DirectoryWithChildren[] = []
    dirs.forEach((dir) => map.set(dir.id, { ...dir, children: [] }))
    dirs.forEach((dir) => {
      const node = map.get(dir.id)!
      if (dir.parent_id === null) {
        roots.push(node)
      } else {
        const parent = map.get(dir.parent_id)
        if (parent) parent.children!.push(node)
      }
    })
    return roots
  }, [])

  const getAllIds = useCallback((nodes: DirectoryWithChildren[]): React.Key[] => {
    let ids: React.Key[] = []
    nodes.forEach((node) => {
      ids.push(node.id)
      if (node.children && node.children.length > 0) {
        ids = ids.concat(getAllIds(node.children))
      }
    })
    return ids
  }, [])

  /* ── load directories ── */

  const loadDirectories = useCallback(async () => {
    try {
      const dirs = await (window as unknown as Window).api.wikis.getDirectories(wiki.id)
      const tree = buildTree(dirs)
      setDirectories(dirs)
      setDirectoryTree(tree)
      setExpandedKeys(getAllIds(tree))
    } catch (error) {
      console.error('Failed to load directories:', error)
    }
  }, [wiki.id, buildTree, getAllIds])

  const loadDirectoryDocs = useCallback(async (directoryId: number) => {
    setDirectoryDocsLoading(true)
    try {
      const noteIds = await (window as unknown as Window).api.wikis.getNotesByDirectory(directoryId)
      const docs: DirectoryDocWithDetail[] = []
      for (const { doc_id } of noteIds) {
        const doc = await (window as unknown as Window).api.docs.getById(doc_id)
        if (doc) docs.push({ ...doc, directory_id: directoryId })
      }
      setDirectoryDocs(docs)
    } catch (error) {
      console.error('Failed to load directory docs:', error)
    } finally {
      setDirectoryDocsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDirectories()
  }, [loadDirectories])

  /* ── directory handlers ── */

  const handleSelectDirectory = useCallback((selectedKeys: React.Key[]): void => {
    if (selectedKeys.length > 0) {
      const dirId = selectedKeys[0] as number
      const dir = directories.find((d) => d.id === dirId)
      if (dir) {
        setSelectedDirectory(dir)
        setDirectoryDocs([])
        loadDirectoryDocs(dir.id)
      }
    }
  }, [directories, loadDirectoryDocs])

  const handleCreateDirectory = useCallback((parentId: number | null = null): void => {
    setCurrentDirectoryItem(null)
    setIsNewDirectory(true)
    setEditDirectoryName('新目录')
    setCreatingSubDirectoryFor(parentId)
    setDirectoryModalOpen(true)
  }, [])

  const handleEditDirectory = useCallback((dir: WikiDirectoryRow): void => {
    setCurrentDirectoryItem(dir)
    setIsNewDirectory(false)
    setEditDirectoryName(dir.name)
    setDirectoryModalOpen(true)
  }, [])

  const handleSaveDirectory = useCallback(async (): Promise<void> => {
    const messageKey = 'directory-save'
    try {
      if (isNewDirectory) {
        viewMessage(messageKey, 'loading', '正在创建目录...')
        const parentDir = creatingSubDirectoryFor
          ? directories.find((d) => d.id === creatingSubDirectoryFor)
          : null
        await (window as unknown as Window).api.wikis.addDirectory({
          wiki_id: wiki.id,
          parent_id: creatingSubDirectoryFor ?? null,
          name: editDirectoryName,
          sort_order: 0,
          level: parentDir ? parentDir.level + 1 : 0
        })
        viewMessage(messageKey, 'success', '目录创建成功！', 2)
      } else if (currentDirectoryItem) {
        viewMessage(messageKey, 'loading', '正在保存目录...')
        await (window as unknown as Window).api.wikis.updateDirectory(currentDirectoryItem.id, {
          name: editDirectoryName
        })
        viewMessage(messageKey, 'success', '目录保存成功！', 2)
      }
      setDirectoryModalOpen(false)
      setCreatingSubDirectoryFor(null)
      await loadDirectories()
    } catch (error) {
      console.error('Failed to save directory:', error)
      viewMessage(messageKey, 'error', '保存目录失败')
    }
  }, [wiki.id, isNewDirectory, creatingSubDirectoryFor, directories, currentDirectoryItem, editDirectoryName, viewMessage, loadDirectories])

  const handleDeleteDirectory = useCallback(async (dir: WikiDirectoryRow): Promise<void> => {
    const messageKey = 'directory-delete'
    try {
      viewMessage(messageKey, 'loading', '正在删除目录...')
      await (window as unknown as Window).api.wikis.deleteDirectory(dir.id)
      viewMessage(messageKey, 'success', '目录删除成功！', 2)
      setSelectedDirectory(null)
      setDirectoryDocs([])
      await loadDirectories()
    } catch (error) {
      console.error('Failed to delete directory:', error)
      viewMessage(messageKey, 'error', '删除目录失败')
    }
  }, [viewMessage, loadDirectories])

  /* ── archive handlers ── */

  const handleOpenArchiveModal = useCallback((): void => {
    setArchiveModalOpen(true)
  }, [])

  const handleArchiveDocs = useCallback(async (docIds: number[]): Promise<void> => {
    if (!selectedDirectory) return
    const messageKey = 'archive-docs'
    try {
      viewMessage(messageKey, 'loading', '正在归档文档...')
      for (const docId of docIds) {
        await (window as unknown as Window).api.wikis.addNoteToDirectory(selectedDirectory.id, docId)
      }
      viewMessage(messageKey, 'success', '文档归档成功！', 2)
      setArchiveModalOpen(false)
      await loadDirectoryDocs(selectedDirectory.id)
    } catch (error) {
      console.error('Failed to archive docs:', error)
      viewMessage(messageKey, 'error', '归档文档失败')
    }
  }, [selectedDirectory, viewMessage, loadDirectoryDocs])

  /* ── remove doc handler ── */

  const handleRemoveDocFromDirectory = useCallback(async (docId: number): Promise<void> => {
    if (!selectedDirectory) return
    const messageKey = 'remove-doc'
    try {
      viewMessage(messageKey, 'loading', '正在移除文档...')
      await (window as unknown as Window).api.wikis.removeNoteFromDirectory(selectedDirectory.id, docId)
      viewMessage(messageKey, 'success', '文档移除成功！', 2)
      await loadDirectoryDocs(selectedDirectory.id)
    } catch (error) {
      console.error('Failed to remove doc:', error)
      viewMessage(messageKey, 'error', '移除文档失败')
    }
  }, [selectedDirectory, viewMessage, loadDirectoryDocs])

  /* ── preview handler ── */

  const handlePreviewDoc = useCallback(async (doc: DirectoryDocWithDetail): Promise<void> => {
    const messageKey = 'doc-preview-load'
    try {
      viewMessage(messageKey, 'loading', '正在加载文档内容...')
      const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
      if (fullDoc) {
        setPreviewDoc({ ...doc, content: fullDoc.content })
        setPreviewOpen(true)
        viewMessage(messageKey, 'success', '文档内容加载成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '文档不存在')
      }
    } catch (error) {
      console.error('Failed to load doc content:', error)
      viewMessage(messageKey, 'error', '加载文档内容失败')
    }
  }, [viewMessage])

  /* ── edit wiki handler ── */

  const handleEditWikiClick = useCallback((): void => {
    onEditWiki?.(wiki)
  }, [wiki, onEditWiki])

  /* ── render ── */

  return (
    <>
      <aside
        style={{
          width: 300,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          padding: 16,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Flex justify="space-between" align="center">
            <Space>
              <RiBook2Line />
              <Title level={5} style={{ margin: 0 }}>
                {wiki.title}
              </Title>
            </Space>
            <Space>
              <EditOutlined onClick={handleEditWikiClick} />
            </Space>
          </Flex>
          {wiki.summary && (
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
              {wiki.summary}
            </Text>
          )}
        </div>

        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Text strong>目录</Text>
          <Button type="text" icon={<PlusOutlined />} onClick={() => handleCreateDirectory()}>
            新建
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {directoryTree.length === 0 ? (
            <Empty description="暂无目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <DirectoryTree
              directoryTree={directoryTree}
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              onSelect={handleSelectDirectory}
              selectedKeys={selectedDirectory ? [selectedDirectory.id] : []}
              onCreateDirectory={(parentId) => handleCreateDirectory(parentId)}
              onEditDirectory={handleEditDirectory}
              onDeleteDirectory={handleDeleteDirectory}
            />
          )}
        </div>

        {showBackButton && (
          <Button style={{ marginTop: 8 }} onClick={onBack}>
            返回知识库列表
          </Button>
        )}
      </aside>

      <main
        className="flex-1 flex flex-col min-w-0"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <div
          className="p-4 flex items-center justify-between"
          style={{
            borderBottom: `1px solid ${colorBorder}`
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            {selectedDirectory ? selectedDirectory.name : '请选择目录'}
          </Title>
          {selectedDirectory && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenArchiveModal}>
              归档文档
            </Button>
          )}
        </div>

        <div className="p-3 flex-1 overflow-y-auto overflow-x-hidden min-w-0">
          {!selectedDirectory ? (
            <div className="h-full flex items-center justify-center">
              <Empty description="请从左侧选择一个目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : directoryDocsLoading ? (
            <div className="h-full flex items-center justify-center">
              <Spin size="large" />
            </div>
          ) : directoryDocs.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Empty description="目录中暂无文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {directoryDocs.map((item) => (
                <div key={item.id} className="h-[220px] min-w-0 overflow-hidden">
                  <DocumentCard
                    item={item}
                    onClick={() => handlePreviewDoc(item)}
                    actions={[
                      <DeleteOutlined
                        key="remove"
                        onClick={(e) => {
                          e.stopPropagation()
                          Modal.confirm({
                            title: '确定要从目录中移除这篇文档吗？',
                            onOk: () => handleRemoveDocFromDirectory(item.id),
                            okText: '确定',
                            cancelText: '取消'
                          })
                        }}
                      />
                    ]}
                    showContentPreview={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Directory Edit Modal */}
      <Modal
        title={isNewDirectory ? '新建目录' : '编辑目录'}
        open={directoryModalOpen}
        onOk={handleSaveDirectory}
        onCancel={() => setDirectoryModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Input
          placeholder="目录名称"
          value={editDirectoryName}
          onChange={(e) => setEditDirectoryName(e.target.value)}
        />
      </Modal>

      {/* Wiki Archive Modal */}
      <WikiArchiveModal
        open={archiveModalOpen}
        wikiId={wiki.id}
        onArchive={handleArchiveDocs}
        onCancel={() => setArchiveModalOpen(false)}
      />

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        currentDoc={previewDoc}
      />
    </>
  )
}

export default WikiDetail
