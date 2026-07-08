import React from 'react'
import { Modal, Empty } from 'antd'
import MarkdownView from './MarkdownView'
import { useTheme } from '@renderer/contexts/useTheme'

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

interface DocPreviewModalProps {
  open: boolean
  onCancel: () => void
  currentDoc: DocItem | null
}

const DocPreviewModal: React.FC<DocPreviewModalProps> = ({ open, onCancel, currentDoc }) => {
  const { effectiveTheme } = useTheme()
  return (
    <Modal
      title={currentDoc?.title || '文档预览'}
      open={open}
      onCancel={onCancel}
      width="calc(100vw - 137px)"
      centered={true}
      mask={{ closable: false }}
      className="custom-container-scrollbar"
      styles={{ body: { height: 'calc(100vh - 205px)', overflow: 'auto' } }}
      footer={null}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {currentDoc?.content ? (
            <MarkdownView content={currentDoc.content} isDarkMode={effectiveTheme === 'dark'} />
          ) : (
            <Empty description="暂无内容" />
          )}
        </div>
      </div>
    </Modal>
  )
}

export default DocPreviewModal
