import React, { useMemo } from 'react'
import { theme, Card, Typography, Tag, Space, Modal } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { RiBook2Line } from '@remixicon/react'

const { Title, Text } = Typography

interface WikiRow {
  id: number
  title: string
  summary: string | null
  image: string | null
  created_at: string
  updated_at: string
  doc_count: number
  tags: string | null
}

const getTagsArray = (tagsStr: string | null): string[] => {
  if (!tagsStr) return []
  try {
    const allTags = new Set<string>()
    const validJsonStr = '[' + tagsStr + ']'
    const parsed = JSON.parse(validJsonStr)
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (Array.isArray(item)) {
          item.forEach((tag) => allTags.add(tag))
        }
      })
    }
    return Array.from(allTags).slice(0, 5)
  } catch {
    return []
  }
}

interface WikiCardProps {
  item: WikiRow
  onSelect: () => void
  onEdit?: () => void
  onDelete?: () => void
}

const WikiCard: React.FC<WikiCardProps> = ({ item, onSelect, onEdit, onDelete }) => {
  const { token } = theme.useToken()

  const tags = useMemo(() => getTagsArray(item.tags), [item.tags])

  const handleDeleteClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    Modal.confirm({
      title: '确定要删除这个知识库吗？',
      onOk: onDelete,
      okText: '确定',
      cancelText: '取消'
    })
  }

  return (
    <Card
      size="small"
      hoverable
      onClick={onSelect}
      style={{
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer'
      }}
      actions={
        onEdit || onDelete
          ? [
              onEdit && (
                <EditOutlined
                  key="edit"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                />
              ),
              onDelete && <DeleteOutlined key="delete" onClick={handleDeleteClick} />
            ].filter(Boolean)
          : undefined
      }
    >
      {item.image && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.2,
            overflow: 'hidden'
          }}
        >
          <img
            src={item.image}
            alt={item.title}
            style={{ width: '100%', height: '100%', borderRadius: '7px', objectFit: 'cover' }}
          />
        </div>
      )}
      <div style={{ padding: token.paddingSM, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Space align="start" style={{ display: 'flex', alignItems: 'center' }} size="small">
          <Tag
            color="purple"
            style={{ userSelect: 'none', display: 'flex', alignItems: 'center', margin: 0 }}
          >
            <RiBook2Line size={12} />
            知识库
          </Tag>
          <Title level={5} style={{ margin: 0, color: token.colorTextHeading, flex: 1 }}>
            {item.title}
          </Title>
        </Space>

        {tags.length > 0 && (
          <div style={{ marginTop: token.marginXS, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.map((tag, index) => (
              <Tag key={index} style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
                {tag}
              </Tag>
            ))}
          </div>
        )}

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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 'auto',
            paddingTop: 4
          }}
        >
          <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
            {new Date(item.updated_at).toLocaleString()}
          </Tag>
          <Tag color="blue" style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
            {item.doc_count} 篇文档
          </Tag>
        </div>
      </div>
    </Card>
  )
}

export default WikiCard
