import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Button, Tag as AntTag } from 'antd'
import MarkdownEditor from '@renderer/components/markdown/MarkdownEditor'
import { Window } from '../../../resource/types/window'
import { getTagsArray } from '@renderer/utils/document'
import type { DocItem } from '@renderer/types/models'

export interface DocumentEditModalProps {
  open: boolean
  /** null means creating a new document */
  currentDoc: DocItem | null
  onClose: () => void
  onSave: (data: {
    title: string
    image: string | null
    summary: string | null
    content: string
    tags: string[]
  }) => Promise<void>
}

const DocumentEditModal: React.FC<DocumentEditModalProps> = ({
  open,
  currentDoc,
  onClose,
  onSave
}) => {
  const isNewDoc = currentDoc === null

  const [editTitle, setEditTitle] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState('')
  const [initialContent, setInitialContent] = useState('')

  // Sync state when modal opens or currentDoc changes
  useEffect(() => {
    if (open && currentDoc) {
      setEditTitle(currentDoc.title)
      setEditTags(getTagsArray(currentDoc.tags))
      setEditImage(currentDoc.image)
      setEditSummary(currentDoc.summary || '')
      setInitialContent(currentDoc.content || '')
    }
  }, [open, currentDoc])

  // Reset state for new document
  useEffect(() => {
    if (open && currentDoc === null) {
      setEditTitle('新文档')
      setEditTags([])
      setEditImage(null)
      setEditSummary('')
      setInitialContent('')
    }
  }, [open, currentDoc])

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter' && tagInput.trim()) {
        e.preventDefault()
        if (!editTags.includes(tagInput.trim())) {
          setEditTags([...editTags, tagInput.trim()])
        }
        setTagInput('')
      }
    },
    [tagInput, editTags]
  )

  const handleRemoveTag = useCallback(
    (tagToRemove: string): void => {
      setEditTags(editTags.filter((tag) => tag !== tagToRemove))
    },
    [editTags]
  )

  const handleSelectImage = useCallback(async (): Promise<void> => {
    try {
      const result = await (window as unknown as Window).api.file.selectImageFile(true)
      if (result?.isImage) {
        setEditImage(result.dataUrl)
      }
    } catch (error) {
      console.error('Failed to select image:', error)
    }
  }, [])

  const handleRemoveImage = useCallback((): void => {
    setEditImage(null)
  }, [])

  const handleEditorSave = useCallback(
    async (content: string): Promise<void> => {
      await onSave({
        title: editTitle || '新文档',
        image: editImage,
        summary: editSummary || null,
        content,
        tags: editTags
      })
    },
    [onSave, editTitle, editImage, editSummary, editTags]
  )

  return (
    <Modal
      title={isNewDoc ? '新建文档' : '编辑文档'}
      open={open}
      onCancel={onClose}
      width="calc(100vw - 137px)"
      centered={true}
      mask={{ closable: false }}
      styles={{
        body: { height: 'calc(100vh - 205px)', display: 'flex', flexDirection: 'row', gap: 16 }
      }}
      footer={null}
    >
      <div
        style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
          height: '100%',
          minHeight: 0
        }}
      >
        <Input
          placeholder="文档标题"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          size="large"
          style={{ fontWeight: 600, flexShrink: 0 }}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          {editTags.map((tag, index) => (
            <AntTag key={index} closable onClose={() => handleRemoveTag(tag)} color="processing">
              {tag}
            </AntTag>
          ))}
          <Input
            placeholder="输入标签后按回车添加"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            style={{ width: '100%' }}
            allowClear
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button type="default" onClick={handleSelectImage} block>
              上传图片
            </Button>
            {editImage && (
              <Button type="default" danger onClick={handleRemoveImage} block>
                移除图片
              </Button>
            )}
          </div>
          {editImage && (
            <div style={{ width: '100%', maxHeight: 200, overflow: 'hidden', borderRadius: 8 }}>
              <img
                src={editImage}
                alt="文档封面"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>
        <Input.TextArea
          placeholder="文档摘要"
          value={editSummary}
          onChange={(e) => setEditSummary(e.target.value)}
          style={{ flex: 1, minHeight: 0, resize: 'none' }}
          maxLength={500}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <MarkdownEditor initialValue={initialContent} onSave={handleEditorSave} />
      </div>
    </Modal>
  )
}

export default DocumentEditModal
