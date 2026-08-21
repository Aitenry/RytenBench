import { Extension } from '@tiptap/core'
import { Suggestion } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import type { ComponentType, MutableRefObject } from 'react'
import {
  RiText,
  RiListUnordered,
  RiListOrdered,
  RiCheckboxLine,
  RiDoubleQuotesL,
  RiCodeBoxLine,
  RiSeparator,
  RiTable2,
  RiFunctionLine,
  RiFunctionAddLine,
  RiFlowChart
} from '@remixicon/react'
import SlashMenuList from './SlashMenuList'
import type { SlashMenuListHandle, SlashMenuListProps } from './SlashMenuList'

/** Slash 菜单主题色（由编辑器注入 antd token，弹层挂载在 body 上无主题上下文） */
export interface SlashMenuTheme {
  bg: string
  border: string
  text: string
  textSecondary: string
  textTertiary: string
  accent: string
  accentSoft: string
  hoverBg: string
}

export interface SlashMenuItemDef {
  key: string
  title: string
  description?: string
  keywords?: string[]
  /** 文字图标（如 H1），优先于 Icon 渲染 */
  iconText?: string
  /** remixicon 图标组件（size 为 number|string，与 RemixiconProps 一致） */
  Icon?: ComponentType<{ size?: number | string }>
  run: (editor: Editor) => void
}

/* ──────────── 菜单项定义 ──────────── */

export const SLASH_ITEMS: SlashMenuItemDef[] = [
  {
    key: 'paragraph',
    title: '正文',
    description: '普通文本段落',
    keywords: ['正文', '文本', 'text', 'paragraph'],
    Icon: RiText,
    run: (editor) => editor.chain().focus().setParagraph().run()
  },
  {
    key: 'h1',
    title: '标题 1',
    description: '一级标题',
    keywords: ['标题1', '标题一', 'h1', 'heading'],
    iconText: 'H1',
    run: (editor) => editor.chain().focus().setHeading({ level: 1 }).run()
  },
  {
    key: 'h2',
    title: '标题 2',
    description: '二级标题',
    keywords: ['标题2', '标题二', 'h2', 'heading'],
    iconText: 'H2',
    run: (editor) => editor.chain().focus().setHeading({ level: 2 }).run()
  },
  {
    key: 'h3',
    title: '标题 3',
    description: '三级标题',
    keywords: ['标题3', '标题三', 'h3', 'heading'],
    iconText: 'H3',
    run: (editor) => editor.chain().focus().setHeading({ level: 3 }).run()
  },
  {
    key: 'bulletList',
    title: '无序列表',
    description: '• 项目符号列表',
    keywords: ['列表', '无序', 'ul', 'bullet', 'list'],
    Icon: RiListUnordered,
    run: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    key: 'orderedList',
    title: '有序列表',
    description: '1. 编号列表',
    keywords: ['列表', '有序', 'ol', 'ordered', 'list'],
    Icon: RiListOrdered,
    run: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    key: 'taskList',
    title: '任务列表',
    description: '☑ 待办复选框',
    keywords: ['任务', '待办', 'todo', 'task', 'check'],
    Icon: RiCheckboxLine,
    run: (editor) => editor.chain().focus().toggleTaskList().run()
  },
  {
    key: 'blockquote',
    title: '引用',
    description: '> 引用块',
    keywords: ['引用', 'quote', 'blockquote'],
    Icon: RiDoubleQuotesL,
    run: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    key: 'codeBlock',
    title: '代码块',
    description: '``` 语法高亮代码',
    keywords: ['代码', 'code', 'block', '代码块'],
    Icon: RiCodeBoxLine,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  {
    key: 'inlineMath',
    title: '公式',
    description: '$…$ 行内 LaTeX 公式',
    keywords: ['公式', '数学', '行内', 'math', 'latex', 'katex'],
    Icon: RiFunctionLine,
    run: (editor) => editor.chain().focus().insertContent({ type: 'mathInline' }).run()
  },
  {
    key: 'blockMath',
    title: '块级公式',
    description: '$$…$$ 独立 LaTeX 公式块',
    keywords: ['公式', '数学', '块级', 'math', 'latex', 'katex'],
    Icon: RiFunctionAddLine,
    run: (editor) => editor.chain().focus().insertContent({ type: 'mathBlock' }).run()
  },
  {
    key: 'mermaid',
    title: '图表',
    description: 'Mermaid 流程图 / 时序图 / 甘特图',
    keywords: ['图表', '图', '流程图', 'mermaid', 'diagram', 'flow'],
    Icon: RiFlowChart,
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'mermaid',
          attrs: { code: 'graph TD\n  A[开始] --> B[结束]' }
        })
        .run()
  },
  {
    key: 'table',
    title: '表格',
    description: '3×3 表格（含表头）',
    keywords: ['表格', 'table'],
    Icon: RiTable2,
    run: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  },
  {
    key: 'hr',
    title: '分割线',
    description: '--- 水平分割线',
    keywords: ['分割线', '水平线', 'hr', 'divider'],
    Icon: RiSeparator,
    run: (editor) => editor.chain().focus().setHorizontalRule().run()
  }
]

/* ──────────── 查询过滤 ──────────── */

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, '')

const filterItems = (query: string): SlashMenuItemDef[] => {
  const q = normalize(query)
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) => {
    const haystack = [item.title, item.description ?? '', ...(item.keywords ?? [])]
      .map(normalize)
      .join(' ')
    return haystack.includes(q)
  })
}

/* ──────────── 扩展工厂 ──────────── */

/**
 * Slash 块菜单：在段落开头输入 "/" 弹出块插入菜单（Notion/思源交互）。
 * @tiptap/suggestion v3 返回原生 PM 插件，经 addProseMirrorPlugins 注册。
 */
export function buildSlashMenuExtension(themeRef: MutableRefObject<SlashMenuTheme>): Extension {
  return Extension.create({
    name: 'slashMenu',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        Suggestion<SlashMenuItemDef, SlashMenuItemDef>({
          editor,
          char: '/',
          startOfLine: true,
          decorationClass: 'slash-decoration',
          /* 代码块内不触发 */
          allow: ({ state, range }) => {
            const parent = state.doc.resolve(range.from).parent
            return !parent.type.spec.code
          },
          items: ({ query }) => filterItems(query),
          command: ({ editor: ed, range, props }) => {
            ed.chain().focus().deleteRange(range).run()
            props.run(ed)
          },
          render: () => {
            let component: ReactRenderer<SlashMenuListHandle, SlashMenuListProps> | null = null
            let unmount: (() => void) | null = null

            return {
              onStart: (props) => {
                component = new ReactRenderer(SlashMenuList, {
                  props: {
                    items: props.items,
                    theme: themeRef.current,
                    command: (item) => props.command(item)
                  },
                  editor: props.editor
                })
                /* 挂载并托管定位（锚定光标，跟随滚动） */
                unmount = props.mount(component.element, {})
                component.element.classList.add('slash-menu-wrap')
              },
              onUpdate: (props) => {
                /* 必须同步新的 command 闭包：range 会随查询文本增长 */
                component?.updateProps({
                  items: props.items,
                  theme: themeRef.current,
                  command: (item) => props.command(item)
                })
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') return false
                return component?.ref?.onKeyDown(props.event) ?? false
              },
              onExit: () => {
                unmount?.()
                unmount = null
                component?.destroy()
                component = null
              }
            }
          }
        })
      ]
    }
  })
}
