import React from 'react'
import { Image, Tag } from 'antd'
import { RiAttachment2, RiFlag2Line } from '@remixicon/react'
import type { Message } from '@renderer/types/chat'

interface UserMessageProps {
  message: Message
  isDarkMode: boolean
  colorText: string
  colorTextSecondary: string
  colorBorderSecondary: string
}

const UserMessage: React.FC<UserMessageProps> = ({
  message,
  isDarkMode,
  colorText,
  colorTextSecondary,
  colorBorderSecondary
}) => {
  const imageBlocks = message.blocks.filter((b) => b.type === 'image' && b.image_url)
  const documentBlocks = message.blocks.filter((b) => b.type === 'document' && b.fileName)
  // 目标自动续跑轮：渲染为居中的自动运行横幅（非普通用户气泡）
  const goalRoundBlock = message.blocks.find((b) => b.type === 'goalRound')

  if (goalRoundBlock) {
    return (
      <div className="flex justify-center mb-6">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 12,
            border: `1px dashed ${colorBorderSecondary}`,
            color: colorTextSecondary,
            fontSize: 12
          }}
        >
          <RiFlag2Line size={13} />
          <span>目标自动续跑 · 第 {goalRoundBlock.round ?? '?'} 轮</span>
          <span style={{ opacity: 0.75 }}>—</span>
          <span
            style={{
              maxWidth: 360,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {(message.content.split('\n')[1] ?? '').replace(/^目标：/, '')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end mb-6">
      <div className="max-w-[80%]">
        <div
          style={{
            background: isDarkMode ? '#1a3a5c' : '#edf3fe',
            color: colorText
          }}
          className="px-5 py-3 rounded-2xl rounded-br-sm"
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        {imageBlocks.length > 0 && (
          <Image.PreviewGroup items={imageBlocks.map((b) => b.image_url!)}>
            <div className="flex gap-2 mt-2 justify-end flex-wrap">
              {imageBlocks.map((b, idx) => (
                <Image
                  key={idx}
                  src={b.image_url}
                  alt={`user-img-${idx}`}
                  className="max-w-[200px] max-h-[200px] object-cover rounded-lg"
                  style={{ border: `1px solid ${colorBorderSecondary}` }}
                  classNames={{ cover: 'rounded-lg' }}
                />
              ))}
            </div>
          </Image.PreviewGroup>
        )}
        {documentBlocks.length > 0 && (
          <div className="flex gap-2 mt-2 justify-end flex-wrap">
            {documentBlocks.map((b, idx) => (
              <Tag key={idx} color="blue" className="px-3 py-1 text-sm rounded-lg">
                <div className="inline-flex items-center py-1 gap-1">
                  <RiAttachment2 size={14} /> <span>{b.fileName}</span>
                </div>
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default UserMessage
