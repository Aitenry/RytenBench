import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'

/* ════════════════════════════════════════════════════════════
   KaTeX 预览桥接：remark-math 产生的 math/inlineMath 节点在
   mdast-util-to-hast 中没有对应 handler（会退化为纯文本），
   这里先转成 raw HTML（<span class="math math-inline"> /
   <div class="math math-display">），经 rehype-raw 解析后由
   rehype-katex 渲染
   ════════════════════════════════════════════════════════════ */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function remarkMathBridge(): (tree: Root) => void {
  return (tree) => {
    visit(tree, (node, index, parent) => {
      if (index == null || !parent) return
      if (node.type !== 'math' && node.type !== 'inlineMath') return
      const value = String((node as { value?: string }).value ?? '')
      const html =
        node.type === 'math'
          ? `<div class="math math-display">${escapeHtml(value)}</div>`
          : `<span class="math math-inline">${escapeHtml(value)}</span>`
      parent.children[index] = { type: 'html', value: html } as never
    })
  }
}
