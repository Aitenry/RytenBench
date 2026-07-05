import React, { useState, useEffect } from 'react'
import { theme, Modal, Input, Form } from 'antd'
import { RiMusic2Line, RiCameraLine } from '@remixicon/react'
import type { MusicFolder } from '../../../types/music'

interface Props {
  open: boolean
  folder: MusicFolder | null
  onClose: () => void
  onSaved: () => void
}

const EditPlaylistModal: React.FC<Props> = ({ open, folder, onClose, onSaved }) => {
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
      title="编辑歌单"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
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
            <span className="text-xs text-white">更换封面</span>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="歌单名称"
          rules={[{ required: true, message: '请输入歌单名称' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default EditPlaylistModal
