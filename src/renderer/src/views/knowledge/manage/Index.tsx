import React, { useState, useEffect, useCallback, useRef } from 'react'
import { theme, Modal, Button, Input, Empty, Select, Space, Flex, Typography, Masonry } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { RiBook2Line } from '@remixicon/react'
import { useMessage } from '@renderer/hooks/useMessage'
import NoteCard from '@renderer/components/NoteCard'
import NotePreviewModal from '@renderer/components/NotePreviewModal'
import { Window } from '../../../../resource/types/window'
import WikiCard from './components/WikiCard'
import DirectoryTree from './components/DirectoryTree'
import { DirectoryWithChildren } from './types'

interface WikiRow {
  id: number
  title: string
  summary: string | null
  image: string | null
  created_at: string
  updated_at: string
  note_count: number
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

interface NoteListItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  version: number
  created_at: string
  updated_at: string
  word_count: number
}

const { Title, Text } = Typography
const { Option } = Select

interface DirectoryNoteWithDetail extends NoteListItem {
  directory_id: number
  content?: string | null
}

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const [wikis, setWikis] = useState<WikiRow[]>([])
  const [selectedWiki, setSelectedWiki] = useState<WikiRow | null>(null)
  const [directories, setDirectories] = useState<WikiDirectoryRow[]>([])
  const [directoryTree, setDirectoryTree] = useState<DirectoryWithChildren[]>([])
  const [selectedDirectory, setSelectedDirectory] = useState<WikiDirectoryRow | null>(null)
  const [directoryNotes, setDirectoryNotes] = useState<DirectoryNoteWithDetail[]>([])
  const [allNotes, setAllNotes] = useState<NoteListItem[]>([])
  const [allNotesPage, setAllNotesPage] = useState(1)
  const [allNotesHasMore, setAllNotesHasMore] = useState(true)
  const [allNotesLoading, setAllNotesLoading] = useState(false)

  const [isWikiModalOpen, setIsWikiModalOpen] = useState(false)
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false)
  const [isNoteArchiveModalOpen, setIsNoteArchiveModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<WikiRow | WikiDirectoryRow | null>(null)
  const [currentNote, setCurrentNote] = useState<DirectoryNoteWithDetail | null>(null)
  const [isNew, setIsNew] = useState(false)

  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editDirectoryName, setEditDirectoryName] = useState('')
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([])

  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [wikiMasonryKey, setWikiMasonryKey] = useState(0)
  const [directoryNotesMasonryKey, setDirectoryNotesMasonryKey] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const { viewMessage } = useMessage()

  const buildDirectoryTree = useCallback((dirs: WikiDirectoryRow[]): DirectoryWithChildren[] => {
    const map = new Map<number, DirectoryWithChildren>()
    const roots: DirectoryWithChildren[] = []

    dirs.forEach((dir) => {
      map.set(dir.id, { ...dir, children: [] })
    })

    dirs.forEach((dir) => {
      const node = map.get(dir.id)!
      if (dir.parent_id === null) {
        roots.push(node)
      } else {
        const parent = map.get(dir.parent_id)
        if (parent) {
          parent.children!.push(node)
        }
      }
    })

    return roots
  }, [])

  const loadWikis = useCallback(
    async (pageNum: number = 1, isAppend: boolean = false) => {
      if (isLoading || (!hasMore && isAppend)) return
      try {
        setIsLoading(true)
        const result = await (window as unknown as Window).api.wikis.getAll(pageNum, 10)
        if (isAppend) {
          setWikis((prev) => [...prev, ...result.items])
        } else {
          setWikis(result.items)
          setWikiMasonryKey((prev) => prev + 1)
        }
        setHasMore(result.hasMore)
        setPage(pageNum)
      } catch (error) {
        console.error('Failed to load wikis:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, hasMore]
  )

  const getAllDirectoryIds = (nodes: DirectoryWithChildren[]): React.Key[] => {
    let ids: React.Key[] = []
    nodes.forEach((node) => {
      ids.push(node.id)
      if (node.children && node.children.length > 0) {
        ids = ids.concat(getAllDirectoryIds(node.children))
      }
    })
    return ids
  }

  const loadDirectories = useCallback(
    async (wikiId: number) => {
      try {
        const dirs = await (window as unknown as Window).api.wikis.getDirectories(wikiId)
        const tree = buildDirectoryTree(dirs)
        setDirectories(dirs)
        setDirectoryTree(tree)
        setExpandedKeys(getAllDirectoryIds(tree))
      } catch (error) {
        console.error('Failed to load directories:', error)
      }
    },
    [buildDirectoryTree]
  )

  const loadDirectoryNotes = useCallback(async (directoryId: number) => {
    try {
      const noteIds = await (window as unknown as Window).api.wikis.getNotesByDirectory(directoryId)
      const notes: DirectoryNoteWithDetail[] = []
      for (const { note_id } of noteIds) {
        const note = await (window as unknown as Window).api.notes.getById(note_id)
        if (note) {
          notes.push({ ...note, directory_id: directoryId })
        }
      }
      setDirectoryNotes(notes)
      setDirectoryNotesMasonryKey((prev) => prev + 1)
    } catch (error) {
      console.error('Failed to load directory notes:', error)
    }
  }, [])

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<string>('')

  const loadAllNotes = useCallback(
    async (
      pageNum: number = 1,
      excludeWikiId?: number,
      isAppend: boolean = false,
      search?: string
    ) => {
      if (allNotesLoading) return
      setAllNotesLoading(true)
      try {
        const result = await (window as unknown as Window).api.notes.getAll(
          pageNum,
          20,
          excludeWikiId,
          search
        )
        if (isAppend) {
          setAllNotes((prev) => [...prev, ...result.items])
        } else {
          setAllNotes(result.items)
        }
        setAllNotesHasMore(result.hasMore)
        setAllNotesPage(pageNum)
      } catch (error) {
        console.error('Failed to load all notes:', error)
      } finally {
        setAllNotesLoading(false)
      }
    },
    [allNotesLoading]
  )

  const handleSearchNotes = useCallback(
    (value: string) => {
      searchRef.current = value
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        loadAllNotes(1, selectedWiki?.id, false, value || undefined)
      }, 300)
    },
    [loadAllNotes, selectedWiki?.id]
  )

  useEffect(() => {
    loadWikis(1, false).then()
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && hasMore && !isLoading) {
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
    setSelectedDirectory(null)
    setDirectoryNotes([])
    loadDirectories(wiki.id).then()
  }

  const handleSelectDirectory = (selectedKeys: React.Key[]): void => {
    if (selectedKeys.length > 0) {
      const dirId = selectedKeys[0] as number
      const dir = directories.find((d) => d.id === dirId)
      if (dir) {
        setSelectedDirectory(dir)
        loadDirectoryNotes(dir.id).then()
      }
    }
  }

  const handlePreviewNote = async (note: DirectoryNoteWithDetail): Promise<void> => {
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
      setSelectedDirectory(null)
      setDirectoryNotes([])
      await loadWikis(1, false)
    } catch (error) {
      console.error('Failed to delete wiki:', error)
      viewMessage(messageKey, 'error', '删除知识库失败')
    }
  }

  const handleSaveWiki = async (): Promise<void> => {
    const messageKey = isNew ? 'wiki-create' : 'wiki-update'
    try {
      if (isNew) {
        viewMessage(messageKey, 'loading', '正在创建知识库...')
        await (window as unknown as Window).api.wikis.add({
          title: editTitle,
          summary: editSummary || null,
          image: editImage
        })
        viewMessage(messageKey, 'success', '知识库创建成功！', 2)
      } else if (currentItem && 'id' in currentItem) {
        viewMessage(messageKey, 'loading', '正在保存知识库...')
        await (window as unknown as Window).api.wikis.update(currentItem.id, {
          title: editTitle,
          summary: editSummary || null,
          image: editImage
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

  const [creatingSubDirectoryFor, setCreatingSubDirectoryFor] = useState<number | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])

  const handleCreateDirectory = (parentId: number | null = null): void => {
    setCurrentItem(null)
    setIsNew(true)
    setEditDirectoryName('新目录')
    setCreatingSubDirectoryFor(parentId)
    setIsDirectoryModalOpen(true)
  }

  const handleEditDirectory = (dir: WikiDirectoryRow): void => {
    setCurrentItem(dir)
    setIsNew(false)
    setEditDirectoryName(dir.name)
    setIsDirectoryModalOpen(true)
  }

  const handleSaveDirectory = async (): Promise<void> => {
    if (!selectedWiki) return
    const messageKey = isNew ? 'directory-create' : 'directory-update'
    try {
      if (isNew) {
        viewMessage(messageKey, 'loading', '正在创建目录...')
        const parentDir = creatingSubDirectoryFor
          ? directories.find((d) => d.id === creatingSubDirectoryFor)
          : null

        await (window as unknown as Window).api.wikis.addDirectory({
          wiki_id: selectedWiki.id,
          parent_id: creatingSubDirectoryFor ?? null,
          name: editDirectoryName,
          sort_order: 0,
          level: parentDir ? parentDir.level + 1 : 0
        })
        viewMessage(messageKey, 'success', '目录创建成功！', 2)
      } else if (currentItem && 'id' in currentItem) {
        viewMessage(messageKey, 'loading', '正在保存目录...')
        await (window as unknown as Window).api.wikis.updateDirectory(currentItem.id, {
          name: editDirectoryName
        })
        viewMessage(messageKey, 'success', '目录保存成功！', 2)
      }
      setIsDirectoryModalOpen(false)
      setCreatingSubDirectoryFor(null)
      await loadDirectories(selectedWiki.id)
    } catch (error) {
      console.error('Failed to save directory:', error)
      viewMessage(messageKey, 'error', '保存目录失败')
    }
  }

  const handleDeleteDirectory = async (dir: WikiDirectoryRow): Promise<void> => {
    const messageKey = 'directory-delete'
    try {
      viewMessage(messageKey, 'loading', '正在删除目录...')
      await (window as unknown as Window).api.wikis.deleteDirectory(dir.id)
      viewMessage(messageKey, 'success', '目录删除成功！', 2)
      setSelectedDirectory(null)
      setDirectoryNotes([])
      if (selectedWiki) {
        await loadDirectories(selectedWiki.id)
      }
    } catch (error) {
      console.error('Failed to delete directory:', error)
      viewMessage(messageKey, 'error', '删除目录失败')
    }
  }

  const handleOpenArchiveModal = (): void => {
    setSelectedNoteIds([])
    loadAllNotes(1, selectedWiki?.id, false).then(() => {
      setIsNoteArchiveModalOpen(true)
    })
  }

  const handleArchiveNotes = async (): Promise<void> => {
    if (!selectedDirectory) return
    const messageKey = 'archive-notes'
    try {
      viewMessage(messageKey, 'loading', '正在归档笔记...')
      for (const noteId of selectedNoteIds) {
        await (window as unknown as Window).api.wikis.addNoteToDirectory(
          selectedDirectory.id,
          noteId
        )
      }
      viewMessage(messageKey, 'success', '笔记归档成功！', 2)
      setIsNoteArchiveModalOpen(false)
      await loadDirectoryNotes(selectedDirectory.id)
    } catch (error) {
      console.error('Failed to archive notes:', error)
      viewMessage(messageKey, 'error', '归档笔记失败')
    }
  }

  const handleRemoveNoteFromDirectory = async (noteId: number): Promise<void> => {
    if (!selectedDirectory) return
    const messageKey = 'remove-note'
    try {
      viewMessage(messageKey, 'loading', '正在移除笔记...')
      await (window as unknown as Window).api.wikis.removeNoteFromDirectory(
        selectedDirectory.id,
        noteId
      )
      viewMessage(messageKey, 'success', '笔记移除成功！', 2)
      await loadDirectoryNotes(selectedDirectory.id)
    } catch (error) {
      console.error('Failed to remove note:', error)
      viewMessage(messageKey, 'error', '移除笔记失败')
    }
  }

  const handleSelectImage = async (): Promise<void> => {
    try {
      const result = await (window as unknown as Window).api.file.selectImageFile(true)
      if (result?.isImage) {
        setEditImage(result.dataUrl)
      }
    } catch (error) {
      console.error('Failed to select image:', error)
      viewMessage('image-select-error', 'error', '选择图片失败')
    }
  }

  const handleRemoveImage = (): void => {
    setEditImage(null)
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
              borderBottom: `1px solid ${theme.useToken().token.colorBorder}`
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
                    <Masonry
                      key={wikiMasonryKey}
                      columns={4}
                      gutter={16}
                      items={wikis.map((item) => ({
                        key: item.id,
                        data: item
                      }))}
                      itemRender={(record) => (
                        <WikiCard
                          item={record.data}
                          onSelect={() => handleSelectWiki(record.data)}
                          onEdit={() => handleEditWiki(record.data)}
                          onDelete={() => handleDeleteWiki(record.data.id)}
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
      ) : (
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
                    {selectedWiki.title}
                  </Title>
                </Space>
                <Space>
                  <EditOutlined onClick={() => handleEditWiki(selectedWiki)} />
                </Space>
              </Flex>
              {selectedWiki.summary && (
                <Text type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                  {selectedWiki.summary}
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
                  onCreateDirectory={handleCreateDirectory}
                  onEditDirectory={handleEditDirectory}
                  onDeleteDirectory={handleDeleteDirectory}
                />
              )}
            </div>

            <Button style={{ marginTop: 8 }} onClick={() => setSelectedWiki(null)}>
              返回知识库列表
            </Button>
          </aside>

          <main
            className="flex-1 flex flex-col"
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
                justifyContent: 'space-between',
                borderBottom: `1px solid ${theme.useToken().token.colorBorder}`
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                {selectedDirectory ? selectedDirectory.name : '请选择目录'}
              </Title>
              {selectedDirectory && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenArchiveModal}>
                  归档笔记
                </Button>
              )}
            </div>

            <div style={{ padding: '12px', flex: 1, overflow: 'auto' }}>
              {!selectedDirectory ? (
                <Empty description="请从左侧选择一个目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : directoryNotes.length === 0 ? (
                <Empty description="目录中暂无笔记" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenArchiveModal}>
                    归档笔记
                  </Button>
                </Empty>
              ) : (
                <Masonry
                  key={directoryNotesMasonryKey}
                  columns={3}
                  gutter={12}
                  items={directoryNotes.map((item) => ({
                    key: item.id,
                    data: item
                  }))}
                  itemRender={(record) => (
                    <NoteCard
                      item={record.data}
                      onClick={() => handlePreviewNote(record.data)}
                      actions={[
                        <DeleteOutlined
                          key="remove"
                          onClick={(e) => {
                            e.stopPropagation()
                            Modal.confirm({
                              title: '确定要从目录中移除这篇笔记吗？',
                              onOk: () => handleRemoveNoteFromDirectory(record.data.id),
                              okText: '确定',
                              cancelText: '取消'
                            })
                          }}
                        />
                      ]}
                      showContentPreview={false}
                    />
                  )}
                />
              )}
            </div>
          </main>
        </>
      )}

      <Modal
        title={isNew ? '新建知识库' : '编辑知识库'}
        open={isWikiModalOpen}
        onOk={handleSaveWiki}
        onCancel={() => setIsWikiModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Space vertical style={{ width: '100%' }}>
          <Input
            placeholder="知识库标题"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <Input.TextArea
            placeholder="知识库摘要"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            rows={4}
          />
          <Space>
            <Button type="default" onClick={handleSelectImage}>
              上传封面图片
            </Button>
            {editImage && (
              <Button type="default" danger onClick={handleRemoveImage}>
                移除图片
              </Button>
            )}
          </Space>
          {editImage && (
            <div style={{ maxHeight: 200, overflow: 'hidden', borderRadius: 8 }}>
              <img
                src={editImage}
                alt="封面"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </Space>
      </Modal>

      <Modal
        title={isNew ? '新建目录' : '编辑目录'}
        open={isDirectoryModalOpen}
        onOk={handleSaveDirectory}
        onCancel={() => setIsDirectoryModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Input
          placeholder="目录名称"
          value={editDirectoryName}
          onChange={(e) => setEditDirectoryName(e.target.value)}
        />
      </Modal>

      <Modal
        title="归档笔记"
        open={isNoteArchiveModalOpen}
        onOk={handleArchiveNotes}
        onCancel={() => setIsNoteArchiveModalOpen(false)}
        okText="归档"
        cancelText="取消"
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="搜索并选择要归档的笔记"
          value={selectedNoteIds}
          onChange={setSelectedNoteIds}
          optionLabelProp="label"
          showSearch
          onSearch={handleSearchNotes}
          filterOption={false}
          onPopupScroll={(e) => {
            const target = e.target as HTMLElement
            if (
              target.scrollTop + target.offsetHeight >= target.scrollHeight - 10 &&
              allNotesHasMore &&
              !allNotesLoading
            ) {
              loadAllNotes(allNotesPage + 1, selectedWiki?.id, true, searchRef.current || undefined)
            }
          }}
          notFoundContent={allNotesLoading ? '加载中...' : null}
        >
          {allNotes.map((note) => (
            <Option key={note.id} value={note.id} label={note.title}>
              <Space>
                <FileTextOutlined />
                <span>{note.title}</span>
              </Space>
            </Option>
          ))}
        </Select>
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
