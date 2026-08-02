import React, { useMemo } from 'react'
import { Input, Button, Tooltip, Select } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { RiArrowUpLine, RiAttachment2, RiCloseLine, RiStopFill } from '@remixicon/react'
import {
  OpenAIFilled,
  DeepSeekFilled,
  OllamaFilled,
  MistralFilled,
  AnthropicFilled,
  GeminiFilled
} from '@ant-design/icons'
import type { Attachment } from '@renderer/types/chat'
import { Window } from '../../../../resource/types/window'

const providerIconMap: Record<string, React.ComponentType<{ style?: React.CSSProperties }> | null> =
  {
    openai: OpenAIFilled,
    deepseek: DeepSeekFilled,
    ollama: OllamaFilled,
    mistral: MistralFilled,
    anthropic: AnthropicFilled,
    'google-genai': GeminiFilled,
    'google-vertexai': GeminiFilled
  }

const providerColors: Record<string, string> = {
  openai: '#10a37f',
  deepseek: '#4d6bfe',
  ollama: '#000000',
  openrouter: '#6366f1',
  mistral: '#f90',
  xai: '#1d9bf0',
  anthropic: '#d97757',
  'google-genai': '#4285f4',
  'google-vertexai': '#4285f4',
  groq: '#f55036'
}

interface ChatInputProps {
  inputValue: string
  onInputChange: (value: string) => void
  textareaRef: React.RefObject<TextAreaRef | null>
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  isLoading: boolean
  selectedProviderId: number | null
  onSelectProvider: (value: number) => void
  groupedProviderOptions: {
    label: string
    options: { value: number; label: string; providerType: string }[]
  }[]
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
  selectedProviderId,
  onSelectProvider,
  groupedProviderOptions,
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
  const selectedProviderType = useMemo(() => {
    if (selectedProviderId == null) return ''
    for (const group of groupedProviderOptions) {
      for (const opt of group.options) {
        if (opt.value === selectedProviderId) return opt.providerType
      }
    }
    return ''
  }, [selectedProviderId, groupedProviderOptions])

  const SelectedIcon = providerIconMap[selectedProviderType]
  const selectedColor = providerColors[selectedProviderType] || undefined

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
          <Select
            size="small"
            value={selectedProviderId}
            onChange={(value) => onSelectProvider(value)}
            style={{ minWidth: 140, padding: '5px', borderRadius: '10px' }}
            placeholder="选择模型"
            showSearch={{
              filterOption: (input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
            }}
            popupMatchSelectWidth={false}
            popupStyle={{ minWidth: 260 }}
            labelRender={(props) => (
              <span className="flex items-center gap-1.5">
                {SelectedIcon ? (
                  <SelectedIcon style={{ fontSize: 14, color: selectedColor }} />
                ) : selectedProviderType ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: `${providerColors[selectedProviderType] || '#888'}20`,
                      color: providerColors[selectedProviderType] || '#888',
                      fontSize: 9,
                      fontWeight: 600,
                      flexShrink: 0
                    }}
                  >
                    {selectedProviderType.charAt(0).toUpperCase()}
                  </span>
                ) : null}
                {props.label}
              </span>
            )}
            optionRender={(option) => {
              const providerType = (option.data as { providerType?: string })?.providerType ?? ''
              const Icon = providerIconMap[providerType]
              const color = providerColors[providerType] || '#888'
              return (
                <div className="flex items-center gap-2">
                  {Icon ? (
                    <Icon style={{ fontSize: 18, color }} />
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: `${color}18`,
                        color,
                        fontSize: 10,
                        fontWeight: 600,
                        flexShrink: 0
                      }}
                    >
                      {providerType.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span>{option.label as string}</span>
                </div>
              )
            }}
            options={groupedProviderOptions}
          />
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
