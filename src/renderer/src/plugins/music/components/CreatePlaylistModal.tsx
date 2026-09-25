import React, { useState } from 'react'
import { theme, Modal, Input, Form } from 'antd'
import { RiMusic2Line, RiCameraLine } from '@remixicon/react'
import { useTranslation } from '@renderer/i18n'
import type { CreatePlaylistModalProps } from '@renderer/types/components'

const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({ open, onClose, onCreated }) => {
  const { t } = useTranslation()
  const {
    token: { colorFillAlter, colorTextTertiary }
  } = theme.useToken()

  const [form] = Form.useForm()
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const handleChangeCover = async (): Promise<void> => {
    try {
      const dataUrl = await window.api.music.selectImage()
      if (dataUrl) {
        setCoverDataUrl(dataUrl)
      }
    } catch {
      // ignore
    }
  }

  const handleOk = async (): Promise<void> => {
    const values = await form.validateFields()
    if (!values.name.trim()) return
    setCreating(true)
    try {
      await onCreated({
        name: values.name.trim(),
        description: values.description?.trim() || '',
        coverDataUrl
      })
      form.resetFields()
      setCoverDataUrl(null)
      onClose()
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = (): void => {
    form.resetFields()
    setCoverDataUrl(null)
    onClose()
  }

  return (
    <Modal
      title={t('music.playlist.createTitle')}
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      okText={t('common.action.create')}
      cancelText={t('common.action.cancel')}
      confirmLoading={creating}
    >
      {/* 封面 — 点击上传，hover 显示遮罩 */}
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
            <span className="text-xs text-white">
              {t(coverDataUrl ? 'music.playlist.coverChange' : 'music.playlist.coverAdd')}
            </span>
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
          <Input placeholder={t('music.playlist.namePlaceholder')} />
        </Form.Item>
        <Form.Item name="description" label={t('music.playlist.descriptionLabel')}>
          <Input.TextArea placeholder={t('music.playlist.descriptionPlaceholder')} rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreatePlaylistModal
