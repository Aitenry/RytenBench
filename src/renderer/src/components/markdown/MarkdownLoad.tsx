import React, { useState, useMemo, JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import { defaultSchema } from 'hast-util-sanitize'
import type { Pluggable, PluggableList } from 'unified'
import remarkMdxSource from './remarkMdxSource'
import remarkMathBridge from './remarkMathBridge'
import MermaidDiagram from './MermaidDiagram'
import 'katex/dist/katex.min.css'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { extractTextFromChildren } from '@renderer/utils/markdown'
import { InlineCodeCopy } from '@renderer/components/markdown/MarkdownView'
import type { MarkdownViewProps } from '@renderer/types/components'

// Stable references — prevent ReactMarkdown from re-rendering the entire DOM tree
const remarkPlugins = [remarkGfm, remarkMath, remarkMathBridge, remarkMdxSource]

// sanitize 先于 highlight/katex：KaTeX 输出与 hljs 类名不再被剥掉；
// 白名单需放行 remarkMathBridge 生成的 .math 类名（rehype-katex 依赖它匹配）
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^math/]],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', /^math/]],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', /^math/]]
  }
}
const rehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema] as unknown as Pluggable,
  rehypeHighlight,
  rehypeKatex
]

// Context to tell code component whether it's inside a <pre> (code block) or standalone (inline)
const IsPreContext = React.createContext(false)

// 复制按钮组件
const CopyButton = ({
  text,
  isDarkMode
}: {
  text: string
  isDarkMode?: boolean
}): React.ReactNode => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`absolute top-3 right-3 p-2 rounded-lg transition-all ${
        isDarkMode
          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
          : 'bg-gray-200 hover:bg-gray-300 text-gray-600 hover:text-gray-900'
      }`}
      title={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
    </button>
  )
}

const MarkdownLoad = React.memo(
  ({ content, isDarkMode = false }: MarkdownViewProps): JSX.Element => {
    // Memoize dynamic styles — only recompute when isDarkMode changes
    const dynamicStyles = useMemo(
      () => `
    .markdown-body > *:first-child { margin-top: 0; }
    .markdown-body h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
    .markdown-body h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; }
    .markdown-body h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
    .markdown-body h4 { font-size: 1.125em; font-weight: 600; margin: 1em 0 0.5em; }
    .markdown-body h5 { font-size: 1em; font-weight: 600; margin: 1em 0 0.5em; }
    .markdown-body h6 { font-size: 0.875em; font-weight: 600; margin: 1em 0 0.5em; }
    .markdown-body p { margin: 1em 0; line-height: 1.7; }
    .markdown-body ul { margin: 1em 0; padding-left: 1.75em; list-style-type: disc; }
    .markdown-body ol { margin: 1em 0; padding-left: 1.75em; list-style-type: decimal; }
    .markdown-body li { margin: 0.375em 0; line-height: 1.7; }
    .markdown-body ul ul, .markdown-body ul ol,
    .markdown-body ol ul, .markdown-body ol ol { margin: 0.5em 0; padding-left: 1.5em; }
    .markdown-body ul ul { list-style-type: circle; }
    .markdown-body ul ul ul { list-style-type: square; }
    .markdown-body ol ol { list-style-type: lower-alpha; }
    .markdown-body ol ol ol { list-style-type: lower-roman; }
    .markdown-body code { padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
    .markdown-body pre { padding: 1em; border-radius: 8px; overflow-x: auto; margin: 1em 0; }
    .markdown-body pre code { padding: 0; background: transparent; }
    .markdown-body blockquote { border-left: 4px solid; padding-left: 1em; margin: 1em 0; font-style: italic; }
    .markdown-body table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    .markdown-body th, .markdown-body td { padding: 0.75em; border: 1px solid; text-align: left; }
    .markdown-body code {
      background: ${isDarkMode ? '#374151' : '#f3f4f6'};
      color: ${isDarkMode ? '#e5e7eb' : '#374151'};
    }
    .markdown-body pre {
      background: ${isDarkMode ? '#1f2937' : '#f8f8f8'};
    }
    .markdown-body pre code {
      background: transparent;
      color: ${isDarkMode ? '#f3f4f6' : '#1f2937'};
    }
    .markdown-body blockquote { border-color: ${isDarkMode ? '#4b5563' : '#d1d5db'}; }
    .markdown-body th, .markdown-body td { border-color: ${isDarkMode ? '#4b5563' : '#d1d5db'}; }
  `,
      [isDarkMode]
    )

    // Memoize components — prevent ReactMarkdown from full re-render when only isDarkMode is stable
    const components: Components = useMemo(() => {
      function ABlock(props: React.ComponentPropsWithoutRef<'a'>): React.ReactNode {
        return <a {...props} target="_blank" rel="noopener noreferrer" />
      }

      function CodeBlock({
        children,
        className,
        ...props
      }: React.ComponentPropsWithoutRef<'code'>): React.ReactNode {
        const insidePre = React.useContext(IsPreContext)
        const text = extractTextFromChildren(children)
        const isInline = !insidePre && !className?.includes('language-')
        if (isInline) {
          return (
            <InlineCodeCopy text={text}>
              <code className={className} {...props}>
                {children}
              </code>
            </InlineCodeCopy>
          )
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        )
      }

      function PreBlock({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<'pre'>): React.ReactNode {
        const codeText = extractTextFromChildren(children)
        // Mermaid 代码块 → 渲染为图表
        const codeChild = React.Children.toArray(children).find((c): c is React.ReactElement =>
          React.isValidElement(c)
        )
        const codeClass =
          ((codeChild?.props as { className?: string } | undefined)?.className as
            string | undefined) ?? ''
        if (codeClass.includes('language-mermaid')) {
          return <MermaidDiagram code={codeText} isDarkMode={isDarkMode} />
        }
        return (
          <div className="relative">
            <IsPreContext.Provider value={true}>
              <pre {...props}>{children}</pre>
            </IsPreContext.Provider>
            <CopyButton text={codeText} isDarkMode={isDarkMode} />
          </div>
        )
      }

      function TableBlock({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<'table'>): React.ReactNode {
        return (
          <div className="overflow-x-auto my-4">
            <table {...props} className="min-w-full">
              {children}
            </table>
          </div>
        )
      }

      return {
        a: ABlock,
        code: CodeBlock,
        pre: PreBlock,
        table: TableBlock
      }
    }, [isDarkMode])

    return (
      <>
        <style>{dynamicStyles}</style>
        <div className={`markdown-body ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={components}
          >
            {content}
          </ReactMarkdown>
        </div>
      </>
    )
  }
)

MarkdownLoad.displayName = 'MarkdownLoad'

export default MarkdownLoad
