import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Empty } from 'antd'
import { Masonry, Flex } from 'antd'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import NoteCard from '@renderer/components/NoteCard'
import NotePreviewModal from '@renderer/components/NotePreviewModal'

interface NoteItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  version: number
  created_at: string
  updated_at: string
  word_count: number
  content?: string | null
  isPinned?: boolean
}

const MainContent: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<NoteItem | null>(null)
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [masonryKey, setMasonryKey] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const { viewMessage } = useMessage()

  const loadNotes = useCallback(
    async (pageNum: number = 1, isAppend: boolean = false) => {
      if (isLoading || (!hasMore && isAppend)) return

      try {
        setIsLoading(true)
        const result = await (window as unknown as Window).api.notes.getAll(pageNum, 10)

        if (isAppend) {
          setNotes((prev) => [...prev, ...result.items])
        } else {
          setNotes(result.items)
          setMasonryKey((prev) => prev + 1)
        }

        setHasMore(result.hasMore)
        setPage(pageNum)
      } catch (error) {
        console.error('Failed to load notes:', error)
        viewMessage('notes-load-error', 'error', '加载笔记失败')
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, hasMore, viewMessage]
  )

  useEffect(() => {
    loadNotes(1, false).then()
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && hasMore && !isLoading) {
          loadNotes(page + 1, true).then()
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
  }, [hasMore, isLoading, page, loadNotes])

  const handleCardClick = async (item: NoteItem): Promise<void> => {
    const messageKey = 'note-preview-load'
    try {
      viewMessage(messageKey, 'loading', '正在加载笔记内容...')
      const fullNote = await (window as unknown as Window).api.notes.getById(item.id)
      if (fullNote) {
        setCurrentItem({ ...item, content: fullNote.content })
        setIsModalOpen(true)
        viewMessage(messageKey, 'success', '笔记内容加载成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '笔记不存在')
      }
    } catch (error) {
      console.error('Failed to load note content:', error)
      viewMessage(messageKey, 'error', '加载笔记内容失败')
    }
  }

  return (
    <>
      <div style={{ padding: '12px 6px' }}>
        <div
          className="overflow-x-hidden overflow-y-auto custom-scrollbar"
          style={{
            height: 'calc(100vh - 44px)',
            maxHeight: 'calc(100vh - 44px)',
            padding: '0 6px'
          }}
        >
          <Flex vertical gap={16} style={{ height: '100%' }}>
            {notes.length === 0 && !isLoading ? (
              <Flex flex={1} justify="center" align="center">
                <Empty description="暂无笔记" />
              </Flex>
            ) : (
              <>
                <Masonry
                  key={masonryKey}
                  columns={3}
                  gutter={16}
                  items={notes.map((item) => ({
                    key: item.id,
                    data: item
                  }))}
                  itemRender={(record) => (
                    <NoteCard item={record.data} onClick={() => handleCardClick(record.data)} />
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

      <NotePreviewModal
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        currentNote={currentItem}
      />
    </>
  )
}

export default MainContent
