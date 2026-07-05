import React from 'react'
import { Modal, Empty } from 'antd'
import MarkdownView from './MarkdownView'
import { useTheme } from '@renderer/contexts/ThemeContext'

interface NoteItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  version: number
  created_at: string
  updated_at: string
  word_count: number
  content?: string | null
}

interface NotePreviewModalProps {
  open: boolean
  onCancel: () => void
  currentNote: NoteItem | null
}

const NotePreviewModal: React.FC<NotePreviewModalProps> = ({ open, onCancel, currentNote }) => {
  const { effectiveTheme } = useTheme()
  return (
    <Modal
      title={currentNote?.title || '笔记预览'}
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
          {currentNote?.content ? (
            <MarkdownView content={currentNote.content} isDarkMode={effectiveTheme === 'dark'} />
          ) : (
            <Empty description="暂无内容" />
          )}
        </div>
      </div>
    </Modal>
  )
}

export default NotePreviewModal
