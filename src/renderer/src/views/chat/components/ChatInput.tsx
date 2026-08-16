import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Button, Tooltip, Select } from 'antd'
import { RiArrowUpLine, RiAttachment2, RiCloseLine, RiStopFill } from '@remixicon/react'
import {
  OpenAIFilled,
  DeepSeekFilled,
  OllamaFilled,
  MistralFilled,
  AnthropicFilled,
  GeminiFilled
} from '@ant-design/icons'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'
import { baseKeymap } from '@tiptap/pm/commands'
import { keymap } from '@tiptap/pm/keymap'
import { TextSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import FileRef from './FileRefNode'
import type { Attachment } from '@renderer/types/chat'
import { Window } from '../../../../resource/types/window'

// TipTap 默认不加载标准键位绑定（退格/删除/回车等），必须显式加载 prosemirror-commands 的 baseKeymap
const BaseKeymap = Extension.create({
  name: 'baseKeymap',
  addProseMirrorPlugins() {
    return [keymap(baseKeymap)]
  }
})

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

// 自定义光标高度（px）：ProseMirror 的原生光标高度跟随行高（19px），
// 与普通输入框（≈字号高度）不一致，故隐藏原生光标、绘制固定高度光标。
// 与正文/占位符字号一致（14px），保证空内容时与提示文字同高同位。
// 如需微调高度改这里即可。
const CARET_HEIGHT = 14

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
  // 自定义光标元素（原生光标已隐藏，见 updateCaret）
  const caretRef = useRef<HTMLSpanElement | null>(null)

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

  // 外部回调走 ref：editor 只创建一次，避免 props 变化导致重建
  const onInputChangeRef = useRef(onInputChange)
  onInputChangeRef.current = onInputChange
  const onKeyDownRef = useRef(onKeyDown)
  onKeyDownRef.current = onKeyDown

  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      History,
      Placeholder.configure({ placeholder: '给 Rita 发送消息' }),
      BaseKeymap,
      FileRef
    ],
    content: '',
    editorProps: {
      // Enter 发送（Shift+Enter 由 HardBreak 处理换行）；输入法组合期间不拦截
      handleKeyDown: (view, event) => {
        if (event.isComposing || event.keyCode === 229) return false
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onKeyDownRef.current(event as unknown as React.KeyboardEvent<HTMLDivElement>)
          return true
        }
        // 光标紧贴文件引用 chip 时，退格/删除一次删掉（ProseMirror 默认是先选中再删）
        if ((event.key === 'Backspace' || event.key === 'Delete') && view.state.selection.empty) {
          const { $from } = view.state.selection
          const node = event.key === 'Backspace' ? $from.nodeBefore : $from.nodeAfter
          if (node && node.isAtom && node.type.name === 'fileRef') {
            event.preventDefault()
            const from = event.key === 'Backspace' ? $from.pos - node.nodeSize : $from.pos
            view.dispatch(view.state.tr.deleteRange(from, from + node.nodeSize))
            return true
          }
        }
        // 左右方向键直接跨过 chip（ProseMirror 对 selectable atom 默认是先选中再跳，
        // 需要按两下；这里在光标紧贴 chip 时一次跨过；Shift+方向键保留默认的选区扩展）
        if (
          !event.shiftKey &&
          (event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
          view.state.selection.empty
        ) {
          const { $from } = view.state.selection
          const node = event.key === 'ArrowRight' ? $from.nodeAfter : $from.nodeBefore
          if (node && node.isAtom && node.type.name === 'fileRef') {
            event.preventDefault()
            const delta = event.key === 'ArrowRight' ? node.nodeSize : -node.nodeSize
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.near(view.state.doc.resolve($from.pos + delta))
              )
            )
            return true
          }
        }
        return false
      },
      // 完全接管 drop：拖入的文件引用统一由容器 onDrop 插入 chip，
      // 避免 ProseMirror 默认把 text/plain 当文本插入造成双重插入
      handleDrop: () => true,
      // 粘贴强制纯文本：按 \n 拆行插入（换行用 hardBreak，保持 DOM 扁平）
      // 注意：不能使用 insertContent(数组)（会丢弃 hardBreak），必须走原生 tr.insert
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain')
        if (text === undefined) return false
        event.preventDefault()
        const ed = editorRef.current
        if (!ed || !text) return true
        const lines = text.replace(/\r\n?/g, '\n').split('\n')
        const content: ProseMirrorNode[] = []
        lines.forEach((line, i) => {
          if (i > 0) content.push(ed.schema.nodes.hardBreak.create())
          if (line) content.push(ed.schema.text(line))
        })
        let tr = ed.state.tr
        if (!ed.state.selection.empty) tr = tr.deleteSelection()
        tr = tr.insert(tr.selection.from, content)
        ed.view.dispatch(tr)
        return true
      }
    },
    onUpdate: ({ editor }) => {
      // textSerializers：hardBreak 输出换行、fileRef 输出路径，保证发送文本与所见一致
      // 注意：v3 的 serializer 参数是 { node } 对象，不是节点本身
      const text = editor
        .getText({
          blockSeparator: '\n',
          textSerializers: {
            hardBreak: () => '\n',
            fileRef: ({ node }) => node.attrs.path ?? ''
          }
        })
        .replace(/\n+$/, '')
      onInputChangeRef.current(text)
    }
  })
  editorRef.current = editor ?? null

  // ── 自定义光标：跟随 collapsed selection 的位置，固定 CARET_HEIGHT 高度 ──
  // 原生 contentEditable 光标高度 = 行高（19px），普通输入框光标 ≈ 字号（14px），
  // 用 caret-color: transparent 隐藏原生光标后，在此绘制固定高度光标。
  const updateCaret = useCallback(() => {
    const ed = editorRef.current
    const caret = caretRef.current
    if (!ed || !caret) return
    const el = ed.view.dom as HTMLDivElement

    const sel = window.getSelection()
    const show =
      document.activeElement === el &&
      !!sel &&
      sel.rangeCount > 0 &&
      sel.isCollapsed &&
      el.contains(sel.getRangeAt(0).commonAncestorContainer)
    if (!show) {
      caret.style.display = 'none'
      return
    }

    const range = sel.getRangeAt(0)
    const wrap = caret.parentElement
    if (!wrap) return
    const wrapRect = wrap.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 19
    // 空内容时定位到内容区左上角（首行行首），与占位符文字（同字号、垂直居中于行）对齐
    const caretAtContentStart = (): { top: number; left: number } => ({
      top: elRect.top - wrapRect.top + (lineHeight - CARET_HEIGHT) / 2,
      left: elRect.left - wrapRect.left
    })

    // 真正的"空文档"以 editor.isEmpty 为准
    const isEmpty = ed.isEmpty

    // 紧贴 inline atom（chip）后的 collapsed range，Chromium 会返回 0 高 rect，
    // 此时用 selection 前一个可测量元素（chip）的右缘定位光标
    const measurePrev = (r: Range): { right: number; top: number; height: number } | null => {
      const node = r.startContainer
      const offset = r.startOffset
      if (node.nodeType !== Node.ELEMENT_NODE) return null
      const children = node.childNodes
      for (let i = offset - 1; i >= 0; i--) {
        const c = children[i]
        if (c.nodeType === Node.TEXT_NODE) {
          if (c.textContent && c.textContent.length > 0) {
            const tr = document.createRange()
            tr.setStart(c, c.textContent.length)
            tr.collapse(true)
            const cr = tr.getBoundingClientRect()
            if (cr.height > 0) return { right: cr.left, top: cr.top, height: cr.height }
          }
        } else if (c instanceof HTMLElement) {
          const cr = c.getBoundingClientRect()
          if (cr.width > 0 || cr.height > 0) {
            return { right: cr.right, top: cr.top, height: cr.height }
          }
        }
      }
      return null
    }

    let top: number
    let left: number
    const rect = range.getBoundingClientRect()
    if (isEmpty) {
      const p = caretAtContentStart()
      top = p.top
      left = p.left
    } else if (rect.height > 0) {
      // 正常路径：用 selection rect，短光标垂直居中于行内
      top = rect.top - wrapRect.top
      if (rect.height > CARET_HEIGHT) {
        top += (rect.height - CARET_HEIGHT) / 2
      }
      left = rect.left - wrapRect.left
    } else {
      // rect 失效（紧贴 atom）：用前一个可测量元素（chip）的右缘
      const prev = measurePrev(range)
      if (prev) {
        top = prev.top - wrapRect.top + (prev.height - CARET_HEIGHT) / 2
        left = prev.right - wrapRect.left
      } else {
        const p = caretAtContentStart()
        top = p.top
        left = p.left
      }
    }
    caret.style.display = 'block'
    caret.style.top = `${Math.round(top)}px`
    caret.style.left = `${Math.round(left)}px`
  }, [])

  // 父组件清空 inputValue 时（发送后），同步清空编辑器
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    if (inputValue === '' && !ed.isEmpty) {
      ed.commands.clearContent()
      ed.commands.focus()
    }
    updateCaret()
  }, [inputValue, updateCaret])

  // 光标位置随选区/窗口尺寸变化而更新
  useEffect(() => {
    const onSelectionChange = (): void => updateCaret()
    const onResize = (): void => updateCaret()
    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('resize', onResize)
    updateCaret()
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      window.removeEventListener('resize', onResize)
    }
  }, [updateCaret])

  // 编辑器内部滚动时更新光标位置
  useEffect(() => {
    const ed = editor
    if (!ed) return
    const dom = ed.view.dom
    dom.addEventListener('scroll', updateCaret)
    return () => dom.removeEventListener('scroll', updateCaret)
  }, [editor, updateCaret])

  // ── 在光标位置插入文件引用 chip ──
  const insertFileRef = useCallback(
    (path: string) => {
      const ed = editorRef.current
      if (!ed) return
      ed.commands.focus()
      const cleanPath = path.replace(/\/+$/, '')
      const label = cleanPath.split('/').filter(Boolean).pop() || path
      const pos = ed.state.selection.from
      ed.commands.insertContent({ type: 'fileRef', attrs: { path, label } })
      // 显式把光标放到 chip 之后（inline atom 的 nodeSize 为 1）
      ed.commands.setTextSelection(pos + 1)
      // 刷新自定义光标：chip 是 React NodeView 异步渲染的，插入后立即读 rect
      // 会拿到占位宽度（0）导致光标位置偏前，必须等渲染完成（双 rAF）再刷新
      updateCaret()
      requestAnimationFrame(() => {
        updateCaret()
        requestAnimationFrame(updateCaret)
      })
    },
    [updateCaret]
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
      const path = e.dataTransfer.getData('text/plain')
      if (!path) return
      insertFileRef(path)
    },
    [insertFileRef]
  )

  // ── 点击输入区空白处聚焦并移光标到末尾（与普通输入框一致）──
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.view.dom.contains(e.target as Node)) return
    ed.commands.focus('end')
  }, [])

  const hasContent = inputValue.trim().length > 0

  // chip 主题色经 CSS 变量注入 FileRef NodeView
  const chipCssVars = useMemo(
    () =>
      ({
        '--file-chip-bg': isDarkMode ? '#1a2744' : '#eff6ff',
        '--file-chip-color': isDarkMode ? '#93c5fd' : '#1d4ed8',
        '--file-chip-border': isDarkMode ? '#1e3a5f' : '#bfdbfe'
      }) as React.CSSProperties,
    [isDarkMode]
  )

  return (
    <div
      className="rounded-2xl input-scrollbar"
      style={{
        background: colorBgLayout,
        border: `1px solid ${isDragOver ? '#4d6bfe' : colorBorder}`,
        transition: 'border-color 0.2s',
        ...chipCssVars
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* overflow hidden：光标滚出编辑区可视范围时被裁切 */}
      <div
        className="p-4 relative overflow-hidden"
        onClick={handleContainerClick}
        ref={textareaRef}
      >
        <EditorContent editor={editor} className="chat-input-editor" />
        {/* 自定义光标：固定高度、随光标位置移动、闪烁动画 */}
        <span
          ref={caretRef}
          className="chat-input-caret"
          style={{
            position: 'absolute',
            width: 2,
            height: CARET_HEIGHT,
            borderRadius: 1,
            background: colorText,
            pointerEvents: 'none',
            display: 'none',
            zIndex: 1
          }}
        />
        <style>{`
          .chat-input-editor .ProseMirror {
            outline: none;
            white-space: pre-wrap;
            word-break: break-word;
            min-height: 24px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 14px;
            line-height: 19px;
            caret-color: transparent;
          }
          .chat-input-editor .ProseMirror p { margin: 0; }
          .chat-input-editor .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            color: #bfbfbf;
            pointer-events: none;
            float: left;
            height: 0;
          }
          .chat-input-editor .ProseMirror::-webkit-scrollbar { width: 4px; }
          .chat-input-editor .ProseMirror::-webkit-scrollbar-track { background: transparent; }
          .chat-input-editor .ProseMirror::-webkit-scrollbar-thumb {
            background: rgba(128, 128, 128, 0.4);
            border-radius: 2px;
          }
          .file-ref-chip {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            font-size: 13px;
            line-height: 1;
            padding: 2px 4px;
            border-radius: 3px;
            vertical-align: -1px;
            margin: 0 1px;
            white-space: nowrap;
            cursor: default;
            user-select: none;
            background: var(--file-chip-bg);
            color: var(--file-chip-color);
            border: 1px solid var(--file-chip-border);
          }
          .file-ref-chip .file-ref-icon {
            display: inline-flex;
            align-items: center;
            flex-shrink: 0;
            line-height: 0;
          }
          .file-ref-chip .file-ref-label {
            max-width: 160px;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .file-ref-chip .file-ref-close {
            display: inline-flex;
            align-items: center;
            cursor: pointer;
            margin-left: 1px;
            line-height: 0;
            opacity: 0.7;
          }
          .file-ref-chip.ProseMirror-selectednode {
            box-shadow: 0 0 0 1px var(--file-chip-border);
          }
          .chat-input-caret {
            animation: chat-input-caret-blink 1.06s steps(1) infinite;
          }
          @keyframes chat-input-caret-blink {
            0%, 45% { opacity: 1; }
            50%, 95% { opacity: 0; }
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
