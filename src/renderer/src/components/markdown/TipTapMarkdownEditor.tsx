import React, { useCallback, useEffect, useRef, useState } from 'react'
import { theme, Dropdown, Tooltip } from 'antd'
import type { GlobalToken } from 'antd'
import { useEditor, EditorContent, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { NodeSelection } from '@tiptap/pm/state'
import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiArrowDropDownLine,
  RiBold,
  RiItalic,
  RiUnderline,
  RiStrikethrough,
  RiCodeLine,
  RiMarkPenLine,
  RiLink,
  RiLinkUnlinkM,
  RiDoubleQuotesL,
  RiListUnordered,
  RiListOrdered,
  RiCheckboxLine,
  RiCodeBoxLine,
  RiSeparator,
  RiFormatClear
} from '@remixicon/react'
import { buildMarkdownEditorExtensions, getMarkdownSafe } from './markdownExtensions'
import { buildSlashMenuExtension } from './slash-menu'
import type { SlashMenuTheme } from './slash-menu'
import 'katex/dist/katex.min.css'
import './tiptap-content.css'

export interface TipTapMarkdownEditorProps {
  /** Markdown 源文本（外部更新时同步进编辑器） */
  value?: string
  /** 每次内容变更回调（Markdown 文本） */
  onChange?: (markdown: string) => void
  /** Ctrl+S 保存回调 */
  onSave?: (markdown: string) => void
  placeholder?: string
  readOnly?: boolean
  /** 编辑器实例就绪回调（用于大纲提取等外部联动） */
  onReady?: (editor: Editor) => void
  /** 正文滚动容器引用（用于大纲滚动同步） */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  autofocus?: boolean | 'end'
  showToolbar?: boolean
  className?: string
}

/* ──────────── 图片文件 → dataURL（压缩控制体积） ──────────── */

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read file failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load image failed'))
    img.src = src
  })
}

const MAX_IMAGE_SIZE = 1600

/**
 * 图片压缩策略：
 * - GIF 原样保留（canvas 只能取首帧，不压缩）
 * - PNG（截图）：超宽才等比缩小，保持 PNG 保证文字清晰
 * - JPEG/WebP 等：超宽等比缩小，统一转 JPEG q0.85 压体积
 */
async function compressImageFile(file: File): Promise<string | null> {
  try {
    if (file.type === 'image/gif') {
      return await readFileAsDataUrl(file)
    }
    const raw = await readFileAsDataUrl(file)
    const img = await loadImage(raw)
    let { width, height } = img
    const ratio = Math.min(1, MAX_IMAGE_SIZE / Math.max(width, height))
    if (ratio >= 1) {
      return file.type === 'image/png' ? raw : compressToJpeg(img, width, height)
    }
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, width, height)
    if (file.type === 'image/png') {
      return canvas.toDataURL('image/png')
    }
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch (error) {
    console.error('Failed to compress image:', error)
    return null
  }
}

