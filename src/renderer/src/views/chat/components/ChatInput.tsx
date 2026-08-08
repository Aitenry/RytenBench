import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { Button, Tooltip, Select } from 'antd'
import {
  RiArrowUpLine,
  RiAttachment2,
  RiCloseLine,
  RiStopFill,
  RiFileLine,
  RiFolder3Line
} from '@remixicon/react'
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
  textareaRef: React.RefObject<HTMLDivElement | null>
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
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

/** 从 contentEditable div 提取纯文本，chip 取其 data-path */
const extractPlainText = (el: HTMLDivElement): string => {
  let text = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    } else if (node instanceof HTMLBRElement) {
      text += '\n'
    } else if (node instanceof HTMLDivElement) {
      // block-level divs created by Enter key
      walk(node)
      text += '\n'
    } else if (node instanceof HTMLElement) {
      if (node.dataset.path) {
        text += node.dataset.path
      } else {
        node.childNodes.forEach(walk)
      }
    }
  }
  el.childNodes.forEach(walk)
  return text.replace(/\n+$/, '')
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
  const [isDragOver, setIsDragOver] = useState(false)

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

  // ── 同步纯文本到父组件 ──
  const syncText = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    onInputChange(extractPlainText(el))
  }, [onInputChange, textareaRef])

  // 父组件清空 inputValue 时（发送后），同步清空 contentEditable
  useEffect(() => {
    if (inputValue === '' && textareaRef.current) {
      const el = textareaRef.current
      if (el.textContent !== '') {
        el.innerHTML = ''
      }
    }
  }, [inputValue, textareaRef])

  // ── Chip 样式 ──
  const chipBg = isDarkMode ? '#1a2744' : '#eff6ff'
  const chipColor = isDarkMode ? '#93c5fd' : '#1d4ed8'
  const chipBorder = isDarkMode ? '#1e3a5f' : '#bfdbfe'

  // ── 在光标位置插入 chip ──
  const insertChipAtCursor = useCallback(
    (path: string) => {
      const el = textareaRef.current
      if (!el) return
      el.focus()

      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return

      const range = selection.getRangeAt(0)
      if (!el.contains(range.commonAncestorContainer)) {
        range.selectNodeContents(el)
        range.collapse(false)
      }

      // 提取显示名称：路径最后一段
      const cleanPath = path.replace(/\/$/, '')
      const segments = cleanPath.split('/')
      const displayName = segments[segments.length - 1] || path

      // 创建 chip DOM
      const chip = document.createElement('span')
      chip.contentEditable = 'false'
      chip.dataset.path = path
      chip.title = path
      chip.setAttribute(
        'style',
        [
          'display:inline-flex',
          'align-items:center',
          'gap:2px',
          'font-size:13px',
          'line-height:1',
          'padding: 4px',
          'border-radius:3px',
          'vertical-align:middle',
          'margin:0 1px',
          'white-space:nowrap',
          'cursor:default',
          'user-select:none',
          `background:${chipBg}`,
          `color:${chipColor}`,
          `border:1px solid ${chipBorder}`
        ].join(';')
      )

      const isDir = path.endsWith('/') || !path.includes('.')
      const icon = document.createElement('span')
      icon.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;line-height:0'
      icon.innerHTML = isDir
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12.414 5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H10.414L12.414 5Z"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8L9.00319 2H19.9978C20.5513 2 21 2.45531 21 2.99078V21.0092C21 21.556 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5501 3 20.9932V8ZM10 4V9H5V20H19V4H10Z"/></svg>'

      const text = document.createElement('span')
      text.style.cssText = 'max-width:160px;overflow:hidden;text-overflow:ellipsis'
      text.textContent = displayName

      const closeBtn = document.createElement('span')
      closeBtn.style.cssText =
        'display:inline-flex;align-items:center;cursor:pointer;margin-left:1px;line-height:0;opacity:0.7'
      closeBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.586L17.95 4.636L19.364 6.05L13.414 12L19.364 17.95L17.95 19.364L12 13.414L6.05 19.364L4.636 17.95L10.586 12L4.636 6.05L6.05 4.636L12 10.586Z"/></svg>'
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        chip.remove()
        syncText()
        el.focus()
      })

      chip.appendChild(icon)
      chip.appendChild(text)
      chip.appendChild(closeBtn)

      // 插入到光标位置
      range.deleteContents()
      range.insertNode(chip)

      // 在 chip 后面插入一个空格，光标移到空格后
      const space = document.createTextNode('\u00A0')
      range.setStartAfter(chip)
      range.collapse(true)
      range.insertNode(space)

      range.setStartAfter(space)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)

      syncText()
    },
    [textareaRef, chipBg, chipColor, chipBorder, syncText]
  )

  // ── 拖拽处理 ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const relativePath = e.dataTransfer.getData('text/plain')
      if (!relativePath) return
      insertChipAtCursor(relativePath)
    },
    [insertChipAtCursor]
  )

  // ── 键盘处理：Enter 发送，Shift+Enter 换行 ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onKeyDown(e)
      } else {
        onKeyDown(e)
      }
    },
    [onKeyDown]
  )

  // ── 点击 chip 关闭按钮时移除 chip ──
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const chip = target.closest('[data-path]') as HTMLElement | null
      if (chip && target.closest('[data-close]')) {
        e.preventDefault()
        chip.remove()
        syncText()
        textareaRef.current?.focus()
      }
    },
    [syncText, textareaRef]
  )

  const hasContent = inputValue.trim().length > 0

  return (
    <div
      className="rounded-2xl input-scrollbar"
      style={{
        background: colorBgLayout,
        border: `1px solid ${isDragOver ? '#4d6bfe' : colorBorder}`,
        transition: 'border-color 0.2s'
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-4">
        <div
          ref={textareaRef}
          contentEditable
          suppressContentEditableWarning
          className="outline-none whitespace-pre-wrap break-words overflow-y-auto"
          style={{
            color: colorText,
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
            minHeight: '24px',
            maxHeight: '200px',
            fontSize: '14px',
            lineHeight: '19px'
          }}
          data-placeholder="给 Rita 发送消息"
          onInput={syncText}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onBlur={syncText}
        />
        <style>{`
          [data-placeholder]:empty::before {
            content: attr(data-placeholder);
            color: #bfbfbf;
            pointer-events: none;
          }
        `}</style>
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
              disabled={!hasContent}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInput