import React, { useMemo, useState } from 'react'
import { Button, Space, Input, Flex, Typography, Select, Modal, Tag } from 'antd'
import { SyncOutlined, SearchOutlined } from '@ant-design/icons'
import { RiApps2AddLine } from '@remixicon/react'
import type { GraphToolbarProps } from '@renderer/types/components'

const { Text } = Typography

const GraphToolbar: React.FC<GraphToolbarProps> = ({
  wikiTitle,
  isLoading,
  searchQuery,
  entityCount,
  relationCount,
  docs,
  addedDocIds,
  isAppending,
  docFilter,
  onSearchChange,
  onAppendDocs,
  onDocFilterChange,
  onBuildGraph
}) => {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])

  // 过滤掉已在图谱中的文档
  const availableDocs = useMemo(
    () => docs.filter((d) => !addedDocIds.has(d.id)),
    [docs, addedDocIds]
  )

  // 文档过滤下拉选项（稳定引用，避免 Select 反复重建）
  const docOptions = useMemo(() => docs.map((d) => ({ value: d.id, label: d.title })), [docs])

  // Modal 内追加文档的选项
  const appendOptions = useMemo(
    () => availableDocs.map((d) => ({ value: d.id, label: d.title })),
    [availableDocs]
  )

  const handleOpenModal = (): void => {
    setSelectedDocIds([])
    setModalOpen(true)
  }

  const handleConfirm = (): void => {
    if (selectedDocIds.length > 0) {
      onAppendDocs(selectedDocIds)
    }
    setModalOpen(false)
  }

  const handleCancel = (): void => {
    setModalOpen(false)
  }

  return (
    <>
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8
        }}
      >
        <Space wrap>
          <Text strong>{wikiTitle}</Text>
        </Space>

        <Flex gap={8} align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            实体 {entityCount} | 关系 {relationCount}
          </Text>
          <Input
            size="small"
            placeholder="搜索实体..."
            prefix={<SearchOutlined />}
            style={{ width: 180 }}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            allowClear
          />
          <Select
            mode="multiple"
            size="small"
            placeholder="全部文档"
            style={{ minWidth: 130, maxWidth: 200 }}
            popupStyle={{ minWidth: 270 }}
            value={docFilter}
            onChange={onDocFilterChange}
            options={docOptions}
            showSearch
            maxTagCount={1}
            allowClear
            notFoundContent="暂无文档"
            maxTagPlaceholder={(omitted) => <span>+{omitted.length}</span>}
            tagRender={(props) => {
              const { label, closable, onClose } = props
              return (
                <Tag
                  closable={closable}
                  onClose={onClose}
                  style={{
                    marginInlineEnd: 4,
                    background: '#1677ff12',
                    border: '1px solid #1677ff30',
                    color: '#1677ff',
                    borderRadius: 12,
                    paddingInline: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    maxWidth: 120
                  }}
                >
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {label}
                  </span>
                </Tag>
              )
            }}
          />
          <Button
            size="small"
            icon={<RiApps2AddLine size={14} />}
            onClick={handleOpenModal}
            loading={isAppending}
          />
          <Button
            type="dashed"
            shape="circle"
            size="small"
            icon={<SyncOutlined />}
            onClick={onBuildGraph}
            loading={isLoading}
          />
        </Flex>
      </div>

      <Modal
        title="选择文档追加到图谱"
        open={modalOpen}
        onOk={handleConfirm}
        onCancel={handleCancel}
        okText="确认追加"
        cancelText="取消"
        okButtonProps={{ disabled: selectedDocIds.length === 0 }}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">
            已加入图谱的文档将不会显示在列表中（{addedDocIds.size} 篇已加入）
          </Text>
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="搜索并选择文档..."
          value={selectedDocIds}
          onChange={setSelectedDocIds}
          options={appendOptions}
          showSearch
          optionFilterProp="label"
          notFoundContent={docs.length === 0 ? '暂无文档' : '所有文档均已加入图谱'}
          tagRender={(props) => {
            const { label, closable, onClose } = props
            return (
              <Tag closable={closable} onClose={onClose} style={{ marginRight: 3 }}>
                {label}
              </Tag>
            )
          }}
        />
      </Modal>
    </>
  )
}

export default GraphToolbar
