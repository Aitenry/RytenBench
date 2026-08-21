import { Node, mergeAttributes } from '@tiptap/core'
import type MarkdownIt from 'markdown-it'

/* ════════════════════════════════════════════════════════════
   MDX 内容适配：import/export 语句与 JSX（<Component>、<> 片段、
   {...} 属性表达式）在编辑与保存中原样保留，不被 markdown 解析破坏
   - protectMdx：解析前把 MDX 片段替换为 <pre data-mdx-src>…</pre>
     （markdown-it 原样透传，PM 侧由 mdxBlock 节点承接，序列化还原原文）
   - html_inline 中的 JSX 片段 → <span data-mdx-inline>（mdxInline 原子节点）
   ════════════════════════════════════════════════════════════ */

const MAX_RUN_LINES = 500

/** 单行是否像 MDX 构造：import/export 语句或 JSX 标签 */
export function isMdxLine(line: string): boolean {
  const t = line.trim()
  if (/^(?:import|export)(?:\s|[{*])/.test(t)) return true
  if (!t.startsWith('<')) return false
  return (
    /^<\/?\s*[A-Z]/.test(t) || // 大写组件标签
    /^<\/?>\s*$/.test(t) || // <> 片段
    /<[a-zA-Z][\w.-]*[^>]*\{[^}]*\}/.test(t) // JSX 属性表达式
  )
}

/** 一行中 JSX 标签的嵌套增减（自闭合与无标签行返回 0） */
function jsxBalance(line: string): number {
  let balance = 0
  const re = /<\/?[A-Za-z][A-Za-z0-9.-]*(?:\s[^<>]*?)?\/?>|<>|<\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    const tag = m[0]
    if (tag === '</>') balance -= 1
    else if (tag === '<>') balance += 1
    else if (tag.startsWith('</')) balance -= 1
    else if (!tag.endsWith('/>')) balance += 1
  }
  return balance
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 把源文本中的 MDX 片段替换为 <pre data-mdx-src>…</pre> 原始 HTML，
 * markdown-it（html:true）会原样透传，PM 解析为 mdxBlock 节点。
 * 代码围栏（```…```）内部跳过——那里的 JSX 属于代码内容。
 */
export function protectMdx(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let i = 0
  let inFence = false

  while (i < lines.length) {
    const line = lines[i]

    if (/^\s*(```|~~~)/.test(line)) {
      out.push(line)
      inFence = !inFence
      i++
      continue
    }
    if (inFence) {
      out.push(line)
      i++
      continue
    }

    if (isMdxLine(line)) {
      const run: string[] = [line]
      let balance = jsxBalance(line)
      let j = i + 1
      if (balance > 0) {
        // 未闭合：按标签平衡继续收集（空白行在未闭合时保留在块内）
        let guard = 0
        while (j < lines.length && guard < MAX_RUN_LINES) {
          const l = lines[j]
          if (/^\s*(```|~~~)/.test(l)) break
          if (l.trim() === '' && balance <= 0) break
          run.push(l)
          balance += jsxBalance(l)
          j++
          guard++
          if (balance <= 0) break
        }
      }
      out.push(`<pre data-mdx-src>${escapeHtml(run.join('\n'))}</pre>`)
      i = j
      continue
    }

    out.push(line)
    i++
  }
  return out.join('\n')
}

/** 判断渲染层 html 片段是否像 MDX（用于 html_block / html_inline 兜底保护） */
export function looksLikeMdxHtml(raw: string): boolean {
  return (
    /^\s*<\/?[A-Z]/.test(raw) ||
    /^\s*<\/?>\s*$/.test(raw) ||
    /<[a-zA-Z][\w.-]*[^>]*\{[^}]*\}/.test(raw)
  )
}

/** markdown-it 侧适配：包一层 protectMdx + 兜底拦截 html_block/html_inline */
export function setupMdxParse(md: MarkdownIt): void {
  // setup 每次解析都会执行，避免重复包裹
  const marker = md as unknown as { __rytenMdxProtected?: boolean }
  if (marker.__rytenMdxProtected) return
  marker.__rytenMdxProtected = true

  const render = md.render.bind(md)
  md.render = (src: string, env?: unknown) => render(protectMdx(src), env)

  const defaultHtmlBlock = md.renderer.rules.html_block
  md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
    const raw = tokens[idx].content
    if (looksLikeMdxHtml(raw)) {
      return `<pre data-mdx-src>${escapeHtml(raw)}</pre>`
    }
    return defaultHtmlBlock
      ? defaultHtmlBlock(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }

  const defaultHtmlInline = md.renderer.rules.html_inline
  md.renderer.rules.html_inline = (tokens, idx, options, env, self) => {
    const raw = tokens[idx].content
    if (looksLikeMdxHtml(raw)) {
      return `<span data-mdx-inline>${escapeHtml(raw)}</span>`
    }
    return defaultHtmlInline
      ? defaultHtmlInline(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }
}

/* ──────────── 节点定义 ──────────── */

/** 块级 MDX 源码（可编辑，序列化原样还原） */
export const MdxBlock = Node.create({
  name: 'mdxBlock',
  group: 'block',
  content: 'text*',
  code: true,
  defining: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'pre[data-mdx-src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes, { 'data-mdx-src': '' }), ['code', 0]]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(node.textContent)
          state.closeBlock(node)
        }
      }
    }
  }
})

/** 行内 JSX 片段（原子节点，双击可整体替换） */
export const MdxInline = Node.create({
  name: 'mdxInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mdx-inline]',
        getAttrs: (el) => ({ src: (el as HTMLElement).textContent ?? '' })
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-mdx-inline': '' }), node.attrs.src]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(node.attrs.src as string)
        }
      }
    }
  }
})
