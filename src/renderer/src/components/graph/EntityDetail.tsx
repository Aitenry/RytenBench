import React, { useState, useEffect } from 'react'
import { Typography, Tag, Descriptions, Empty } from 'antd'
import {
  RiUserLine,
  RiBuildingLine,
  RiCodeLine,
  RiLightbulbLine,
  RiCalendarLine,
  RiMapPinLine,
  RiBox3Line,
  RiQuestionLine,
  RiDashboardLine,
  RiFileTextLine,
  RiScalesLine,
  RiBuilding2Line,
  RiFlaskLine,
  RiGitBranchLine,
  RiUserStarLine,
  RiStarLine,
  RiBarChartLine,
  RiSwordLine,
  RiBugLine,
  RiMedalLine
} from '@remixicon/react'
import { theme } from 'antd'
import { Window } from '../../../resource/types/window'
import {
  ENTITY_TYPE_COLORS,
  ENTITY_TYPE_LABELS,
  RELATION_TYPE_LABELS
} from '@renderer/types/knowledge'
import type { EntityDetailProps } from '@renderer/types/components'

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  person: <RiUserLine />,
  organization: <RiBuildingLine />,
  technology: <RiCodeLine />,
  concept: <RiLightbulbLine />,
  event: <RiCalendarLine />,
  location: <RiMapPinLine />,
  product: <RiBox3Line />,
  system: <RiDashboardLine />,
  document: <RiFileTextLine />,
  standard: <RiScalesLine />,
  facility: <RiBuilding2Line />,
  substance: <RiFlaskLine />,
  process: <RiGitBranchLine />,
  role: <RiUserStarLine />,
  skill: <RiStarLine />,
  measure: <RiBarChartLine />,
  artifact: <RiSwordLine />,
  creature: <RiBugLine />,
  realm: <RiMedalLine />,
  other: <RiQuestionLine />
}

const { Title, Text, Paragraph } = Typography

const EntityDetail: React.FC<EntityDetailProps> = ({
  entity,
  entities,
  relations,
  onRelationClick,
  onDocClick,
  onClose
}) => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  // 构建 entity id → name 的快速查找表
  const entityNameMap = React.useMemo(() => {
    const map = new Map<number, string>()
    for (const e of entities) {
      map.set(e.id, e.name)
    }
    return map
  }, [entities])

  // 获取来源文档的标题
  const [docTitles, setDocTitles] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    if (!entity) return

    const sourceDocIds: number[] = entity.source_note_ids
      ? (() => {
          try {
            return JSON.parse(entity.source_note_ids)
          } catch {
            return []
          }
        })()
      : []

    if (sourceDocIds.length === 0) return

    let cancelled = false
    const fetchTitles = async (): Promise<void> => {
      const titles = new Map<number, string>()
      await Promise.all(
        sourceDocIds.map(async (id) => {
          try {
            const doc = await (window as unknown as Window).api.docs.getById(id)
            if (!cancelled && doc) {
              titles.set(id, doc.title)
            }
          } catch {
            // ignore fetch errors
          }
        })
      )
      if (!cancelled) {
        setDocTitles(titles)
      }
    }
    fetchTitles().then()
    return () => {
      cancelled = true
    }
  }, [entity])

  if (!entity) {
    return (
      <div
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          padding: 16,
          height: '100%'
        }}
      >
        <Empty description="点击图谱中的节点查看详情" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )
  }

  const relatedRelations = relations.filter(
    (r) => r.source_id === entity.id || r.target_id === entity.id
  )

  const aliases: string[] = entity.aliases
    ? (() => {
        try {
          return JSON.parse(entity.aliases)
        } catch {
          return []
        }
      })()
    : []

  const sourceDocIds: number[] = entity.source_note_ids
    ? (() => {
        try {
          return JSON.parse(entity.source_note_ids)
        } catch {
          return []
        }
      })()
    : []

  return (
    <div
      className="custom-scrollbar"
      style={{
        background: colorBgContainer,
        borderRadius: borderRadiusLG,
        padding: 16,
        height: '100%',
        overflowY: 'auto'
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: ENTITY_TYPE_COLORS[entity.type] || ENTITY_TYPE_COLORS.other,
                fontSize: 20
              }}
            >
              {ENTITY_ICONS[entity.type] || ENTITY_ICONS.other}
            </span>
            <Title level={5} style={{ margin: 0 }}>
              {entity.name}
            </Title>
          </div>
          {onClose && (
            <Text type="secondary" style={{ cursor: 'pointer', fontSize: 18 }} onClick={onClose}>
              ✕
            </Text>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <Tag color={ENTITY_TYPE_COLORS[entity.type]}>
            {ENTITY_TYPE_LABELS[entity.type] || entity.type}
          </Tag>
          {entity.confidence < 1 && <Tag>置信度: {(entity.confidence * 100).toFixed(0)}%</Tag>}
        </div>
      </div>

      {/* Description */}
      {entity.description && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>描述</Text>
          <Paragraph
            type="secondary"
            style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}
            ellipsis={{ rows: 4, expandable: true }}
          >
            {entity.description}
          </Paragraph>
        </div>
      )}

      {/* Aliases */}
      {aliases.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>别名</Text>
          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {aliases.map((alias) => (
              <Tag key={alias} color="default">
                {alias}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Source Docs */}
      {sourceDocIds.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong>来源文档 ({sourceDocIds.length})</Text>
          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {sourceDocIds.map((id) => (
              <Tag
                key={id}
                color="blue"
                style={{
                  cursor: onDocClick ? 'pointer' : 'default',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => onDocClick?.(id)}
              >
                {docTitles.get(id) || `文档 #${id}`}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Related Relations */}
      <div style={{ marginBottom: 16 }}>
        <Text strong>关联关系 ({relatedRelations.length})</Text>
        {relatedRelations.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {relatedRelations.map((rel) => {
              const isSource = rel.source_id === entity.id
              const otherId = isSource ? rel.target_id : rel.source_id
              const relLabel = RELATION_TYPE_LABELS[rel.relation_type] || rel.relation_type

              return (
                <div
                  key={`${rel.source_id}-${rel.target_id}-${rel.relation_type}`}
                  style={{ cursor: onRelationClick ? 'pointer' : 'default', padding: '6px 0' }}
                  onClick={() => onRelationClick?.(otherId)}
                >
                  <Text style={{ fontSize: 12 }}>
                    {isSource
                      ? entity.name
                      : entityNameMap.get(rel.source_id) || `#${rel.source_id}`}
                    <Text type="secondary"> --{relLabel}→ </Text>
                    {isSource
                      ? entityNameMap.get(rel.target_id) || `#${rel.target_id}`
                      : entity.name}
                  </Text>
                  {rel.description && (
                    <div style={{ marginTop: 2, fontSize: 11, color: '#999' }}>
                      {rel.description}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            暂无关联关系
          </Text>
        )}
      </div>

      {/* Metadata */}
      <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
        <Descriptions.Item label="创建时间">
          {new Date(entity.created_at).toLocaleString('zh-CN')}
        </Descriptions.Item>
        <Descriptions.Item label="更新时间">
          {new Date(entity.updated_at).toLocaleString('zh-CN')}
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}

export default EntityDetail
