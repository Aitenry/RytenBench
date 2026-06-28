import React from 'react'
import { Modal, Progress, Typography, Space, Tag } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

const { Text } = Typography

interface BuildProgressProps {
  open: boolean
  phase: string
  processedNotes: number
  totalNotes: number
  message: string
  onCancel?: () => void
}

const PHASE_LABELS: Record<string, string> = {
  cleanup: '清理数据',
  collect: '收集笔记',
  extract_entities: '抽取实体',
  merge_entities: '消歧合并',
  save_entities: '保存实体',
  extract_relations: '抽取关系',
  save_relations: '保存关系'
}

const BuildProgress: React.FC<BuildProgressProps> = ({
  open,
  phase,
  processedNotes,
  totalNotes,
  message,
  onCancel
}) => {
  const percent = totalNotes > 0 ? Math.round((processedNotes / totalNotes) * 100) : 0
  const phaseLabel = PHASE_LABELS[phase] || phase

  return (
    <Modal
      title={
        <Space>
          <LoadingOutlined />
          <span>构建知识图谱</span>
        </Space>
      }
      open={open}
      footer={null}
      closable={!!onCancel}
      onCancel={onCancel}
      mask={{ closable: false }}
      width={420}
    >
      <div style={{ padding: '16px 0' }}>
        <Progress
          percent={percent}
          status="active"
          strokeColor="#1677ff"
          style={{ marginBottom: 16 }}
        />

        <div style={{ marginBottom: 12 }}>
          <Tag color="processing">{phaseLabel}</Tag>
        </div>

        <Text type="secondary" style={{ fontSize: 13 }}>
          {message}
        </Text>

        {totalNotes > 0 && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已处理 {processedNotes}/{totalNotes} 篇笔记
            </Text>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default BuildProgress