function compressToJpeg(img: HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return img.src
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/* ──────────── 主组件 ──────────── */

const TipTapMarkdownEditor: React.FC<TipTapMarkdownEditorProps> = ({
  value = '',
  onChange,
  onSave,
  placeholder = '输入内容，支持 Markdown 语法（# 标题、**加粗**、- 列表、``` 代码块…）',
  readOnly = false,
  onReady,
  scrollRef,
  autofocus = false,
  showToolbar = true,
  className
}) => {
  const { token } = theme.useToken()
  const editorRef = useRef<Editor | null>(null)
  const lastMdRef = useRef(value)

  /* Slash 菜单主题（弹层挂载在 body，需把 token 注入 ref 供其读取） */
  const slashThemeRef = useRef<SlashMenuTheme>({
    bg: token.colorBgElevated,
    border: token.colorBorderSecondary,
    text: token.colorText,
    textSecondary: token.colorTextSecondary,
    textTertiary: token.colorTextTertiary,
    accent: token.colorPrimary,
    accentSoft: token.colorPrimaryBg,
    hoverBg: token.colorFillTertiary
  })
  slashThemeRef.current = {
    bg: token.colorBgElevated,
    border: token.colorBorderSecondary,
    text: token.colorText,
    textSecondary: token.colorTextSecondary,
    textTertiary: token.colorTextTertiary,
    accent: token.colorPrimary,
    accentSoft: token.colorPrimaryBg,
    hoverBg: token.colorFillTertiary
  }

  /* 回调走 ref，避免 editor 重建 */
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  /* 链接编辑浮层状态 */
  const [linkPop, setLinkPop] = useState<{ top: number; left: number; value: string } | null>(null)
  const linkInputRef = useRef<HTMLInputElement | null>(null)

  const insertImageAt = useCallback((dataUrl: string, pos?: number) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const insertPos = pos ?? ed.state.selection.from
    ed.chain()
      .focus()
      .insertContentAt(insertPos, { type: 'image', attrs: { src: dataUrl } })
      .run()
  }, [])

  const editor = useEditor({
    extensions: [
      ...buildMarkdownEditorExtensions(placeholder),
      ...(readOnly ? [] : [buildSlashMenuExtension(slashThemeRef)])
    ],
    content: value,
    editable: !readOnly,
    autofocus: autofocus === true ? true : autofocus === 'end' ? 'end' : false,
    editorProps: {
      attributes: { class: 'tiptap-editor' },
      handleKeyDown: (_view, event) => {
        // Ctrl/Cmd + K：打开链接浮层
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === 'k'
        ) {
          event.preventDefault()
          openLinkPop()
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
        const images = files ? Array.from(files).filter((f) => f.type.startsWith('image/')) : []
        if (images.length === 0) return false
        // 粘贴截图/图片：压缩后插入 dataURL
        event.preventDefault()
        const pos = view.state.selection.from
        void (async () => {
          let p = pos
          for (const file of images) {
            const dataUrl = await compressImageFile(file)
            if (dataUrl) {
              insertImageAt(dataUrl, p)
              p += 1
            }
          }
        })()
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = event.dataTransfer?.files
        const images = files ? Array.from(files).filter((f) => f.type.startsWith('image/')) : []
        if (images.length === 0) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const pos = coords?.pos ?? view.state.selection.from
        void (async () => {
          let p = pos
          for (const file of images) {
            const dataUrl = await compressImageFile(file)
            if (dataUrl) {
              insertImageAt(dataUrl, p)
              p += 1
            }
          }
        })()
        return true
      }
    },
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdownSafe(ed)
      lastMdRef.current = md
      onChangeRef.current?.(md)
    }
  })
  editorRef.current = editor

  /* 外部 value 变化时同步（弹窗复用同一实例时切换文档） */
  useEffect(() => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const current = getMarkdownSafe(ed)
    if (value !== current) {
      lastMdRef.current = value
      ed.commands.setContent(value, { emitUpdate: false })
    }
  }, [value])

  /* 就绪回调 */
  useEffect(() => {
    if (editor && onReady) onReady(editor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  /* ── 打开链接浮层 ── */
  const openLinkPop = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const sel = window.getSelection()
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    if (!range) return
    const rect = range.getBoundingClientRect()
    const href = (ed.getAttributes('link').href as string | undefined) ?? ''
    // 有选区时取选区内容，否则默认取当前链接
    const top = Math.min(rect.bottom + 8, window.innerHeight - 72)
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 320))
    setLinkPop({ top: Math.max(top, 8), left, value: href })
  }, [])

  const applyLink = useCallback((url: string) => {
    const ed = editorRef.current
    setLinkPop(null)
    if (!ed || ed.isDestroyed) return
    const normalized = normalizeUrl(url)
    const chain = ed.chain().focus()
    if (!normalized) {
      chain.extendMarkRange('link').unsetLink().run()
    } else if (ed.state.selection.empty) {
      chain.extendMarkRange('link').setLink({ href: normalized }).run()
    } else {
      chain.setLink({ href: normalized }).run()
    }
  }, [])

  /* 点击浮层外部关闭 */
  useEffect(() => {
    if (!linkPop) return
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('.tiptap-link-pop')) setLinkPop(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [linkPop])

  /* ── Ctrl+S 保存 ── */
  useEffect(() => {
    if (readOnly) return
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) onSaveRef.current?.(getMarkdownSafe(ed))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [readOnly])

  /* ── 主题 CSS 变量 ── */
  const cssVars = {
    '--ed-text': token.colorText,
    '--ed-text-secondary': token.colorTextSecondary,
    '--ed-text-tertiary': token.colorTextTertiary,
    '--ed-border': token.colorBorderSecondary,
    '--ed-accent': token.colorPrimary,
    '--ed-accent-soft': token.colorPrimaryBg,
    '--ed-hover-bg': token.colorFillTertiary,
    '--ed-toolbar-bg': token.colorBgContainer,
    '--ed-quote-bg': token.colorFillQuaternary,
    '--ed-code-inline-bg': token.colorFillTertiary,
    '--ed-code-inline-text': token.colorText,
    '--ed-code-bg': token.colorFillQuaternary,
    '--ed-code-border': token.colorBorderSecondary,
    '--ed-code-text': token.colorText,
    '--ed-mark-bg': token.colorWarningBg,
    '--ed-selection-bg': token.colorPrimaryBg,
    '--ed-th-bg': token.colorFillQuaternary,
    '--ed-bubble-bg': token.colorBgElevated,
    '--ed-input-bg': token.colorBgContainer
  } as React.CSSProperties

  return (
    <div className={`tiptap-editor-root ${className ?? ''}`} style={cssVars}>
      {editor && !readOnly && showToolbar && (
        <EditorToolbar editor={editor} token={token} onLinkClick={openLinkPop} />
      )}
      <div className="tiptap-editor-scroll custom-scrollbar" ref={scrollRef}>
        <div className="tiptap-editor-body">
          <EditorContent editor={editor} />
        </div>
      </div>

      {editor && !readOnly && (
        <BubbleMenu
          editor={editor}
          className="tiptap-bubble-menu"
          options={{ placement: 'top', offset: 8 }}
          shouldShow={({ state }) => {
            const { selection } = state
            // 点击 Mermaid/KaTeX 等原子节点（NodeSelection）时不显示文本格式工具栏
            if (selection instanceof NodeSelection) return false
            return Boolean(selection && !selection.empty)
          }}
        >
          <BubbleButtons editor={editor} onLinkClick={openLinkPop} />
        </BubbleMenu>
      )}

      {linkPop && (
        <div className="tiptap-link-pop" style={{ top: linkPop.top, left: linkPop.left }}>
          <input
            ref={linkInputRef}
            autoFocus
            defaultValue={linkPop.value}
            placeholder="粘贴链接地址（留空则移除链接）"
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink(e.currentTarget.value)
              if (e.key === 'Escape') setLinkPop(null)
            }}
          />
          <button
            className="link-apply"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (linkInputRef.current) applyLink(linkInputRef.current.value)
            }}
          >
            确定
          </button>
          <button
            className="link-cancel"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setLinkPop(null)}
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}

