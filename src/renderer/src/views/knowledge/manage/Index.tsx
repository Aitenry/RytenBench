import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Button, Empty, Space, Flex } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import WikiEditModal from '@renderer/components/wiki/WikiEditModal'
import WikiDetail from '@renderer/components/wiki/WikiDocumentModal'
import { Window } from '../../../../resource/types/window'
import WikiCard from './components/WikiCard'
import type { WikiRow } from '@renderer/types/models'

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG, colorBorder }
  } = theme.useToken()

  const [wikis, setWikis] = useState<WikiRow[]>([])
  const [selectedWiki, setSelectedWiki] = useState<WikiRow | null>(null)

  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<WikiRow | null>(null)
  const [isNew, setIsNew] = useState(false)

  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false)
  const hasMoreRef = useRef(true)

  const { viewMessage } = useMessage()

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
      }
      setHasMore(result.hasMore)
      hasMoreRef.current = result.hasMore
      setPage(pageNum)
    } catch (error) {
      console.error('Failed to load wikis:', error)
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWikis(1, false).then()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && hasMoreRef.current && !isLoadingRef.current) {
          loadWikis(page + 1, true).then()
        }
      },
      { threshold: 0.1 }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasMore, isLoading, page, loadWikis])

  const handleSelectWiki = (wiki: WikiRow): void => {
    setSelectedWiki(wiki)
  }

  const handleCreateWiki = (): void => {
    setCurrentItem(null)
    setIsNew(true)
    setEditTitle('新知识库')
    setEditSummary('')
    setEditImage(null)
    setIsWikiModalOpen(true)
  }

  const handleEditWiki = (wiki: WikiRow): void => {
    setCurrentItem(wiki)
    setIsNew(false)
    setEditTitle(wiki.title)
    setEditSummary(wiki.summary || '')
    setEditImage(wiki.image)
    setIsWikiModalOpen(true)
  }

  const handleDeleteWiki = async (id: number): Promise<void> => {
    const messageKey = 'wiki-delete'
    try {
      viewMessage(messageKey, 'loading', '正在删除知识库...')
      await (window as unknown as Window).api.wikis.delete(id)
      viewMessage(messageKey, 'success', '知识库删除成功！', 2)
      setPage(1)
      setHasMore(true)
      setSelectedWiki(null)
      await loadWikis(1, false)
    } catch (error) {
      console.error('Failed to delete wiki:', error)
      viewMessage(messageKey, 'error', '删除知识库失败')
    }
  }

  const handleSaveWiki = async (data: {
    title: string
    summary: string | null
    image: string | null
  }): Promise<void> => {
    const messageKey = isNew ? 'wiki-create' : 'wiki-update'
    try {
      if (isNew) {
        viewMessage(messageKey, 'loading', '正在创建知识库...')
        await (window as unknown as Window).api.wikis.add({
          title: data.title,
          summary: data.summary,
          image: data.image
        })
        viewMessage(messageKey, 'success', '知识库创建成功！', 2)
      } else if (currentItem) {
        viewMessage(messageKey, 'loading', '正在保存知识库...')
        await (window as unknown as Window).api.wikis.update(currentItem.id, {
          title: data.title,
          summary: data.summary,
          image: data.image
        })
        viewMessage(messageKey, 'success', '知识库保存成功！', 2)
        if (selectedWiki?.id === currentItem.id) {
          const updated = await (window as unknown as Window).api.wikis.getById(currentItem.id)
          if (updated) setSelectedWiki(updated)
        }
      }
      setIsWikiModalOpen(false)
      setPage(1)
      setHasMore(true)
      await loadWikis(1, false)
    } catch (error) {
      console.error('Failed to save wiki:', error)
      viewMessage(messageKey, 'error', '保存知识库失败')
    }
  }

  return (
    <div className="h-full flex-1 flex flex-row gap-2.5">
      {!selectedWiki ? (
        <main
          className="w-full flex flex-col"
          style={{
            background: colorBgContainer,
            borderRadius: borderRadiusLG
          }}
        >
          <div
            style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'end',
              borderBottom: `1px solid ${colorBorder}`
            }}
          >
            <Flex justify="space-between" align="center">
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateWiki}>
                  新建知识库
                </Button>
              </Space>
            </Flex>
          </div>

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
                    <Empty
                      description="暂无知识库，点击新建知识库开始"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    >
                      <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateWiki}>
                        新建知识库
                      </Button>
                    </Empty>
                  </Flex>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-4">
                      {wikis.map((item) => (
                        <div key={item.id} className="h-[220px] min-w-0 overflow-hidden">
                          <WikiCard
                            item={item}
                            onSelect={() => handleSelectWiki(item)}
                            onEdit={() => handleEditWiki(item)}
                            onDelete={() => handleDeleteWiki(item.id)}
                          />
                        </div>
                      ))}
                    </div>
                    <div ref={loadMoreRef} className="h-5 mt-4">
                      {isLoading && <div className="text-center p-4">加载中...</div>}
                    </div>
                  </>
                )}
              </Flex>
            </div>
          </div>
        </main>
      ) : (
        <WikiDetail
          wiki={selectedWiki}
          onBack={() => setSelectedWiki(null)}
          onEditWiki={handleEditWiki}
        />
      )}

      <WikiEditModal
        open={isWikiModalOpen}
        isNew={isNew}
        initialTitle={editTitle}
        initialSummary={editSummary}
        initialImage={editImage}
        onSave={handleSaveWiki}
        onCancel={() => setIsWikiModalOpen(false)}
      />
    </div>
  )
}

export default Index
