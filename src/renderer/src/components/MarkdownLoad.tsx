import React, { useState, JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import rehypeRaw from 'rehype-raw'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { extractTextFromChildren } from '@renderer/utils/markdown'

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

// 定义组件的 props 类型
interface MarkdownViewProps {
  content: string // Markdown 文本
  isDarkMode?: boolean // 是否暗色模式（影响复制按钮和代码块样式）
}

const MarkdownLoad = ({ content, isDarkMode = false }: MarkdownViewProps): JSX.Element => {
  // 动态样式（基于 isDarkMode）
  const dynamicStyles = `
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
  `

  return (
    <>
      <style>{dynamicStyles}</style>
      <div className={`markdown-body ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeSanitize]}
          components={{
            // 链接在新窗口打开
            a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            // 代码块添加复制按钮
            pre: ({ children, ...props }) => {
              const codeText = extractTextFromChildren(children)
              return (
                <div className="relative">
                  <pre {...props}>{children}</pre>
                  <CopyButton text={codeText} isDarkMode={isDarkMode} />
                </div>
              )
            },
            // 表格添加滚动容器
            table: ({ children, ...props }) => (
              <div className="overflow-x-auto my-4">
                <table {...props} className="min-w-full">
                  {children}
                </table>
              </div>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </>
  )
}

export default MarkdownLoad
