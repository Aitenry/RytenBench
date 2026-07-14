import React, { useState } from 'react'
import { theme, Button, Table, Empty, Modal, Form, Input, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  RiMusic2Line,
  RiDeleteBinLine,
  RiPencilLine,
  RiCameraLine,
  RiHeartLine,
  RiHeartFill
} from '@remixicon/react'
import { formatTime } from '../../../utils/formatTime'
import type { Track } from '../../../types/music'
import type { PlaylistTableProps } from '@renderer/types/components'

const PlaylistTable: React.FC<PlaylistTableProps> = ({
  tracks,
  currentIndex,
  onPlay,
  onRemove,
  onUpdate,
  onToggleLike
}) => {
  const {
    token: { colorFillAlter, colorTextTertiary }
  } = theme.useToken()

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [editForm] = Form.useForm()
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  const handleEdit = (track: Track, e: React.MouseEvent): void => {
    e.stopPropagation()
    setEditingTrack(track)
    setCoverPreview(track.coverDataUrl)
    editForm.setFieldsValue({
      title: track.title,
      artist: track.artist,
      album: track.album || ''
    })
    setEditModalOpen(true)
  }

  const handleChangeCover = async (): Promise<void> => {
    if (!editingTrack) return
    const newCover = await window.api.music.updateTrackCover(Number(editingTrack.id))
    if (newCover) {
      setCoverPreview(newCover)
      message.success('封面已更新')
      onUpdate()
    }
  }

  const handleEditSave = async (): Promise<void> => {
    try {
      const values = await editForm.validateFields()
      if (!editingTrack) return
      await window.api.music.updateTrack(Number(editingTrack.id), {
        title: values.title,
        artist: values.artist,
        album: values.album || ''
      })
      message.success('歌曲信息已更新')
      setEditModalOpen(false)
      onUpdate()
    } catch {
      // validation failed — ignore
    }
  }

  const columns: ColumnsType<Track> = [
    {
      title: '',
      dataIndex: 'coverDataUrl',
      key: 'cover',
      width: 48,
      render: (coverDataUrl: string | null) => (
        <div
          className="w-8 h-8 rounded overflow-hidden flex items-center justify-center"
          style={{ background: colorFillAlter }}
        >
          {coverDataUrl ? (
            <img src={coverDataUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <RiMusic2Line size={16} style={{ color: colorTextTertiary }} />
          )}
        </div>
      )
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, _record: Track, index: number) => (
        <span className={currentIndex === index ? 'text-blue-500 font-medium' : ''}>{title}</span>
      )
    },
    {
      title: '艺术家',
      dataIndex: 'artist',
      key: 'artist',
      ellipsis: true,
      responsive: ['md']
    },
    {
      title: '专辑',
      dataIndex: 'album',
      key: 'album',
      ellipsis: true,
      responsive: ['lg']
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 70,
      render: (d: number) => (
        <span className="text-xs" style={{ color: colorTextTertiary }}>
          {formatTime(d)}
        </span>
      )
    },
    {
      title: '',
      key: 'actions',
      width: 96,
      render: (_: unknown, record: Track, index: number) => (
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onToggleLike && (
            <Button
              type="text"
              size="small"
              icon={
                record.liked ? (
                  <RiHeartFill size={14} className="text-[#1677ff]" />
                ) : (
                  <RiHeartLine size={14} />
                )
              }
              onClick={(e) => {
                e.stopPropagation()
                onToggleLike(record.id)
              }}
            />
          )}
          <Button
            type="text"
            size="small"
            icon={<RiPencilLine size={14} />}
            onClick={(e) => handleEdit(record, e)}
          />
          <Button
            type="text"
            size="small"
            icon={<RiDeleteBinLine size={14} />}
            onClick={(e) => {
              e.stopPropagation()
              onRemove(index)
            }}
          />
        </span>
      )
    }
  ]

  if (tracks.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center"
        style={{ color: colorTextTertiary }}
      >
        <RiMusic2Line size={64} />
        <p className="mt-4 text-lg">暂无音乐</p>
        <p className="mt-1 text-sm">选择歌单后开始播放</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4">
      <Table
        columns={columns}
        dataSource={tracks}
        rowKey="id"
        size="small"
        pagination={false}
        showHeader={true}
        scroll={{ y: 'calc(100vh - 480px)' }}
        onRow={(_record, index) => ({
          onClick: () => index !== undefined && onPlay(index),
          className: `cursor-pointer group ${currentIndex === index ? 'bg-blue-50/50' : ''}`,
          style: { cursor: 'pointer' }
        })}
        locale={{ emptyText: <Empty description="暂无曲目" /> }}
      />

      <Modal
        title="编辑歌曲信息"
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {/* 封面 — 点击更换，hover 显示遮罩 */}
        <div className="flex justify-center mb-5">
          <div
            className="relative w-28 h-28 rounded-lg overflow-hidden cursor-pointer group/cover flex-shrink-0"
            style={{ background: colorFillAlter }}
            onClick={handleChangeCover}
          >
            {coverPreview ? (
              <img src={coverPreview} alt="" className="w-full h-full object-cover" />
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

        <Form form={editForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="artist"
            label="艺术家"
            rules={[{ required: true, message: '请输入艺术家' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="album" label="专辑">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PlaylistTable
