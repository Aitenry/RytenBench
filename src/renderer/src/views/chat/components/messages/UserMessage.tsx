import React from 'react'
import { Image, Tag } from 'antd'
import { RiAttachment2 } from '@remixicon/react'
import type { Message } from '@renderer/types/chat'

interface UserMessageProps {
  message: Message
  isDarkMode: boolean
  colorText: string
  colorBorderSecondary: string
}

const UserMessage: React.FC<UserMessageProps> = ({
  message,
  isDarkMode,
  colorText,
  colorBorderSecondary
}) => {
  const imageBlocks = message.blocks.filter((b) => b.type === 'image' && b.image_url)
  const documentBlocks = message.blocks.filter((b) => b.type === 'document' && b.fileName)

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
