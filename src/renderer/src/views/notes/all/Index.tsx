import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Modal, Button, Input, Popconfirm, Empty, Tag as AntTag } from 'antd'
import { Card, Typography, Tag, Space, Masonry, Flex } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import { RiQuillPenAiLine } from '@remixicon/react'
import MarkdownEditor from '@renderer/components/MarkdownEditor'
import MarkdownView from '@renderer/components/MarkdownView'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import { NoteListItem } from '../../../../../main/database/mapper/note'

const { Title, Text } = Typography
const { Search } = Input

interface NoteItem extends NoteListItem {
  content?: string | null
}

const NoteCard: React.FC<{
  item: NoteItem
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
}> = ({ item, onPreview, onEdit, onDelete }) => {
  const { token } = theme.useToken()

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

  const tags = getTagsArray(item.tags)
  const word_count = item.word_count || (item.content ? item.content.replace(/\s/g, '').length : 0)

  return (
    <Card
      size="small"
      hoverable
      onClick={onPreview}
      style={{
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        minHeight: 180,
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
      actions={[
        <EditOutlined
          key="edit"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        />,
        <Popconfirm
          key="delete"
          title="确定要删除这篇笔记吗？"
          onConfirm={(e) => {
            e?.stopPropagation()
            onDelete()
          }}
          okText="确定"
          cancelText="取消"
        >
          <DeleteOutlined onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      ]}
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
            opacity: 0.3
          }}
        >
          <img
            src={item.image}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{ padding: token.paddingSM, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space align="start" style={{ display: 'flex', alignItems: 'center' }} size="small">
            <Tag
              color="blue"
              style={{ userSelect: 'none', display: 'flex', alignItems: 'center', margin: 0 }}
            >
              <RiQuillPenAiLine size={12} />
              笔记
            </Tag>
            <Title level={5} style={{ margin: 0, color: token.colorTextHeading, flex: 1 }}>
              {item.title}
            </Title>
          </Space>
        </div>

        {item.summary && (
          <Text
            type="secondary"
            style={{
              marginTop: token.marginXS,
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
            style={{
              marginTop: token.marginXS,
              flex: 1,
              fontSize: token.fontSizeSM
            }}
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

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const [notes, setNotes] = useState<NoteItem[]>([])
  const [filteredNotes, setFilteredNotes] = useState<NoteItem[]>([])
  const [searchText, setSearchText] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [currentNote, setCurrentNote] = useState<NoteItem | null>(null)
  const [isNewNote, setIsNewNote] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState('')
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
          setFilteredNotes((prev) => [...prev, ...result.items])
        } else {
          setNotes(result.items)
          setFilteredNotes(result.items)
        }

        setHasMore(result.hasMore)
        setPage(pageNum)
      } catch (error) {
        console.error('Failed to load notes:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, hasMore, viewMessage]
  )

  const searchNotes = useCallback(
    async (searchStr: string, pageNum: number = 1, isAppend: boolean = false) => {
      if (isLoading || (!hasMore && isAppend)) return

      const messageKey = 'notes-search'
      try {
        setIsLoading(true)
        if (!isAppend) {
          viewMessage(messageKey, 'loading', '正在搜索笔记...')
        }
        const result = await (window as unknown as Window).api.notes.getPage(searchStr, pageNum, 20)

        if (isAppend) {
          setFilteredNotes((prev) => [...prev, ...result.items])
        } else {
          setFilteredNotes(result.items)
        }

        setHasMore(result.hasMore)
        setPage(pageNum)

        if (!isAppend) {
          viewMessage(messageKey, 'success', '搜索完成！', 2)
        }
      } catch (error) {
        console.error('Failed to search notes:', error)
        if (!isAppend) {
          viewMessage(messageKey, 'error', '搜索失败')
        }
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
    if (searchText.trim()) {
      searchNotes(searchText, 1, false).then()
    } else {
      setPage(1)
      setHasMore(true)
      setFilteredNotes(notes)
    }
  }, [searchText])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && hasMore && !isLoading) {
          const nextPage = page + 1
          if (searchText.trim()) {
            searchNotes(searchText, nextPage, true).then()
          } else {
            loadNotes(nextPage, true).then()
          }
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
  }, [hasMore, isLoading, page, searchText, loadNotes, searchNotes])

  const handleCreateNote = (): void => {
    setCurrentNote(null)
    setIsNewNote(true)
    setEditTitle('新笔记')
    setEditTags([])
    setTagInput('')
    setEditImage(null)
    setEditSummary('')
    setIsEditModalOpen(true)
  }

  const handlePreviewNote = async (note: NoteItem): Promise<void> => {
    const messageKey = 'note-preview-load'
    try {
      viewMessage(messageKey, 'loading', '正在加载笔记内容...')
      const fullNote = await (window as unknown as Window).api.notes.getById(note.id)
      if (fullNote) {
        setCurrentNote({ ...note, content: fullNote.content })
        setIsPreviewModalOpen(true)
        viewMessage(messageKey, 'success', '笔记内容加载成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '笔记不存在')
      }
    } catch (error) {
      console.error('Failed to load note content:', error)
      viewMessage(messageKey, 'error', '加载笔记内容失败')
    }
  }

  const handleEditNote = async (note: NoteItem): Promise<void> => {
    const messageKey = 'note-edit-load'
    try {
      viewMessage(messageKey, 'loading', '正在加载笔记内容...')
      const fullNote = await (window as unknown as Window).api.notes.getById(note.id)
      if (fullNote) {
        setCurrentNote({ ...note, content: fullNote.content })
        setIsNewNote(false)
        setEditTitle(note.title)
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
        setEditTags(getTagsArray(note.tags))
        setTagInput('')
        setEditImage(fullNote.image)
        setEditSummary(fullNote.summary || '')
        setIsEditModalOpen(true)
        viewMessage(messageKey, 'success', '笔记内容加载成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '笔记不存在')
      }
    } catch (error) {
      console.error('Failed to load note content:', error)
      viewMessage(messageKey, 'error', '加载笔记内容失败')
    }
  }

  const handleDeleteNote = async (id: number): Promise<void> => {
    const messageKey = 'note-delete'
    try {
      viewMessage(messageKey, 'loading', '正在删除笔记...')
      await (window as unknown as Window).api.notes.delete(id)
      viewMessage(messageKey, 'success', '笔记删除成功！', 2)
      setPage(1)
      setHasMore(true)
      await loadNotes(1, false)
    } catch (error) {
      console.error('Failed to delete note:', error)
      viewMessage(messageKey, 'error', '删除笔记失败')
    }
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      if (!editTags.includes(tagInput.trim())) {
        setEditTags([...editTags, tagInput.trim()])
      }
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string): void => {
    setEditTags(editTags.filter((tag) => tag !== tagToRemove))
  }

  const handleSelectImage = async (): Promise<void> => {
    try {
      const base64Image = await (window as unknown as Window).api.file.selectImageFile()
      if (base64Image) {
        setEditImage(base64Image)
      }
    } catch (error) {
      console.error('Failed to select image:', error)
      viewMessage('image-select-error', 'error', '选择图片失败')
    }
  }

  const handleRemoveImage = (): void => {
    setEditImage(null)
  }

  const handleEditorSave = async (newContent: string): Promise<void> => {
    const messageKey = isNewNote ? 'note-create' : 'note-update'
    try {
      if (isNewNote) {
        viewMessage(messageKey, 'loading', '正在创建笔记...')
        await (window as unknown as Window).api.notes.add({
          title: editTitle || '新笔记',
          image: editImage,
          summary: editSummary || null,
          content: newContent,
          tags: editTags.length > 0 ? JSON.stringify(editTags) : null
        })
        viewMessage(messageKey, 'success', '笔记创建成功！', 2)
      } else if (currentNote) {
        viewMessage(messageKey, 'loading', '正在保存笔记...')
        await (window as unknown as Window).api.notes.update(currentNote.id, {
          title: editTitle,
          image: editImage,
          summary: editSummary || null,
          content: newContent,
          tags: editTags.length > 0 ? JSON.stringify(editTags) : null
        })
        viewMessage(messageKey, 'success', '笔记保存成功！', 2)
      }
      setIsEditModalOpen(false)
      setPage(1)
      setHasMore(true)
      await loadNotes(1, false)
    } catch (error) {
      console.error('Failed to save note:', error)
      viewMessage(messageKey, 'error', '保存笔记失败')
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
        <div
          style={{
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'end',
            borderBottom: `1px solid ${theme.useToken().token.colorBorder}`
          }}
        >
          <Flex justify="space-between" align="center">
            <Space>
              <Search
                placeholder="搜索笔记..."
                allowClear
                enterButton={<SearchOutlined />}
                size="middle"
                style={{ width: 300 }}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateNote}>
                新建笔记
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
            <Flex vertical gap={16}>
              {filteredNotes.length === 0 && !isLoading ? (
                <Empty
                  description={searchText ? '没有找到匹配的笔记' : '暂无笔记，点击新建笔记开始'}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  {!searchText && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateNote}>
                      新建笔记
                    </Button>
                  )}
                </Empty>
              ) : (
                <>
                  <Masonry
                    columns={4}
                    gutter={16}
                    items={filteredNotes.map((item, index) => ({
                      key: item.id,
                      column: index % 4,
                      data: item
                    }))}
                    itemRender={(record) => (
                      <NoteCard
                        item={record.data}
                        onPreview={() => handlePreviewNote(record.data)}
                        onEdit={() => handleEditNote(record.data)}
                        onDelete={() => handleDeleteNote(record.data.id)}
                      />
                    )}
                  />
                  <div ref={loadMoreRef} style={{ height: 20, marginTop: 16 }}>
                    {isLoading && (
                      <div style={{ textAlign: 'center', padding: '16px' }}>加载中...</div>
                    )}
                    {!hasMore && filteredNotes.length > 0 && (
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
      </main>

      {/* 编辑弹窗 */}
      <Modal
        title={isNewNote ? '新建笔记' : '编辑笔记'}
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        width="calc(100vw - 137px)"
        centered={true}
        maskClosable={false}
        styles={{
          body: { height: 'calc(100vh - 205px)', display: 'flex', flexDirection: 'row', gap: 16 }
        }}
        footer={null}
      >
        <div
          style={{
            width: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflowY: 'auto',
            height: '100%',
            minHeight: 0
          }}
        >
          <Input
            placeholder="笔记标题"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            size="large"
            style={{ fontWeight: 600, flexShrink: 0 }}
          />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              flexShrink: 0
            }}
          >
            {editTags.map((tag, index) => (
              <AntTag key={index} closable onClose={() => handleRemoveTag(tag)} color="processing">
                {tag}
              </AntTag>
            ))}
            <Input
              placeholder="输入标签后按回车添加"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              style={{ width: '100%' }}
              allowClear
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button type="default" onClick={handleSelectImage} block>
                上传图片
              </Button>
              {editImage && (
                <Button type="default" danger onClick={handleRemoveImage} block>
                  移除图片
                </Button>
              )}
            </div>
            {editImage && (
              <div style={{ width: '100%', maxHeight: 200, overflow: 'hidden', borderRadius: 8 }}>
                <img
                  src={editImage}
                  alt="笔记封面"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}
          </div>
          <Input.TextArea
            placeholder="笔记摘要"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            style={{ flex: 1, minHeight: 0, resize: 'none' }}
            maxLength={500}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <MarkdownEditor initialValue={currentNote?.content || ''} onSave={handleEditorSave} />
        </div>
      </Modal>

      {/* 预览弹窗 */}
      <Modal
        title={currentNote?.title || '笔记预览'}
        open={isPreviewModalOpen}
        onCancel={() => setIsPreviewModalOpen(false)}
        width="calc(100vw - 137px)"
        centered={true}
        maskClosable={false}
        className="custom-container-scrollbar"
        styles={{ body: { height: 'calc(100vh - 205px)', overflow: 'auto' } }}
        footer={null}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {currentNote?.content ? (
              <MarkdownView content={currentNote.content} />
            ) : (
              <Empty description="暂无内容" />
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Index