/* ──────────── 工具栏 ──────────── */

interface EditorToolbarProps {
  editor: Editor
  token: GlobalToken
  onLinkClick: () => void
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor, onLinkClick }) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo(),
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            strike: ed.isActive('strike'),
            code: ed.isActive('code'),
            highlight: ed.isActive('highlight'),
            link: ed.isActive('link'),
            blockquote: ed.isActive('blockquote'),
            bulletList: ed.isActive('bulletList'),
            orderedList: ed.isActive('orderedList'),
            taskList: ed.isActive('taskList'),
            codeBlock: ed.isActive('codeBlock'),
            heading: ([1, 2, 3, 4] as const).find((l) => ed.isActive('heading', { level: l })) ?? 0,
            chars: ed.state.doc.textContent.replace(/\s/g, '').length
          }
        : null
  })

  if (!state) return null

  const prevent = (e: React.MouseEvent): void => e.preventDefault()

  const btn = (
    title: string,
    icon: React.ReactNode,
    action: () => void,
    active = false,
    disabled = false
  ): React.ReactNode => (
    <Tooltip title={title} key={title}>
      <button
        className={`tiptap-toolbar-btn${active ? ' tiptap-toolbar-btn-active' : ''}`}
        onMouseDown={prevent}
        onClick={action}
        disabled={disabled}
      >
        {icon}
      </button>
    </Tooltip>
  )

  const headingItems = [
    { key: 'p', label: '正文' },
    { key: 'h1', label: '标题 1' },
    { key: 'h2', label: '标题 2' },
    { key: 'h3', label: '标题 3' },
    { key: 'h4', label: '标题 4' }
  ]

  return (
    <div className="tiptap-toolbar">
      {btn(
        '撤销',
        <RiArrowGoBackLine size={15} />,
        () => editor.chain().focus().undo().run(),
        false,
        !state.canUndo
      )}
      {btn(
        '重做',
        <RiArrowGoForwardLine size={15} />,
        () => editor.chain().focus().redo().run(),
        false,
        !state.canRedo
      )}
      <div className="tiptap-toolbar-divider" />
      <Dropdown
        trigger={['click']}
        menu={{
          items: headingItems,
          selectable: true,
          selectedKeys: [state.heading ? `h${state.heading}` : 'p'],
          onClick: ({ key }) => {
            if (key === 'p') {
              editor.chain().focus().setParagraph().run()
            } else {
              editor
                .chain()
                .focus()
                .toggleHeading({ level: Number(key.slice(1)) as 1 | 2 | 3 | 4 })
                .run()
            }
          }
        }}
      >
        <button className="tiptap-toolbar-btn" onMouseDown={prevent}>
          {state.heading ? `H${state.heading}` : '正文'}
          <RiArrowDropDownLine size={14} style={{ marginLeft: 1 }} />
        </button>
      </Dropdown>
      <div className="tiptap-toolbar-divider" />
      {btn(
        '加粗 Ctrl+B',
        <RiBold size={15} />,
        () => editor.chain().focus().toggleBold().run(),
        state.bold
      )}
      {btn(
        '斜体 Ctrl+I',
        <RiItalic size={15} />,
        () => editor.chain().focus().toggleItalic().run(),
        state.italic
      )}
      {btn(
        '下划线 Ctrl+U',
        <RiUnderline size={15} />,
        () => editor.chain().focus().toggleUnderline().run(),
        state.underline
      )}
      {btn(
        '删除线',
        <RiStrikethrough size={15} />,
        () => editor.chain().focus().toggleStrike().run(),
        state.strike
      )}
      {btn(
        '行内代码',
        <RiCodeLine size={15} />,
        () => editor.chain().focus().toggleCode().run(),
        state.code
      )}
      {btn(
        '高亮',
        <RiMarkPenLine size={15} />,
        () => editor.chain().focus().toggleHighlight().run(),
        state.highlight
      )}
      <div className="tiptap-toolbar-divider" />
      {btn('链接 Ctrl+K', <RiLink size={15} />, onLinkClick, state.link)}
      {state.link &&
        btn('移除链接', <RiLinkUnlinkM size={15} />, () =>
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
        )}
      {btn(
        '引用',
        <RiDoubleQuotesL size={15} />,
        () => editor.chain().focus().toggleBlockquote().run(),
        state.blockquote
      )}
      {btn(
        '无序列表',
        <RiListUnordered size={15} />,
        () => editor.chain().focus().toggleBulletList().run(),
        state.bulletList
      )}
      {btn(
        '有序列表',
        <RiListOrdered size={15} />,
        () => editor.chain().focus().toggleOrderedList().run(),
        state.orderedList
      )}
      {btn(
        '任务列表',
        <RiCheckboxLine size={15} />,
        () => editor.chain().focus().toggleTaskList().run(),
        state.taskList
      )}
      {btn(
        '代码块',
        <RiCodeBoxLine size={15} />,
        () => editor.chain().focus().toggleCodeBlock().run(),
        state.codeBlock
      )}
      {btn('分割线', <RiSeparator size={15} />, () =>
        editor.chain().focus().setHorizontalRule().run()
      )}
      <div className="tiptap-toolbar-spacer" />
      <span className="tiptap-toolbar-label">{state.chars} 字</span>
    </div>
  )
}

