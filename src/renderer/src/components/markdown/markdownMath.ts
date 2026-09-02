import { Node, InputRule, mergeAttributes } from '@tiptap/core'
import type { NodeViewRendererProps } from '@tiptap/core'
import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline'
import katex from 'katex'

/* ════════════════════════════════════════════════════════════
   KaTeX 数学公式适配（$...$ 行内 / $$...$$ 块级）
   - markdown-it 插件：$..$ → <span data-math>，$$..$$ → <div data-math-block>
   - mathInline / mathBlock 为原子节点（attrs.tex），光标无法进入，
     点击后在 NodeView 内弹出 textarea 原地编辑，KaTeX 实时渲染
   - 序列化还原为 $..$ / $$..$$，与解析完全往返
   ════════════════════════════════════════════════════════════ */

/* ──────────── markdown-it 插件 ──────────── */

/** 块级规则：$$...$$（单行或多行，闭合行必须整行是 $$） */
function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false
  if (state.src.charCodeAt(start + 1) !== 0x24) return false
  if (state.src.charCodeAt(start + 2) === 0x24) return false // 不支持 $$$

  const openLine = state.src.slice(start, max).trim()

  // 单行形式：$$内容$$
  const single = /^\$\$(.+)\$\$$/.exec(openLine)
  if (single) {
    if (silent) return true
    const token = state.push('math_block', '', 0)
    token.content = single[1].trim()
    token.map = [startLine, startLine + 1]
    state.line = startLine + 1
    return true
  }

  // 多行形式：开行必须恰好是 $$
  if (openLine !== '$$') return false

  let nextLine = startLine + 1
  const lines: string[] = []
  for (; nextLine < endLine; nextLine++) {
    const line = state.src.slice(state.bMarks[nextLine], state.eMarks[nextLine])
    if (/^\s*\$\$\s*$/.test(line)) break
    lines.push(line)
  }
  if (nextLine >= endLine) return false // 未闭合：交给普通文本，避免误吞

  if (silent) return true
  const token = state.push('math_block', '', 0)
  token.content = lines.join('\n').trim()
  token.map = [startLine, nextLine + 1]
  state.line = nextLine + 1
  return true
}

/** 行内规则：$...$（跳过 $$、\$、开头/结尾紧邻空白的情况，避免误伤货币等） */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  const src = state.src
  const len = state.posMax
  if (src.charCodeAt(start) !== 0x24) return false
  if (src.charCodeAt(start + 1) === 0x24) return false // $$ 交给块级
  if (
    start > 0 &&
    src.charCodeAt(start - 1) === 0x5c /* \ */ &&
    src.charCodeAt(start - 2) !== 0x5c
  ) {
    return false // \$ 转义
  }
  if (start + 1 >= len || /\s/.test(src[start + 1])) return false // 开 $ 后不能是空白

  let pos = start + 1
  while (pos < len) {
    if (src.charCodeAt(pos) === 0x24) {
      if (src.charCodeAt(pos + 1) === 0x24) {
        pos += 2
        continue
      }
      if (pos > start + 1 && !/\s/.test(src[pos - 1])) {
        if (silent) return true
        const token = state.push('math_inline', 'math', 0)
        token.content = src.slice(start + 1, pos)
        state.pos = pos + 1
        return true
      }
    }
    pos++
  }
  return false
}

/** markdown-it 插件入口（md.use(mathPlugin)） */
export function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'math_block', mathBlockRule)
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule)

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div data-math-block>${md.utils.escapeHtml(tokens[idx].content)}</div>`
  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span data-math>${md.utils.escapeHtml(tokens[idx].content)}</span>`
}

/* ──────────── KaTeX NodeView（点击弹出 textarea 原地编辑） ──────────── */

