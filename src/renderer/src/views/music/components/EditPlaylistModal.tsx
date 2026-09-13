import React, { useState, useEffect } from 'react'
import { theme, Modal, Input, Form } from 'antd'
import { RiMusic2Line, RiCameraLine } from '@remixicon/react'
import { useTranslation } from '@renderer/i18n'
import type { EditPlaylistModalProps } from '@renderer/types/components'

const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  open,
  folder,
  onClose,
  onSaved
}) => {
  const { t } = useTranslation()
  const {
    token: { colorFillAlter, colorTextTertiary }
  } = theme.useToken()

  const [form] = Form.useForm()
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (folder) {
      form.setFieldsValue({
        name: folder.name,
        description: folder.description
      })
      setCoverDataUrl(folder.coverDataUrl)
    }
  }, [folder, form])

  const handleOk = async (): Promise<void> => {
    if (!folder) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await window.api.music.updateFolder(folder.id, {
        name: values.name.trim(),
        description: values.description?.trim() || null
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = (): void => {
    onClose()
  }

  const handleChangeCover = async (): Promise<void> => {
    if (!folder) return
    try {
      const newCover = await window.api.music.updateFolderCover(folder.id)
      if (newCover) {
        setCoverDataUrl(newCover)
      }
    } catch {
      // ignore
    }
  }

  return (
    <Modal
      title={t('music.playlist.editTitle')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText={t('common.action.save')}
      cancelText={t('common.action.cancel')}
      confirmLoading={saving}
    >
      {/* 封面 — 点击更换，hover 显示遮罩 */}
      <div className="flex justify-center mb-5">
        <div
          className="relative w-28 h-28 rounded-lg overflow-hidden cursor-pointer group/cover flex-shrink-0"
          style={{ background: colorFillAlter }}
          onClick={handleChangeCover}
        >
          {coverDataUrl ? (
            <img src={coverDataUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <RiMusic2Line size={36} style={{ color: colorTextTertiary }} />
            </div>
          )}
          {/* hover 遮罩 */}
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1 opacity-0 group-hover/cover:opacity-100 transition-opacity">
            <RiCameraLine size={22} className="text-white" />
            <span className="text-xs text-white">{t('music.playlist.coverChange')}</span>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={t('music.playlist.nameLabel')}
          rules={[
            {
              required: true,
              message: t('common.message.pleaseInput', { field: t('music.playlist.nameLabel') })
            }
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="description" label={t('music.playlist.descriptionLabel')}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default EditPlaylistModal
