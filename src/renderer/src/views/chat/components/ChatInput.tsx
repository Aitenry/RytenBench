import React from 'react'
import { Input, Button, Tooltip, Select, Tag } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { RiArrowUpLine, RiAttachment2, RiCloseLine, RiStopFill } from '@remixicon/react'
import { toolIconMap } from './ChatConstants'
import type { Attachment } from '@renderer/types/chat'
import type { ToolInfo } from '../../../../resource/types/window'
import { Window } from '../../../../resource/types/window'

interface ChatInputProps {
  inputValue: string
  onInputChange: (value: string) => void
  textareaRef: React.RefObject<TextAreaRef | null>
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  isLoading: boolean
  selectedTools: string[]
  onSelectedToolsChange: (tools: string[]) => void
  availableTools: ToolInfo[]
  modelSupportsTools: boolean
  modelSupportsVision: boolean
  isDarkMode: boolean
  colorBgLayout: string
  colorBorder: string
  colorText: string
  colorBorderSecondary: string
  onSend: () => void
  onStop: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

const ChatInput: React.FC<ChatInputProps> = ({
  inputValue,
  onInputChange,
  textareaRef,
  attachments,
  onAttachmentsChange,
  isLoading,
  selectedTools,
  onSelectedToolsChange,
  availableTools,
  modelSupportsTools,
  modelSupportsVision,
  isDarkMode,
  colorBgLayout,
  colorBorder,
  colorText,
  colorBorderSecondary,
  onSend,
  onStop,
  onKeyDown
}) => {
  return (
    <div
      className="rounded-2xl input-scrollbar"
      style={{
        background: colorBgLayout,
        border: `1px solid ${colorBorder}`
      }}
    >
      <div className="p-4">
        <Input.TextArea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="给 Rita 发送消息"
          autoSize={{ minRows: 1, maxRows: 8 }}
          style={{ color: colorText }}
          styles={{
            textarea: {
              backgroundColor: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: 0,
              minHeight: '24px',
              maxHeight: '200px'
            }
          }}
        />
      </div>
      {attachments.length > 0 && (
        <div className="flex gap-2 px-4 pb-3 flex-wrap">
          {attachments.map((att, idx) =>
            att.isImage ? (
              <div key={idx} className="relative group">
                <img
                  src={att.dataUrl}
                  alt={`upload-${idx}`}
                  className="w-16 h-16 object-cover rounded-lg"
                  style={{ border: `1px solid ${colorBorderSecondary}` }}
                />
                <button
                  onClick={() => onAttachmentsChange(attachments.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <RiCloseLine size={12} />
                </button>
              </div>
            ) : (
              <div
                key={idx}
                className="relative group flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                style={{
                  background: isDarkMode ? '#1a2744' : '#eff6ff',
                  color: isDarkMode ? '#93c5fd' : '#1d4ed8',
                  border: isDarkMode ? '1px solid #1e3a5f' : '1px solid #bfdbfe'
                }}
              >
                <span className="max-w-[120px] truncate">{att.fileName}</span>
                <button
                  onClick={() => onAttachmentsChange(attachments.filter((_, i) => i !== idx))}
                  className="ml-1 hover:text-red-500"
                  style={{ color: isDarkMode ? '#60a5fa' : '#60a5fa' }}
                >
                  <RiCloseLine size={14} />
                </button>
              </div>
            )
          )}
        </div>
      )}
      <div className="flex items-center justify-between px-4 pb-4">
        <div className="flex items-center gap-2">
          <Tooltip title={modelSupportsVision ? '上传附件（含图片）' : '上传附件（不含图片）'}>
            <Button
              type="dashed"
              shape="circle"
              icon={<RiAttachment2 size={16} />}
              onClick={async () => {
                const result = await (window as unknown as Window).api.file.selectImageFile(
                  modelSupportsVision
                )
                if (result) {
                  onAttachmentsChange([
                    ...attachments,
                    {
                      dataUrl: result.dataUrl,
                      fileName: result.fileName,
                      isImage: result.isImage
                    }
                  ])
                }
              }}
            />
          </Tooltip>
          <Tooltip
            title={
              modelSupportsTools
                ? '选择工具'
                : '当前模型不支持工具调用，请切换至支持 Tools 标签的模型'
            }
          >
            <Select
              mode="multiple"
              placeholder="选择工具"
              value={selectedTools}
              onChange={onSelectedToolsChange}
              style={{ minWidth: 140, padding: '6px', borderRadius: '10px' }}
              size="small"
              allowClear
              disabled={!modelSupportsTools}
              maxTagCount={1}
              maxTagPlaceholder={(omitted) => <span>+{omitted.length}</span>}
              optionRender={(option) => {
                const tool = availableTools.find((t) => t.name === option.value)
                if (!tool) return option.label as React.ReactNode
                return (
                  <div className="flex items-center gap-2">
                    <span style={{ color: tool.color }}>{toolIconMap[tool.icon]}</span>
                    <span>{tool.label}</span>
                  </div>
                )
              }}
              tagRender={(props) => {
                const tool = availableTools.find((t) => t.name === props.value)
                const { label, closable, onClose } = props
                return (
                  <Tag
                    closable={closable}
                    onClose={onClose}
                    style={{
                      marginInlineEnd: 4,
                      background: tool ? `${tool.color}12` : undefined,
                      border: tool ? `1px solid ${tool.color}30` : undefined,
                      color: tool?.color,
                      borderRadius: 12,
                      paddingInline: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ marginRight: 4 }}>{tool ? toolIconMap[tool.icon] : null}</span>
                    {label}
                  </Tag>
                )
              }}
              options={availableTools.map((t) => ({
                value: t.name,
                label: t.label,
                icon: t.icon,
                color: t.color
              }))}
            />
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Tooltip title="停止生成">
              <Button
                type="primary"
                danger
                shape="circle"
                icon={<RiStopFill size={16} />}
                onClick={onStop}
              />
            </Tooltip>
          ) : (
            <Button
              type="primary"
              shape="circle"
              icon={<RiArrowUpLine size={16} />}
              onClick={onSend}
              disabled={!inputValue.trim()}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInput
