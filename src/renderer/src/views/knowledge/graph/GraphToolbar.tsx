import React from 'react'
import { Button, Space, Input, Flex, Typography } from 'antd'
import { SyncOutlined, SearchOutlined } from '@ant-design/icons'
import { RiArrowLeftLine } from '@remixicon/react'

const { Text } = Typography

interface GraphToolbarProps {
  wikiTitle: string
  isLoading: boolean
  searchQuery: string
  typeFilter: string | undefined
  entityCount: number
  relationCount: number
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: string | undefined) => void
  onBuildGraph: () => void
  onBackToWikiList: () => void
}

const GraphToolbar: React.FC<GraphToolbarProps> = ({
  wikiTitle,
  isLoading,
  searchQuery,
  entityCount,
  relationCount,
  onSearchChange,
  onBuildGraph,
  onBackToWikiList
}) => {
  return (
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
          type="dashed"
          shape="circle"
          size="small"
          icon={<SyncOutlined />}
          onClick={onBuildGraph}
          loading={isLoading}
        ></Button>
      </Flex>
    </div>
  )
}

export default GraphToolbar
