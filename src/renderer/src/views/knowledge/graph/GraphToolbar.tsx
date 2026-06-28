import React, { useState } from 'react'
import { Button, Space, Input, Flex, Typography, Select, Modal, Tag } from 'antd'
import { SyncOutlined, SearchOutlined } from '@ant-design/icons'
import { RiApps2AddLine, RiArrowLeftLine } from '@remixicon/react'

const { Text } = Typography

interface NoteOption {
  id: number
  title: string
}

interface GraphToolbarProps {
  wikiTitle: string
  isLoading: boolean
  searchQuery: string
  typeFilter: string | undefined
  entityCount: number
  relationCount: number
  notes: NoteOption[]
  addedNoteIds: Set<number>
  isAppending: boolean
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: string | undefined) => void
  onAppendNotes: (noteIds: number[]) => void
  onBuildGraph: () => void
  onBackToWikiList: () => void
}

const GraphToolbar: React.FC<GraphToolbarProps> = ({
  wikiTitle,
  isLoading,
  searchQuery,
  entityCount,
  relationCount,
  notes,
  addedNoteIds,
  isAppending,
  onSearchChange,
  onAppendNotes,
  onBuildGraph,
  onBackToWikiList
}) => {
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([])

  // 过滤掉已在图谱中的笔记
  const availableNotes = notes.filter((n) => !addedNoteIds.has(n.id))

  const handleOpenModal = (): void => {
    setSelectedNoteIds([])
    setModalOpen(true)
  }

  const handleConfirm = (): void => {
    if (selectedNoteIds.length > 0) {
      onAppendNotes(selectedNoteIds)
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
          <Button size="small" onClick={onBackToWikiList}>
            <RiArrowLeftLine size={12} />
          </Button>
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
        title="选择笔记追加到图谱"
        open={modalOpen}
        onOk={handleConfirm}
        onCancel={handleCancel}
        okText="确认追加"
        cancelText="取消"
        okButtonProps={{ disabled: selectedNoteIds.length === 0 }}
        destroyOnClose
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">
            已加入图谱的笔记将不会显示在列表中（{addedNoteIds.size} 篇已加入）
          </Text>
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="搜索并选择笔记..."
          value={selectedNoteIds}
          onChange={setSelectedNoteIds}
          options={availableNotes.map((n) => ({ value: n.id, label: n.title }))}
          showSearch
          optionFilterProp="label"
          notFoundContent={notes.length === 0 ? '暂无笔记' : '所有笔记均已加入图谱'}
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
