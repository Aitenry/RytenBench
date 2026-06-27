import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Modal, Button, Input, Empty, Tag as AntTag } from 'antd'
import { Space, Masonry, Flex } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import MarkdownEditor from '@renderer/components/MarkdownEditor'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import NoteCard from '@renderer/components/NoteCard'
import NotePreviewModal from '@renderer/components/NotePreviewModal'
import { getTagsArray } from '@renderer/utils/note'

const { Search } = Input

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
}

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

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
  const [masonryKey, setMasonryKey] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isComposingRef = useRef(false)

  const { viewMessage } = useMessage()

  const loadNotes = useCallback(
    async (pageNum: number = 1, isAppend: boolean = false) => {
      if (isLoading || (!hasMore && isAppend)) return
      try {
        setIsLoading(true)
        const result = await (window as unknown as Window).api.notes.getAll(pageNum, 10)
        if (isAppend) {
          setFilteredNotes((prev) => [...prev, ...result.items])
        } else {
          setFilteredNotes(result.items)
          setMasonryKey((prev) => prev + 1)
        }

        setHasMore(result.hasMore)
        setPage(pageNum)
      } catch (error) {
        console.error('Failed to load notes:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, hasMore]
  )

  const searchNotes = useCallback(
    async (searchStr: string, pageNum: number = 1, isAppend: boolean = false) => {
      if (isLoading || (!hasMore && isAppend)) return

      const messageKey = 'notes-search'
      try {
        setIsLoading(true)
        const result = await (window as unknown as Window).api.notes.getPage(searchStr, pageNum, 20)
        if (isAppend) {
          setFilteredNotes((prev) => [...prev, ...result.items])
        } else {
          setFilteredNotes(result.items)
          setMasonryKey((prev) => prev + 1)
        }

        setHasMore(result.hasMore)
        setPage(pageNum)
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

  const executeSearch = useCallback(
    (text: string) => {
      if (text.trim()) {
        setPage(1)
        setHasMore(true)
        searchNotes(text, 1, false).then()
      } else {
        setPage(1)
        setHasMore(true)
        setFilteredNotes([])
        setMasonryKey((prev) => prev + 1)
        setTimeout(() => {
          loadNotes(1, false).then()
        }, 0)
      }
    },
    [searchNotes, loadNotes]
  )

  const debouncedSearch = useCallback(
    (text: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        executeSearch(text)
      }, 300)
    },
    [executeSearch]
  )

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value
    setSearchText(value)
    if (!isComposingRef.current) {
      debouncedSearch(value)
    }
  }

  const handleCompositionStart = (): void => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>): void => {
    isComposingRef.current = false
    const value = (e.target as HTMLInputElement).value
    debouncedSearch(value)
  }

  const handleSearch = (value: string): void => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    executeSearch(value)
  }

  useEffect(() => {
    loadNotes(1, false).then()
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

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
      const result = await (window as unknown as Window).api.file.selectImageFile(true)
      if (result?.isImage) {
        setEditImage(result.dataUrl)
      }
    } catch (error) {
      console.error('Failed to select image:', error)
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
                value={searchText}
                onChange={handleSearchInputChange}
                onSearch={handleSearch}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
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
            <Flex vertical gap={16} style={{ height: '100%' }}>
              {filteredNotes.length === 0 && !isLoading ? (
                <Flex flex={1} justify="center" align="center">
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
                </Flex>
              ) : (
                <>
                  <Masonry
                    key={masonryKey}
                    columns={4}
                    gutter={16}
                    items={filteredNotes.map((item) => ({
                      key: item.id,
                      data: item
                    }))}
                    itemRender={(record) => (
                      <NoteCard
                        item={record.data}
                        onClick={() => handlePreviewNote(record.data)}
                        actions={[
                          <EditOutlined
                            key="edit"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditNote(record.data).then()
                            }}
                          />,
                          <DeleteOutlined
                            key="delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              Modal.confirm({
                                title: '确定要删除这篇笔记吗？',
                                onOk: () => handleDeleteNote(record.data.id),
                                okText: '确定',
                                cancelText: '取消'
                              })
                            }}
                          />
                        ]}
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

      <NotePreviewModal
        open={isPreviewModalOpen}
        onCancel={() => setIsPreviewModalOpen(false)}
        currentNote={currentNote}
      />
    </div>
  )
}

export default Index
