import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root } from 'mdast'

/* ════════════════════════════════════════════════════════════
   MDX 预览适配：把 JSX / import / export 构造转成 mdx 源码块展示，
   避免被 rehype-raw + rehype-sanitize 吞掉或破坏
   ════════════════════════════════════════════════════════════ */

function looksLikeMdxHtml(raw: string): boolean {
  return (
    /^\s*<\/?[A-Z]/.test(raw) ||
    /^\s*<\/?>\s*$/.test(raw) ||
    /<[a-zA-Z][\w.-]*[^>]*\{[^}]*\}/.test(raw)
  )
}

function looksLikeImportExport(text: string): boolean {
  return /^(?:import|export)\s+(?:[{*@]|[A-Za-z_$][A-Za-z0-9_$]*(\s*[,{]|\s+from\s+['"@]))/.test(
    text
  )
}

export default function remarkMdxSource(): (tree: Root) => void {
  return (tree) => {
    visit(tree, 'html', (node, index, parent) => {
      if (index == null || !parent) return
      if (!looksLikeMdxHtml(node.value)) return
      if (parent.type === 'paragraph') {
        parent.children[index] = { type: 'inlineCode', value: node.value }
      } else {
        parent.children[index] = { type: 'code', lang: 'mdx', value: node.value.replace(/\n$/, '') }
      }
    })

    visit(tree, 'paragraph', (node, index, parent) => {
      if (index == null || !parent) return
      const text = toString(node).trim()
      if (looksLikeImportExport(text)) {
        parent.children[index] = { type: 'code', lang: 'mdx', value: text }
      }
    })
  }
}
