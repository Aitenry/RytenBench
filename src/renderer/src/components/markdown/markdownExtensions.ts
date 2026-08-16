import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TiptapImage from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'
import { Extension, InputRule } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import type { Extensions } from '@tiptap/core'
import type MarkdownIt from 'markdown-it'
import { taskCheckboxPlugin } from './taskCheckboxPlugin'

/* ────────────────────────────────────────────────────────────
   下划线 / 高亮没有标准 Markdown 语法，序列化为 <u>/<mark> HTML，
   Markdown 扩展开启 html 模式后经 markdown-it 解析可完整往返
   （Underline/Highlight 的 parseHTML 已匹配 u / mark 标签）
   ──────────────────────────────────────────────────────────── */
const MarkdownUnderline = Underline.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: '<u>', close: '</u>' }
      }
    }
  }
})

const MarkdownHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: '<mark>', close: '</mark>' }
      }
    }
  }
})

/** 代码高亮语言集（lowlight 内置 37 种常用语言） */
const lowlight = createLowlight(common)

/**
 * 任务列表解析替换：用自研插件（混排列表拆分）替代 tiptap-markdown
 * 内置的 markdown-it-task-lists；serialize 沿用默认 spec。
 */
const MarkdownTaskList = TaskList.extend({
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(markdownit: MarkdownIt) {
            markdownit.use(taskCheckboxPlugin)
          },
          updateDOM(element: Element) {
            ;[...element.querySelectorAll('.contains-task-list')].forEach((list) => {
              list.setAttribute('data-type', 'taskList')
            })
          }
        }
      }
    }
  }
})

/**
 * taskList 与 bulletList/orderedList 一样支持 tight 属性，
 * 使任务列表序列化时保持紧凑（不产生空行分隔）。
 */
const MarkdownTightTaskLists = Extension.create({
  name: 'markdownTightTaskLists',
  addGlobalAttributes() {
    return [
      {
        types: ['taskList'],
        attributes: {
          tight: {
            default: true,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute('data-tight') === 'true' || !element.querySelector('p'),
            renderHTML: (attributes: Record<string, unknown>) => ({
              class: attributes.tight ? 'tight' : null,
              'data-tight': attributes.tight ? 'true' : null
            })
          }
        }
      }
    ]
  }
})

/**
 * 键入 "- [ ] " / "- [x] " 自动转换为任务项。
 * TipTap v3 的 TaskItem 不再内置输入规则，这里补上：
 * 将光标所在 bulletList/listItem 原地转换为 taskList/taskItem，
 * 若列表还有其它普通项则拆分为兄弟列表（前段 + 任务列表 + 后段）。
 * 注：v3 输入规则协议要求 handler 修改 state.tr 后返回 null，
 * 由 inputRules 插件统一 dispatch（本规则导出便于测试）。
 */
export const taskItemTypingRule = new InputRule({
  find: /^\s*\[( |x)\]\s$/,
  handler: ({ state, range, match }) => {
    const schema = state.schema
    const tr = state.tr
    /* 先删掉 "[ ] " 文本，后续节点从更新后的文档上读取 */
    tr.delete(range.from, range.to)
    const $pos = tr.doc.resolve(range.from)

    let liDepth = -1
    let listDepth = -1
    for (let d = $pos.depth; d > 0; d--) {
      const name = $pos.node(d).type.name
      if (name === 'listItem') liDepth = d
      else if (name === 'bulletList') listDepth = d
    }
    if (liDepth < 0 || listDepth < 0) return null

    const liNode = $pos.node(liDepth)
    const listNode = $pos.node(listDepth)
    const liStart = $pos.before(liDepth)
    const listStart = $pos.before(listDepth)
    const listEnd = $pos.after(listDepth)

    const taskItem = schema.nodes.taskItem.create(
      { checked: match[1] === 'x' },
      liNode.content,
      liNode.marks
    )
    const taskList = schema.nodes.taskList.create(null, taskItem)

    if (listNode.childCount === 1) {
      tr.replaceWith(listStart, listEnd, taskList)
    } else {
      /* 按「子节点序号」切分前后项（注意 Fragment.cut 用的是字符偏移，不能直接用） */
      const index = tr.doc.resolve(liStart).index()
      const beforeNodes: PMNode[] = []
      const afterNodes: PMNode[] = []
      listNode.content.forEach((child, _offset, i) => {
        if (i < index) beforeNodes.push(child)
        else if (i > index) afterNodes.push(child)
      })
      const before = Fragment.fromArray(beforeNodes)
      const after = Fragment.fromArray(afterNodes)
      const parts: PMNode[] = []
      if (before.size > 0) {
        parts.push(schema.nodes.bulletList.create(listNode.attrs, before, listNode.marks))
      }
      parts.push(taskList)
      if (after.size > 0) {
        parts.push(schema.nodes.bulletList.create(listNode.attrs, after, listNode.marks))
      }
      tr.replaceWith(listStart, listEnd, Fragment.fromArray(parts))
    }
    /* v3 输入规则协议：handler 修改 state.tr 后返回 undefined，由插件统一 dispatch */
    return undefined
  }
})

const MarkdownTaskItemTyping = Extension.create({
  name: 'markdownTaskItemTyping',
  addInputRules() {
    return [taskItemTypingRule]
  }
})

/** 构建所见即所得 Markdown 编辑器的扩展集 */
export function buildMarkdownEditorExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // 代码块改用 CodeBlockLowlight（带语法高亮）
      codeBlock: false,
      // StarterKit 已内置 Link/Underline：Link 直接配置；
      // Underline 需要自定义 markdown 序列化（<u> 往返），
      // 故禁用内置实例改用下方 MarkdownUnderline
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: 'noopener noreferrer' }
      },
      underline: false
    }),
    MarkdownUnderline,
    MarkdownHighlight,
    MarkdownTightTaskLists,
    MarkdownTaskList,
    MarkdownTaskItemTyping,
    TaskItem.configure({ nested: true }),
    TiptapImage.configure({ inline: false, allowBase64: true }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder }),
    Markdown.configure({
      html: true,
      tightLists: true,
      bulletListMarker: '-',
      linkify: false,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: false
    })
  ]
}

/** 序列化当前文档为 Markdown（失败时降级为纯文本，保证不抛错） */
export function getMarkdownSafe(editor: Editor): string {
  try {
    const storage = editor.storage as { markdown?: { getMarkdown?: () => string } }
    const md = storage.markdown?.getMarkdown?.()
    if (typeof md === 'string') return md
  } catch (error) {
    console.error('Failed to serialize markdown:', error)
  }
  return editor.getText({ blockSeparator: '\n' })
}