/* ──────────── 气泡菜单（选中文本浮动） ──────────── */

interface BubbleButtonsProps {
  editor: Editor
  onLinkClick: () => void
}

const BubbleButtons: React.FC<BubbleButtonsProps> = ({ editor, onLinkClick }) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            strike: ed.isActive('strike'),
            code: ed.isActive('code'),
            highlight: ed.isActive('highlight'),
            link: ed.isActive('link')
          }
        : null
  })

  if (!state) return null

  const prevent = (e: React.MouseEvent): void => e.preventDefault()
  const btn = (
    title: string,
    icon: React.ReactNode,
    action: () => void,
    active = false
  ): React.ReactNode => (
    <Tooltip title={title} key={title}>
      <button
        className={`tiptap-toolbar-btn${active ? ' tiptap-toolbar-btn-active' : ''}`}
        onMouseDown={prevent}
        onClick={action}
      >
        {icon}
      </button>
    </Tooltip>
  )

  return (
    <>
      {btn(
        '加粗',
        <RiBold size={14} />,
        () => editor.chain().focus().toggleBold().run(),
        state.bold
      )}
      {btn(
        '斜体',
        <RiItalic size={14} />,
        () => editor.chain().focus().toggleItalic().run(),
        state.italic
      )}
      {btn(
        '下划线',
        <RiUnderline size={14} />,
        () => editor.chain().focus().toggleUnderline().run(),
        state.underline
      )}
      {btn(
        '删除线',
        <RiStrikethrough size={14} />,
        () => editor.chain().focus().toggleStrike().run(),
        state.strike
      )}
      {btn(
        '行内代码',
        <RiCodeLine size={14} />,
        () => editor.chain().focus().toggleCode().run(),
        state.code
      )}
      {btn(
        '高亮',
        <RiMarkPenLine size={14} />,
        () => editor.chain().focus().toggleHighlight().run(),
        state.highlight
      )}
      {btn('链接', <RiLink size={14} />, onLinkClick, state.link)}
      {btn('清除格式', <RiFormatClear size={14} />, () =>
        editor.chain().focus().unsetAllMarks().clearNodes().run()
      )}
    </>
  )
}

export default TipTapMarkdownEditor
