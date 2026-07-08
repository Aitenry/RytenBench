import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Empty, Modal, Flex, Typography, Masonry, Tree, List, Spin } from 'antd'
import { FolderOutlined, FileTextOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { RiBook2Line } from '@remixicon/react'
import { Window } from '../../../../resource/types/window'
import WikiCard from '@renderer/views/knowledge/manage/components/WikiCard'
import MarkdownView from '@renderer/components/MarkdownView'
import { useTheme } from '@renderer/contexts/useTheme'

interface WikiRow {
  id: number
  title: string
  summary: string | null
  image: string | null
  created_at: string
  updated_at: string
  doc_count: number
  tags: string | null
}

interface WikiDirectoryRow {
  id: number
  wiki_id: number
  parent_id: number | null
  name: string
  sort_order: number
  level: number
  created_at: string
  updated_at: string
}

interface DocListItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  created_at: string
  updated_at: string
  word_count: number
}

interface DirectoryDocWithDetail extends DocListItem {
  directory_id: number
  content?: string | null
}

interface TreeNode {
  key: number
  title: string
  children: TreeNode[]
}

const { Title, Text } = Typography

const MainContent: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG, colorBorderSecondary }
  } = theme.useToken()
  const { effectiveTheme } = useTheme()

  const [wikis, setWikis] = useState<WikiRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [wikiMasonryKey, setWikiMasonryKey] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const pageRef = useRef(1)

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [selectedWiki, setSelectedWiki] = useState<WikiRow | null>(null)
  const [directories, setDirectories] = useState<WikiDirectoryRow[]>([])
  const [directoryTree, setDirectoryTree] = useState<TreeNode[]>([])
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [selectedDirectory, setSelectedDirectory] = useState<WikiDirectoryRow | null>(null)
  const [directoryDocs, setDirectoryDocs] = useState<DirectoryDocWithDetail[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<DirectoryDocWithDetail | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const buildTree = useCallback((dirs: WikiDirectoryRow[]): TreeNode[] => {
    const map = new Map<number, TreeNode>()
    const roots: TreeNode[] = []

    dirs.forEach((dir) => {
      map.set(dir.id, { key: dir.id, title: dir.name, children: [] })
    })

    dirs.forEach((dir) => {
      const node = map.get(dir.id)!
      if (dir.parent_id === null) {
        roots.push(node)
      } else {
        const parent = map.get(dir.parent_id)
        if (parent) {
          parent.children.push(node)
        }
      }
    })

    return roots
  }, [])

  const getAllKeys = (nodes: TreeNode[]): React.Key[] => {
    let keys: React.Key[] = []
    nodes.forEach((node) => {
      keys.push(node.key)
      if (node.children.length > 0) {
        keys = keys.concat(getAllKeys(node.children))
      }
    })
    return keys
  }

  const loadWikis = useCallback(async (pageNum: number = 1, isAppend: boolean = false) => {
    if (isLoadingRef.current || (!hasMoreRef.current && isAppend)) return

    try {
      isLoadingRef.current = true
      setIsLoading(true)
      const result = await (window as unknown as Window).api.wikis.getAll(pageNum, 10)

      if (isAppend) {
        setWikis((prev) => [...prev, ...result.items])
      } else {
        setWikis(result.items)
        setWikiMasonryKey((prev) => prev + 1)
      }

      hasMoreRef.current = result.hasMore
      pageRef.current = pageNum
    } catch (error) {
      console.error('Failed to load wikis:', error)
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWikis(1, false)
  }, [])

  useEffect(() => {
    const currentRef = loadMoreRef.current
    if (!currentRef) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          loadWikis(pageRef.current + 1, true)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(currentRef)

    return () => {
      observer.disconnect()
    }
  }, [loadWikis])

  const handleOpenPreview = async (wiki: WikiRow): Promise<void> => {
    setSelectedWiki(wiki)
    setSelectedDirectory(null)
    setDirectoryDocs([])
    setPreviewDoc(null)
    setIsPreviewOpen(true)

    try {
      const dirs = await (window as unknown as Window).api.wikis.getDirectories(wiki.id)
      const tree = buildTree(dirs)
      setDirectories(dirs)
      setDirectoryTree(tree)
      setExpandedKeys(getAllKeys(tree))
    } catch (error) {
      console.error('Failed to load directories:', error)
    }
  }

  const handleSelectDirectory = async (selectedKeys: React.Key[]): Promise<void> => {
    if (selectedKeys.length === 0) return
    const dirId = selectedKeys[0] as number
    const dir = directories.find((d) => d.id === dirId)
    if (!dir) return

    setSelectedDirectory(dir)
    setPreviewDoc(null)
    setDocsLoading(true)

    try {
      const noteIds = await (window as unknown as Window).api.wikis.getNotesByDirectory(dirId)
      const docs: DirectoryDocWithDetail[] = []
      for (const { doc_id } of noteIds) {
        const doc = await (window as unknown as Window).api.docs.getById(doc_id)
        if (doc) {
          docs.push({ ...doc, directory_id: dirId })
        }
      }
      setDirectoryDocs(docs)
    } catch (error) {
      console.error('Failed to load directory docs:', error)
    } finally {
      setDocsLoading(false)
    }
  }

  const handleSelectDoc = async (doc: DirectoryDocWithDetail): Promise<void> => {
    setPreviewLoading(true)
    try {
      const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
      if (fullDoc) {
        setPreviewDoc({ ...doc, content: fullDoc.content })
      }
    } catch (error) {
      console.error('Failed to load doc content:', error)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="h-full flex-1 flex flex-row gap-2.5">
      <main
        className="w-full flex flex-col"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <div style={{ padding: '12px 6px', flex: 1, overflow: 'hidden' }}>
          <div
            className="overflow-x-hidden overflow-y-auto custom-scrollbar"
            style={{
              height: '100%',
              padding: '0 6px'
            }}
          >
            <Flex vertical gap={16} style={{ height: '100%' }}>
              {wikis.length === 0 && !isLoading ? (
                <Flex flex={1} justify="center" align="center">
                  <Empty description="暂无知识库" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </Flex>
              ) : (
                <>
                  <Masonry
                    key={wikiMasonryKey}
                    columns={3}
                    gutter={16}
                    items={wikis.map((item) => ({
                      key: item.id,
                      data: item
                    }))}
                    itemRender={(record) => (
                      <WikiCard
                        item={record.data}
                        onSelect={() => handleOpenPreview(record.data)}
                      />
                    )}
                  />
                  <div ref={loadMoreRef} style={{ height: 20, marginTop: 16 }}>
                    {isLoading && (
                      <div style={{ textAlign: 'center', padding: '16px' }}>加载中...</div>
                    )}
                  </div>
                </>
              )}
            </Flex>
          </div>
        </div>
      </main>

      <Modal
        title={
          selectedWiki ? (
            <Flex align="center" gap={8}>
              <RiBook2Line />
              <span>{selectedWiki.title}</span>
            </Flex>
          ) : (
            '知识库预览'
          )
        }
        open={isPreviewOpen}
        onCancel={() => setIsPreviewOpen(false)}
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
        <div
          style={{
            width: 320,
            borderRight: '1px solid transparent',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${colorBorderSecondary}`,
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
                <List
                  dataSource={directoryDocs}
                  renderItem={(doc) => (
                    <List.Item
                      onClick={() => handleSelectDoc(doc)}
                      style={{
                        cursor: 'pointer',
                        padding: '8px 16px',
                        background:
                          previewDoc?.id === doc.id ? 'rgba(22, 119, 255, 0.08)' : undefined
                      }}
                    >
                      <Flex align="center" gap={8} style={{ width: '100%' }}>
                        <FileTextOutlined />
                        <Text ellipsis style={{ flex: 1 }}>
                          {doc.title}
                        </Text>
                      </Flex>
                    </List.Item>
                  )}
                />
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
                icon={<FolderOutlined />}
              />
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {previewLoading ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <Spin />
            </div>
          ) : previewDoc ? (
            <div>
              <Title level={4}>{previewDoc.title}</Title>
              {previewDoc.summary && (
                <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
                  {previewDoc.summary}
                </Text>
              )}
              <div style={{ marginTop: 16 }}>
                <MarkdownView
                  content={previewDoc.content || ''}
                  isDarkMode={effectiveTheme === 'dark'}
                />
              </div>
            </div>
          ) : (
            <Flex flex={1} justify="center" align="center" style={{ height: '100%' }}>
              <Text type="secondary">选择左侧文档进行预览</Text>
            </Flex>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default MainContent
