import React, { useCallback, useEffect, useState } from 'react'
import { Modal, Input, Button, Tag as AntTag, Typography } from 'antd'
import { theme } from 'antd'
import { Window } from '../../../../resource/types/window'
import { getTagsArray } from '@renderer/utils/document'

const { Text } = Typography

export interface DocPropertiesModalProps {
  open: boolean
  /** 当前文档元信息 */
  doc: { title: string; summary: string | null; tags: string | null; image: string | null } | null
  onClose: () => void
  /** 保存回调（仅元信息：标签/摘要/封面） */
  onSave: (data: { image: string | null; summary: string | null; tags: string[] }) => Promise<void>
}

/**
 * 文档属性小弹窗（标签 / 摘要 / 封面）。
 * 替代原来带编辑器的大弹窗——正文编辑已全部内联化。
 */
const DocPropertiesModal: React.FC<DocPropertiesModalProps> = ({ open, doc, onClose, onSave }) => {
  const { token } = theme.useToken()
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [editImage, setEditImage] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && doc) {
      setEditTags(getTagsArray(doc.tags))
      setEditImage(doc.image)
      setEditSummary(doc.summary ?? '')
      setTagInput('')
    }
  }, [open, doc])

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

  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave({
        image: editImage,
        summary: editSummary || null,
        tags: editTags
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }, [onSave, onClose, editImage, editSummary, editTags])

  return (
    <Modal
      title={doc?.title ? `属性 · ${doc.title}` : '文档属性'}
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={460}
      centered
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 标签 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            标签
          </Text>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
              padding: '8px 10px',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 8,
              background: token.colorFillQuaternary
            }}
          >
            {editTags.map((tag) => (
              <AntTag
                key={tag}
                closable
                onClose={() => handleRemoveTag(tag)}
                color="processing"
                style={{ margin: 0 }}
              >
                {tag}
              </AntTag>
            ))}
            <Input
              placeholder={editTags.length === 0 ? '输入标签后按回车添加' : '继续添加…'}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              variant="borderless"
              size="small"
              style={{ flex: 1, minWidth: 100 }}
            />
          </div>
        </div>

        {/* 封面 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            封面
          </Text>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Button type="default" onClick={handleSelectImage}>
              {editImage ? '更换图片' : '上传图片'}
            </Button>
            {editImage && (
              <Button type="default" danger onClick={() => setEditImage(null)}>
                移除图片
              </Button>
            )}
          </div>
          {editImage && (
            <div
              style={{
                width: '100%',
                maxHeight: 200,
                overflow: 'hidden',
                borderRadius: 8,
                marginTop: 8,
                border: `1px solid ${token.colorBorderSecondary}`
              }}
            >
              <img
                src={editImage}
                alt="文档封面"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}
        </div>

        {/* 摘要 */}
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            摘要
          </Text>
          <Input.TextArea
            placeholder="一句话描述这篇文档…"
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            maxLength={500}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </div>
      </div>
    </Modal>
  )
}

export default DocPropertiesModal
