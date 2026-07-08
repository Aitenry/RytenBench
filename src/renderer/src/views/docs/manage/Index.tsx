import React, { useState, useEffect, useCallback, useRef } from 'react'
import dayjs from 'dayjs'
import { theme, Modal, Button, Input, Tag as AntTag, DatePicker, Table, Space, Flex } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import MarkdownEditor from '@renderer/components/MarkdownEditor'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import DocPreviewModal from '@renderer/components/DocPreviewModal'
import { getTagsArray } from '@renderer/utils/document'

const { Search } = Input

interface DocItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  created_at: string
  updated_at: string
  word_count: number
  content?: string | null
}

const PAGE_SIZE = 20

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG, colorTextTertiary, colorTextSecondary }
  } = theme.useToken()

  const [filteredDocs, setFilteredDocs] = useState<DocItem[]>([])
  const [searchText, setSearchText] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false)
  const [deleteDateRange, setDeleteDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [currentDoc, setCurrentDoc] = useState<DocItem | null>(null)
  const [isNewDoc, setIsNewDoc] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isComposingRef = useRef(false)

  const { viewMessage } = useMessage()

  const loadDocs = useCallback(async (pageNum: number = 1) => {
    try {
      setIsLoading(true)
      const result = await (window as unknown as Window).api.docs.getAll(pageNum, PAGE_SIZE)
      setFilteredDocs(result.items)
      setTotal(result.total)
      setPage(pageNum)
    } catch (error) {
      console.error('Failed to load docs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const searchDocs = useCallback(
    async (searchStr: string, pageNum: number = 1) => {
      const messageKey = 'docs-search'
      try {
        setIsLoading(true)
        const result = await (window as unknown as Window).api.docs.getPage(
          searchStr,
          pageNum,
          PAGE_SIZE
        )
        setFilteredDocs(result.items)
        setTotal(result.total)
        setPage(pageNum)
      } catch (error) {
        console.error('Failed to search docs:', error)
        viewMessage(messageKey, 'error', '搜索失败')
      } finally {
        setIsLoading(false)
      }
    },
    [viewMessage]
  )

  const executeSearch = useCallback(
    (text: string) => {
      if (text.trim()) {
        searchDocs(text, 1)
      } else {
        loadDocs(1)
      }
    },
    [searchDocs, loadDocs]
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

  const handlePageChange = (newPage: number): void => {
    if (searchText.trim()) {
      searchDocs(searchText, newPage)
    } else {
      loadDocs(newPage)
    }
  }

  useEffect(() => {
    loadDocs(1)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const handleCreateDoc = (): void => {
    setCurrentDoc(null)
    setIsNewDoc(true)
    setEditTitle('新文档')
    setEditTags([])
    setTagInput('')
    setEditImage(null)
    setEditSummary('')
    setIsEditModalOpen(true)
  }

  const handlePreviewDoc = async (doc: DocItem): Promise<void> => {
    const messageKey = 'doc-preview-load'
    try {
      viewMessage(messageKey, 'loading', '正在加载文档内容...')
      const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
      if (fullDoc) {
        setCurrentDoc({ ...doc, content: fullDoc.content })
        setIsPreviewModalOpen(true)
        viewMessage(messageKey, 'success', '文档内容加载成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '文档不存在')
      }
    } catch (error) {
      console.error('Failed to load doc content:', error)
      viewMessage(messageKey, 'error', '加载文档内容失败')
    }
  }

  const handleEditDoc = async (doc: DocItem): Promise<void> => {
    const messageKey = 'doc-edit-load'
    try {
      viewMessage(messageKey, 'loading', '正在加载文档内容...')
      const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
      if (fullDoc) {
        setCurrentDoc({ ...doc, content: fullDoc.content })
        setIsNewDoc(false)
        setEditTitle(doc.title)
        setEditTags(getTagsArray(doc.tags))
        setTagInput('')
        setEditImage(fullDoc.image)
        setEditSummary(fullDoc.summary || '')
        setIsEditModalOpen(true)
        viewMessage(messageKey, 'success', '文档内容加载成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '文档不存在')
      }
    } catch (error) {
      console.error('Failed to load doc content:', error)
      viewMessage(messageKey, 'error', '加载文档内容失败')
    }
  }

  const handleDeleteDoc = async (id: number): Promise<void> => {
    const messageKey = 'doc-delete'
    try {
      viewMessage(messageKey, 'loading', '正在删除文档...')
      await (window as unknown as Window).api.docs.delete(id)
      viewMessage(messageKey, 'success', '文档删除成功！', 2)
      await loadDocs(page)
    } catch (error) {
      console.error('Failed to delete doc:', error)
      viewMessage(messageKey, 'error', '删除文档失败')
    }
  }

  const handleBatchDeleteByTimeRange = async (dates: [dayjs.Dayjs, dayjs.Dayjs]): Promise<void> => {
    const messageKey = 'doc-batch-delete'
    try {
      viewMessage(messageKey, 'loading', '正在批量删除文档...')
      const count = await (window as unknown as Window).api.docs.deleteByTimeRange(
        dates[0].startOf('day').toISOString(),
        dates[1].endOf('day').toISOString()
      )
      viewMessage(messageKey, 'success', `成功删除 ${count} 篇文档！`, 2)
      setIsBatchDeleteModalOpen(false)
      setDeleteDateRange(null)
      await loadDocs(1)
    } catch (error) {
      console.error('Failed to batch delete docs:', error)
      viewMessage(messageKey, 'error', '批量删除失败')
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
    const messageKey = isNewDoc ? 'doc-create' : 'doc-update'
    try {
      if (isNewDoc) {
        viewMessage(messageKey, 'loading', '正在创建文档...')
        await (window as unknown as Window).api.docs.add({
          title: editTitle || '新文档',
          image: editImage,
          summary: editSummary || null,
          content: newContent,
          tags: editTags.length > 0 ? JSON.stringify(editTags) : null
        })
        viewMessage(messageKey, 'success', '文档创建成功！', 2)
      } else if (currentDoc) {
        viewMessage(messageKey, 'loading', '正在保存文档...')
        await (window as unknown as Window).api.docs.update(currentDoc.id, {
          title: editTitle,
          image: editImage,
          summary: editSummary || null,
          content: newContent,
          tags: editTags.length > 0 ? JSON.stringify(editTags) : null
        })
        viewMessage(messageKey, 'success', '文档保存成功！', 2)
      }
      setIsEditModalOpen(false)
      await loadDocs(1)
    } catch (error) {
      console.error('Failed to save doc:', error)
      viewMessage(messageKey, 'error', '保存文档失败')
    }
  }

  const columns: ColumnsType<DocItem> = [
    {
      title: '封面',
      dataIndex: 'image',
      key: 'image',
      width: 80,
      render: (image: string | null) =>
        image ? (
          <img
            src={image}
            alt="封面"
            style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4 }}
          />
        ) : (
          <span style={{ color: colorTextTertiary }}>-</span>
        )
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (text: string, record: DocItem) => (
        <a onClick={() => handlePreviewDoc(record)}>{text}</a>
      )
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      key: 'summary',
      ellipsis: true,
      render: (text: string | null) => (
        <span style={{ color: text ? undefined : colorTextTertiary }}>{text || '-'}</span>
      )
    },
    {
      title: '字数',
      dataIndex: 'word_count',
      key: 'word_count',
      width: 80,
      align: 'center'
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      align: 'center',
      width: 200,
      render: (tags: string | null) => {
        const tagList = getTagsArray(tags)
        if (tagList.length === 0) return <span style={{ color: colorTextTertiary }}>-</span>
        return (
          <Space size={4} wrap>
            {tagList.slice(0, 3).map((tag) => (
              <AntTag key={tag} color="processing">
                {tag}
              </AntTag>
            ))}
            {tagList.length > 3 && <AntTag>+{tagList.length - 3}</AntTag>}
          </Space>
        )
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      align: 'center',
      render: (text: string) => new Date(text).toLocaleString()
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      align: 'center',
      render: (text: string) => new Date(text).toLocaleString()
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      align: 'center',
      render: (_: unknown, record: DocItem) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditDoc(record)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: '确定要删除这篇文档吗？',
                onOk: () => handleDeleteDoc(record.id),
                okText: '确定',
                cancelText: '取消'
              })
            }}
          />
        </Space>
      )
    }
  ]

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
                placeholder="搜索文档..."
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
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateDoc}>
                新建文档
              </Button>
              <Button
                type="default"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setIsBatchDeleteModalOpen(true)}
              >
                批量删除
              </Button>
            </Space>
          </Flex>
        </div>

        <div style={{ padding: '16px', flex: 1, overflow: 'hidden' }}>
          <Table
            columns={columns}
            dataSource={filteredDocs}
            rowKey="id"
            loading={isLoading}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              showTotal: (t) => `共 ${t} 篇文档`,
              onChange: handlePageChange,
              placement: ['bottomCenter']
            }}
            size="middle"
            scroll={{ x: 1100, y: 'calc(100vh - 200px)' }}
          />
        </div>
      </main>

      <Modal
        title={isNewDoc ? '新建文档' : '编辑文档'}
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        width="calc(100vw - 137px)"
        centered={true}
        mask={{ closable: false }}
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
            placeholder="文档标题"
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
                  alt="文档封面"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}
          </div>
          <Input.TextArea
            placeholder="文档摘要"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            style={{ flex: 1, minHeight: 0, resize: 'none' }}
            maxLength={500}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <MarkdownEditor initialValue={currentDoc?.content || ''} onSave={handleEditorSave} />
        </div>
      </Modal>

      <DocPreviewModal
        open={isPreviewModalOpen}
        onCancel={() => setIsPreviewModalOpen(false)}
        currentDoc={currentDoc}
      />

      <Modal
        title="批量删除文档"
        open={isBatchDeleteModalOpen}
        onCancel={() => {
          setIsBatchDeleteModalOpen(false)
          setDeleteDateRange(null)
        }}
        footer={null}
        width={400}
      >
        <div style={{ padding: '8px 0' }}>
          <div style={{ marginBottom: 16, color: colorTextSecondary }}>
            选择要删除文档的创建时间范围，范围内的所有文档将被永久删除。
          </div>
          <DatePicker.RangePicker
            showTime
            style={{ width: '100%', marginBottom: 16 }}
            placeholder={['开始时间', '结束时间']}
            value={deleteDateRange}
            onChange={(dates) => setDeleteDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          />
          <Button
            danger
            type="primary"
            block
            disabled={!deleteDateRange}
            onClick={() => {
              if (!deleteDateRange) return
              Modal.confirm({
                title: '确定要删除该时间范围内的所有文档吗？',
                content: '删除后不可恢复',
                onOk: () => handleBatchDeleteByTimeRange(deleteDateRange),
                okText: '确定',
                cancelText: '取消',
                okButtonProps: { danger: true }
              })
            }}
          >
            删除
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default Index
