import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Modal, Select, Space } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { Window } from '../../../resource/types/window'
import type { DocListItem } from '@renderer/types/models'
import type { WikiArchiveModalProps } from '@renderer/types/components'

const { Option } = Select

const WikiArchiveModal: React.FC<WikiArchiveModalProps> = ({
  open,
  wikiId,
  onArchive,
  onCancel
}) => {
  const [allDocs, setAllDocs] = useState<DocListItem[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [archiving, setArchiving] = useState(false)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<string>('')
  const loadingRef = useRef(false)

  const loadDocs = useCallback(
    async (pageNum: number = 1, isAppend: boolean = false, search?: string) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      try {
        const result = await (window as unknown as Window).api.docs.getAll(
          pageNum,
          20,
          wikiId,
          search
        )
        if (isAppend) {
          setAllDocs((prev) => [...prev, ...result.items])
        } else {
          setAllDocs(result.items)
        }
        setHasMore(result.hasMore)
        setPage(pageNum)
      } catch (error) {
        console.error('Failed to load docs:', error)
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [wikiId]
  )

  useEffect(() => {
    if (open && wikiId !== undefined) {
      setSelectedIds([])
      setAllDocs([])
      setPage(1)
      setHasMore(true)
      loadDocs(1, false).then()
    }
  }, [open, wikiId, loadDocs])

  const handleSearch = useCallback(
    (value: string) => {
      searchRef.current = value
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(() => {
        setAllDocs([])
        setPage(1)
        setHasMore(true)
        loadDocs(1, false, value || undefined)
      }, 300)
    },
    [loadDocs]
  )

  const handleArchive = async (): Promise<void> => {
    setArchiving(true)
    try {
      await onArchive(selectedIds)
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Modal
      title="归档文档到目录"
      open={open}
      onOk={handleArchive}
      onCancel={onCancel}
      okText="归档"
      cancelText="取消"
      confirmLoading={archiving}
    >
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        placeholder="搜索并选择要归档的文档"
        value={selectedIds}
        onChange={setSelectedIds}
        optionLabelProp="label"
        showSearch
        onSearch={handleSearch}
        filterOption={false}
        onPopupScroll={(e) => {
          const target = e.target as HTMLElement
          if (
            target.scrollTop + target.offsetHeight >= target.scrollHeight - 10 &&
            hasMore &&
            !loading
          ) {
            loadDocs(page + 1, true, searchRef.current || undefined)
          }
        }}
        notFoundContent={loading ? '加载中...' : null}
      >
        {allDocs.map((doc) => (
          <Option key={doc.id} value={doc.id} label={doc.title}>
            <Space>
              <FileTextOutlined />
              <span>{doc.title}</span>
            </Space>
          </Option>
        ))}
      </Select>
    </Modal>
  )
}

export default WikiArchiveModal
