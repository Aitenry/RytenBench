import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Modal, Empty } from 'antd'
import { Card, Typography, Tag, Space, Masonry, Flex } from 'antd'
import { PushpinOutlined } from '@ant-design/icons'
import { RiQuillPenAiLine } from '@remixicon/react'
import MarkdownView from '@renderer/components/MarkdownView'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import { NoteListItem } from '../../../../../main/database/mapper/note'

const { Title, Text } = Typography

interface NoteItem extends NoteListItem {
  content?: string | null
  isPinned?: boolean
}

const getTagsArray = (tagsStr: string | null): string[] => {
  if (!tagsStr) return []
  try {
    const parsed = JSON.parse(tagsStr)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
}

const ContentCard: React.FC<{ item: NoteItem; onClick?: () => void }> = ({ item, onClick }) => {
  const { token } = theme.useToken()
  const tags = getTagsArray(item.tags)
  const word_count = item.word_count || 0

  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        cursor: 'pointer',
        overflow: 'hidden'
      }}
      styles={{
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          position: 'relative',
          zIndex: 1
        }
      }}
    >
      {item.image && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 0,
            opacity: 0.6
          }}
        >
          <img
            src={item.image}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {item.isPinned && (
        <div
          style={{
            position: 'absolute',
            top: token.paddingSM,
            right: token.paddingSM,
            zIndex: 2,
            backgroundColor: token.colorWarning,
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <PushpinOutlined style={{ fontSize: 12, color: 'white' }} />
        </div>
      )}

      {item.image && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Tag
            color="blue"
            style={{
              position: 'absolute',
              top: token.paddingSM,
              left: token.paddingSM,
              margin: 0,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <RiQuillPenAiLine size={12} />
            笔记
          </Tag>
        </div>
      )}

      <div
        style={{
          padding: token.paddingSM,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          marginTop: '26px',
          zIndex: 1
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Space align="start" style={{ display: 'flex', alignItems: 'center' }} size="small">
              {!item.image && (
                <Tag
                  color="blue"
                  style={{ userSelect: 'none', display: 'flex', alignItems: 'center', margin: 0 }}
                >
                  <RiQuillPenAiLine size={12} />
                  笔记
                </Tag>
              )}
              <Title level={5} style={{ margin: 0, color: token.colorTextHeading, flex: 1 }}>
                {item.title}
              </Title>
            </Space>
          </div>
        </div>

        {item.summary && (
          <Text
            type="secondary"
            style={{
              marginTop: token.marginXS,
              flex: 1,
              fontSize: token.fontSizeSM,
              fontStyle: 'italic'
            }}
          >
            {item.summary}
          </Text>
        )}

        {!item.summary && item.content && (
          <Text
            type="secondary"
            style={{ marginTop: token.marginXS, flex: 1, fontSize: token.fontSizeSM }}
          >
            {item.content.replace(/[#*`[\]]/g, '').substring(0, 200)}
          </Text>
        )}

        {tags.length > 0 && (
          <div
            style={{
              marginTop: token.marginXS,
              display: 'flex',
              flexWrap: 'wrap',
              gap: token.marginXS / 2
            }}
          >
            {tags.slice(0, 3).map((tag, index) => (
              <Tag
                key={index}
                color="processing"
                style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}
              >
                {tag}
              </Tag>
            ))}
            {tags.length > 3 && (
              <Tag color="default" style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
                +{tags.length - 3}
              </Tag>
            )}
          </div>
        )}

        <div
          style={{ display: 'flex', justifyContent: 'space-between', marginTop: token.marginXS }}
        >
          <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
            {new Date(item.updated_at).toLocaleString()}
          </Tag>
          <div style={{ display: 'flex', gap: token.marginXS / 2 }}>
            <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>v{item.version}</Tag>
            {word_count > 0 && (
              <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>{word_count}字</Tag>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

const MainContent: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<NoteItem | null>(null)
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const { viewMessage } = useMessage()

  const loadNotes = useCallback(
    async (pageNum: number = 1, isAppend: boolean = false) => {
      if (isLoading || (!hasMore && isAppend)) return

      try {
        setIsLoading(true)
        const result = await (window as unknown as Window).api.notes.getAll(pageNum, 20)

        if (isAppend) {
          setNotes((prev) => [...prev, ...result.items])
        } else {
          setNotes(result.items)
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
          <Flex vertical gap={16}>
            {notes.length === 0 && !isLoading ? (
              <Empty description="暂无笔记" />
            ) : (
              <>
                <Masonry
                  columns={3}
                  gutter={16}
                  items={notes.map((item, index) => ({
                    key: item.id,
                    column: index % 3,
                    data: item
                  }))}
                  itemRender={(record) => (
                    <ContentCard item={record.data} onClick={() => handleCardClick(record.data)} />
                  )}
                />
                <div ref={loadMoreRef} style={{ height: 20, marginTop: 16 }}>
                  {isLoading && (
                    <div style={{ textAlign: 'center', padding: '16px' }}>加载中...</div>
                  )}
                  {!hasMore && notes.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '16px', color: '#999' }}>
                      没有更多了
                    </div>
                  )}
                </div>
              </>
            )}
          </Flex>
        </div>
      </div>

      <Modal
        title={currentItem?.title || '笔记预览'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        width="calc(100vw - 137px)"
        centered={true}
        maskClosable={false}
        className="custom-container-scrollbar"
        styles={{ body: { height: 'calc(100vh - 205px)', overflow: 'auto' } }}
        footer={null}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {currentItem?.content ? (
              <MarkdownView content={currentItem.content} />
            ) : (
              <Empty description="暂无内容" />
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

export default MainContent
