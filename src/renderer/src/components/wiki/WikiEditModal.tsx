import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Input, Button, Space, Typography, Tag as AntTag } from 'antd'
import { Window } from '../../../resource/types/window'
import type { WikiEditModalProps } from '@renderer/types/components'
import { getTagsArray } from '@renderer/utils/document'

const { Text } = Typography

/* ── component ── */

const WikiEditModal: React.FC<WikiEditModalProps> = ({
  open,
  isNew,
  initialTitle = '',
  initialSummary = '',
  initialTags = '',
  initialImage = null,
  onSave,
  onCancel
}) => {
  const [title, setTitle] = useState(initialTitle)
  const [summary, setSummary] = useState(initialSummary)
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [image, setImage] = useState<string | null>(initialImage)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(initialTitle)
      setSummary(initialSummary)
      setEditTags(getTagsArray(initialTags))
      setTagInput('')
      setImage(initialImage)
    }
  }, [open, initialTitle, initialSummary, initialTags, initialImage])

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

  const handleSelectImage = async (): Promise<void> => {
    try {
      const result = await (window as unknown as Window).api.file.selectImageFile(true)
      if (result?.isImage) {
        setImage(result.dataUrl)
      }
    } catch (error) {
      console.error('Failed to select image:', error)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave({
        title,
        summary: summary || null,
        tags: editTags.length > 0 ? JSON.stringify(editTags) : null,
        image
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isNew ? '新建知识库' : '编辑知识库'}
      open={open}
      onOk={handleSave}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      styles={{ body: { maxHeight: 'calc(100vh - 300px)', padding: '0 6px', overflowY: 'auto' } }}
      classNames={{ body: 'custom-scrollbar' }}
    >
      <Space vertical style={{ width: '100%' }}>
        <Text strong>标题</Text>
        <Input placeholder="知识库标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Text strong>摘要</Text>
        <Input.TextArea
          placeholder="知识库摘要"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
        />
        <Text strong>标签</Text>
        {editTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {editTags.map((tag, index) => (
              <AntTag key={index} closable onClose={() => handleRemoveTag(tag)} color="processing">
                {tag}
              </AntTag>
            ))}
          </div>
        )}
        <Input
          placeholder="输入标签后按回车添加"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          allowClear
        />
        <Text strong>封面图片</Text>
        <Space>
          <Button type="default" onClick={handleSelectImage}>
            选择图片
          </Button>
          {image && (
            <Button type="default" danger onClick={() => setImage(null)}>
              移除图片
            </Button>
          )}
        </Space>
        {image && (
          <div style={{ maxHeight: 300, overflow: 'hidden', borderRadius: 8 }}>
            <img
              src={image}
              alt="封面"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}
      </Space>
    </Modal>
  )
}

export default WikiEditModal