function createMathNodeView(displayMode: boolean) {
  return (props: NodeViewRendererProps) => {
    const dom = document.createElement(displayMode ? 'div' : 'span')
    dom.className = displayMode ? 'tiptap-math tiptap-math-block' : 'tiptap-math'

    const outputEl = document.createElement('span')
    outputEl.className = 'tiptap-math-output'

    dom.append(outputEl)

    let editing = false
    let destroyed = false
    let textarea: HTMLTextAreaElement | null = null

    const renderOutput = (): void => {
      const tex = (props.node.attrs.tex as string) ?? ''
      outputEl.classList.remove('tiptap-math-empty', 'tiptap-math-error')
      try {
        if (!tex.trim()) {
          outputEl.textContent = displayMode ? '$$' : '$ $'
          outputEl.classList.add('tiptap-math-empty')
        } else {
          katex.render(tex, outputEl, { displayMode, throwOnError: false, strict: 'ignore' })
        }
      } catch {
        outputEl.textContent = tex || '$$'
        outputEl.classList.add('tiptap-math-error')
      }
    }
    renderOutput()

    const commit = (): void => {
      if (!editing || destroyed) return
      const next = textarea?.value ?? ''
      const tex = next.trim()
      editing = false
      textarea?.remove()
      textarea = null
      dom.classList.remove('tiptap-math-editing')
      // 恢复渲染输出显示（enterEdit 时被隐藏，否则提交后公式消失）
      outputEl.style.display = ''
      const pos = props.getPos()
      if (pos != null && tex !== props.node.attrs.tex) {
        props.editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { tex })
            return true
          })
          .run()
      } else {
        renderOutput()
      }
    }

    const cancel = (): void => {
      if (!editing || destroyed) return
      editing = false
      textarea?.remove()
      textarea = null
      dom.classList.remove('tiptap-math-editing')
      outputEl.style.display = ''
      renderOutput()
    }

    const enterEdit = (): void => {
      if (editing || destroyed) return
      const tex = (props.node.attrs.tex as string) ?? ''
      editing = true
      dom.classList.add('tiptap-math-editing')
      outputEl.style.display = 'none'
      textarea = document.createElement('textarea')
      textarea.className = 'tiptap-math-textarea'
      textarea.value = tex
      textarea.rows = displayMode ? 2 : 1
      textarea.spellcheck = false
      textarea.placeholder = '输入 LaTeX 公式，回车完成'
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          cancel()
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          commit()
        }
      })
      textarea.addEventListener('blur', (e) => {
        // 焦点只是移到节点内部（例如点击 textarea 自身）时不提交，防误触发
        const related = (e as FocusEvent).relatedTarget as globalThis.Node | null
        if (related && dom.contains(related)) return
        commit()
      })
      dom.append(textarea)
      textarea.focus()
      textarea.select()
    }

    dom.addEventListener('mousedown', (e) => {
      // 视图模式下拦截（避免 PM/浏览器在进入编辑前抢焦点）；
      // 编辑模式下放行，保证 textarea 内可正常放置光标
      if (!editing) e.preventDefault()
    })
    dom.addEventListener('click', (e) => {
      if (editing || destroyed) return
      e.preventDefault()
      enterEdit()
    })

    return {
      dom,
      update(node) {
        props.node = node
        if (!editing) renderOutput()
        return true
      },
      // 编辑态拦截 PM 事件（textarea 输入由自身处理）
      stopEvent() {
        return editing
      },
      destroy() {
        destroyed = true
      }
    }
  }
}

/* ──────────── 节点定义 ──────────── */

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { tex: { default: '' } }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).textContent ?? '' })
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math': '' }), node.attrs.tex]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`$${node.attrs.tex as string}$`)
        }
      }
    }
  },

  addNodeView() {
    return createMathNodeView(false)
  },

  addInputRules() {
    return [
      new InputRule({
        // 行内 $x$ + 空格（lookbehind 不消费前导字符，避免把空格一起删掉）
        find: /(?<=^|[^$])\$([^$\n]+?)\$\s$/,
        handler: ({ state, range, match }) => {
          const tr = state.tr
          tr.delete(range.from, range.to)
          tr.insert(range.from, state.schema.nodes.mathInline.create({ tex: match[1] }))
          return undefined
        }
      })
    ]
  }
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { tex: { default: '' } }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-block]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).textContent ?? '' })
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' }), node.attrs.tex]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`$$\n${((node.attrs.tex as string) ?? '').trim()}\n$$`)
          state.closeBlock(node)
        }
      }
    }
  },

  addNodeView() {
    return createMathNodeView(true)
  },

  addInputRules() {
    return [
      new InputRule({
        // 行首键入 $$内容$$ 立即转为块级公式
        find: /^\$\$([^$\n]*)\$\$$/,
        handler: ({ state, range, match }) => {
          const tr = state.tr
          tr.delete(range.from, range.to)
          tr.insert(range.from, state.schema.nodes.mathBlock.create({ tex: match[1] ?? '' }))
          return undefined
        }
      })
    ]
  }
})
