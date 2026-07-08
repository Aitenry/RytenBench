import React from 'react'
import { theme, Card, Typography, Tag, Space } from 'antd'
import { RiQuillPenAiLine } from '@remixicon/react'
import { getTagsArray } from '@renderer/utils/document'

const { Title, Text } = Typography

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
  isPinned?: boolean
}

interface DocCardProps {
  item: DocItem
  onClick?: () => void
  actions?: React.ReactNode[]
  showContentPreview?: boolean
}

const DocCard: React.FC<DocCardProps> = ({
  item,
  onClick,
  actions,
  showContentPreview = true
}) => {
  const { token } = theme.useToken()
  const tags = getTagsArray(item.tags)
  const word_count = item.word_count || 0

  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
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
      actions={actions}
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
        <div>
          <Space align="start" style={{ display: 'flex', alignItems: 'center' }} size="small">
            <Tag
              color="blue"
              style={{ userSelect: 'none', display: 'flex', alignItems: 'center', margin: 0 }}
            >
              <RiQuillPenAiLine size={12} />
              文档
            </Tag>
            <Title level={5} style={{ margin: 0, color: token.colorTextHeading, flex: 1 }}>
              {item.title}
            </Title>
          </Space>
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
                <Tag key={index} style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
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

        {!item.summary && item.content && showContentPreview && (
          <Text
            type="secondary"
            style={{ marginTop: token.marginXS, flex: 1, fontSize: token.fontSizeSM }}
          >
            {item.content.replace(/[#*`[\]]/g, '').substring(0, 200)}
          </Text>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
          <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
            {new Date(item.updated_at).toLocaleString()}
          </Tag>
          <div style={{ display: 'flex', gap: token.marginXS / 2 }}>
            {word_count > 0 && (
              <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>{word_count}字</Tag>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default DocCard
