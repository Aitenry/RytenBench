import React, { useState, useEffect, useCallback, useRef } from 'react'
import dayjs from 'dayjs'
import { theme, Modal, Button, Input, Tag as AntTag, DatePicker, Table, Space, Flex } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  ImportOutlined,
  ExportOutlined
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import DocumentPreviewModal from '@renderer/components/document/DocumentPreviewModal'
import DocumentEditModal from '@renderer/components/document/DocumentEditModal'
import { getTagsArray } from '@renderer/utils/document'
import type { DocItem } from '@renderer/types/models'

const { Search } = Input

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
  }, [loadDocs])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const handleCreateDoc = (): void => {
    setCurrentDoc(null)
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

  const handleExportDoc = async (id: number): Promise<void> => {
    const messageKey = 'doc-export'
    try {
      viewMessage(messageKey, 'loading', '正在导出文档...')
      const success = await (window as unknown as Window).api.docs.exportDocument(id)
      if (success) {
        viewMessage(messageKey, 'success', '文档导出成功！', 2)
      }
    } catch (error) {
      console.error('Failed to export doc:', error)
      viewMessage(messageKey, 'error', '导出文档失败')
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

  const handleEditSave = useCallback(
    async (data: {
      title: string
      image: string | null
      summary: string | null
      content: string
      tags: string[]
    }): Promise<void> => {
      const messageKey = currentDoc ? 'doc-update' : 'doc-create'
      try {
        if (currentDoc) {
          viewMessage(messageKey, 'loading', '正在保存文档...')
          await (window as unknown as Window).api.docs.update(currentDoc.id, {
            title: data.title,
            image: data.image,
            summary: data.summary,
            content: data.content,
            tags: data.tags.length > 0 ? JSON.stringify(data.tags) : null
          })
          viewMessage(messageKey, 'success', '文档保存成功！', 2)
        } else {
          viewMessage(messageKey, 'loading', '正在创建文档...')
          await (window as unknown as Window).api.docs.add({
            title: data.title || '新文档',
            image: data.image,
            summary: data.summary,
            content: data.content,
            tags: data.tags.length > 0 ? JSON.stringify(data.tags) : null
          })
          viewMessage(messageKey, 'success', '文档创建成功！', 2)
        }
        setIsEditModalOpen(false)
        await loadDocs(1)
      } catch (error) {
        console.error('Failed to save doc:', error)
        viewMessage(messageKey, 'error', '保存文档失败')
      }
    },
    [currentDoc, viewMessage, loadDocs]
  )

  const handleImportDoc = async (): Promise<void> => {
    const messageKey = 'doc-import'
    try {
      viewMessage(messageKey, 'loading', '正在导入文档...')
      const result = await (window as unknown as Window).api.docs.importDocument()
      if (result) {
        // Open the edit modal with imported content (as new doc)
        setTimeout(() => {
          setCurrentDoc({ title: result.title, content: result.content } as DocItem)
          setIsEditModalOpen(true)
        }, 100)
        viewMessage(messageKey, 'success', `文档"${result.title}"导入成功！`, 2)
      } else {
        viewMessage(messageKey, 'info', '已取消导入', 2)
      }
    } catch (error) {
      console.error('Failed to import doc:', error)
      viewMessage(messageKey, 'error', '导入文档失败')
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
      width: 140,
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
            icon={<ExportOutlined />}
            onClick={() => handleExportDoc(record.id)}
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
              <Button type="default" icon={<ImportOutlined />} onClick={handleImportDoc}>
                导入文档
              </Button>
            </Space>
          </Flex>
        </div>

        <div style={{ padding: '16px', flex: 1, overflow: 'hidden' }}>
          <Table
            className="[&_.ant-table-body]:min-h-[calc(100vh-200px)]"
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
            scroll={{ x: 1000, y: 'calc(100vh - 200px)' }}
          />
        </div>
      </main>

      <DocumentEditModal
        open={isEditModalOpen}
        currentDoc={currentDoc}
        onClose={() => {
          setIsEditModalOpen(false)
          setCurrentDoc(null)
        }}
        onSave={handleEditSave}
      />

      <DocumentPreviewModal
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
