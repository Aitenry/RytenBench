import React from 'react'
import { Modal, Empty } from 'antd'
import MarkdownView from '@renderer/components/markdown/MarkdownView'
import { useTheme } from '@renderer/contexts/useTheme'
import type { DocPreviewModalProps } from '@renderer/types/components'

const DocumentPreviewModal: React.FC<DocPreviewModalProps> = ({ open, onCancel, currentDoc }) => {
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

export default DocumentPreviewModal
