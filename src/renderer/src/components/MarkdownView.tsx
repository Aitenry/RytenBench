import React, { useState, useEffect, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import rehypeRaw from 'rehype-raw'
import { RiCheckLine, RiFileCopyLine, RiArrowRightSLine, RiArrowDownSLine } from '@remixicon/react'
import { extractTextFromChildren } from '@renderer/utils/markdown'
import { useMessage } from '@renderer/hooks/useMessage'

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
      title={copied ? '已复制' : '复制代码'}
    >
      {copied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
    </button>
  )
}

export const InlineCodeCopy = ({
  text,
  children
}: {
  text: string
  children: React.ReactNode
  isDarkMode?: boolean
}): React.ReactNode => {
  const [copied, setCopied] = useState(false)

  const { viewMessage } = useMessage()
  const handleCopy = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      viewMessage('copy-code', 'success', '已复制！')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <span
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 cursor-pointer transition-all`}
      title={copied ? '已复制' : '点击复制'}
    >
      {children}
    </span>
  )
}

interface HeadingItem {
  id: string
  level: number
  text: string
  children: HeadingItem[]
}

const parseHeadings = (content: string): HeadingItem[] => {
  const headings: HeadingItem[] = []
  const stack: HeadingItem[] = []

  let inCodeBlock = false
  const lines = content.split('\n')

  const stripBackslashes = (str: string): string => {
    return str.replace(/\\/g, '')
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const rawText = headingMatch[2]
      const cleanText = stripBackslashes(rawText)
      const id = `heading-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

      const item: HeadingItem = { id, level, text: cleanText, children: [] }

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      if (stack.length === 0) {
        headings.push(item)
      } else {
        stack[stack.length - 1].children.push(item)
      }

      stack.push(item)
    }
  }

  return headings
}

interface TocItemProps {
  item: HeadingItem
  isDarkMode?: boolean
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onNavigate: (id: string) => void
}

const TocItem = ({
  item,
  isDarkMode,
  expandedIds,
  onToggle,
  onNavigate
}: TocItemProps): React.ReactNode => {
  const hasChildren = item.children.length > 0
  const isExpanded = expandedIds.has(item.id)

  const indentLevel = Math.max(0, item.level - 1) * 12

  return (
    <div>
      <div
        className={`flex items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${
          isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${indentLevel + 8}px` }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle(item.id)
            }}
            className={`p-0.5 mr-1.5 rounded hover:bg-opacity-20 hover:bg-gray-300`}
          >
            {isExpanded ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
          </button>
        )}
        {!hasChildren && <span className="w-6" />}
        <span
          onClick={() => onNavigate(item.id)}
          className={`text-sm w-42.5 truncate ${
            isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {item.text}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.children.map((child) => (
            <TocItem
              key={child.id}
              item={child}
              isDarkMode={isDarkMode}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TableOfContentsProps {
  headings: HeadingItem[]
  isDarkMode?: boolean
  onNavigate: (id: string) => void
}

const TableOfContents = ({
  headings,
  isDarkMode,
  onNavigate
}: TableOfContentsProps): React.ReactNode => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const expandAll = (items: HeadingItem[]): Set<string> => {
      const ids = new Set<string>()
      const traverse = (list: HeadingItem[]): void => {
        list.forEach((item) => {
          if (item.children.length > 0) {
            ids.add(item.id)
          }
          traverse(item.children)
        })
      }
      traverse(items)
      return ids
    }
    setExpandedIds(expandAll(headings))
  }, [headings])

  const handleToggle = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (headings.length === 0) {
    return null
  }

  return (
    <div
      className={`w-64 flex-shrink-0 border-r flex flex-col h-full ${
        isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div
        className={`p-4 border-b font-semibold text-sm flex-shrink-0 ${
          isDarkMode ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'
        }`}
      >
        目录
      </div>
      <div className="p-2 overflow-y-auto custom-container-scrollbar flex-1 min-h-0">
        {headings.map((item) => (
          <TocItem
            key={item.id}
            item={item}
            isDarkMode={isDarkMode}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}

interface MarkdownViewProps {
  content: string
  isDarkMode?: boolean
}

const MarkdownView = ({ content, isDarkMode = false }: MarkdownViewProps): React.ReactNode => {
  const contentRef = useRef<HTMLDivElement>(null)
  const headings = useMemo(() => parseHeadings(content), [content])
  const textToIdMap = useMemo(() => {
    const map = new Map<string, string>()
    const traverse = (items: HeadingItem[]): void => {
      items.forEach((item) => {
        map.set(item.text, item.id)
        traverse(item.children)
      })
    }
    traverse(headings)
    return map
  }, [headings])

  const dynamicStyles = `
    .markdown-body h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; scroll-margin-top: 20px; }
    .markdown-body h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.5em; scroll-margin-top: 20px; }
    .markdown-body h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; scroll-margin-top: 20px; }
    .markdown-body h4 { font-size: 1.125em; font-weight: 600; margin: 1em 0 0.5em; scroll-margin-top: 20px; }
    .markdown-body h5 { font-size: 1em; font-weight: 600; margin: 1em 0 0.5em; scroll-margin-top: 20px; }
    .markdown-body h6 { font-size: 0.875em; font-weight: 600; margin: 1em 0 0.5em; scroll-margin-top: 20px; }
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

  const handleNavigate = (id: string): void => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const headingCounter = useRef<number>(0)

  const stripBackslashes = (str: string): string => {
    return str.replace(/\\/g, '')
  }

  const getHeadingId = (text: string): string => {
    const cleanText = stripBackslashes(text)
    return textToIdMap.get(cleanText) || `heading-${headingCounter.current++}`
  }

  return (
    <div className="flex h-full">
      <style>{dynamicStyles}</style>
      <TableOfContents headings={headings} isDarkMode={isDarkMode} onNavigate={handleNavigate} />
      <div
        ref={contentRef}
        className={`flex-1 overflow-y-auto p-6 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}
      >
        <div className={`markdown-body ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeHighlight, rehypeSanitize]}
            components={{
              a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
              code: ({ children, className, ...props }) => {
                const text = extractTextFromChildren(children)
                const isInline = !className?.includes('language-')
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
              },
              h1: ({ children, ...props }) => {
                const text = extractTextFromChildren(children)
                const id = getHeadingId(text)
                return (
                  <h1 id={id} {...props}>
                    {children}
                  </h1>
                )
              },
              h2: ({ children, ...props }) => {
                const text = extractTextFromChildren(children)
                const id = getHeadingId(text)
                return (
                  <h2 id={id} {...props}>
                    {children}
                  </h2>
                )
              },
              h3: ({ children, ...props }) => {
                const text = extractTextFromChildren(children)
                const id = getHeadingId(text)
                return (
                  <h3 id={id} {...props}>
                    {children}
                  </h3>
                )
              },
              h4: ({ children, ...props }) => {
                const text = extractTextFromChildren(children)
                const id = getHeadingId(text)
                return (
                  <h4 id={id} {...props}>
                    {children}
                  </h4>
                )
              },
              h5: ({ children, ...props }) => {
                const text = extractTextFromChildren(children)
                const id = getHeadingId(text)
                return (
                  <h5 id={id} {...props}>
                    {children}
                  </h5>
                )
              },
              h6: ({ children, ...props }) => {
                const text = extractTextFromChildren(children)
                const id = getHeadingId(text)
                return (
                  <h6 id={id} {...props}>
                    {children}
                  </h6>
                )
              },
              pre: ({ children, ...props }) => {
                const codeText = extractTextFromChildren(children)
                return (
                  <div className="relative">
                    <pre {...props}>{children}</pre>
                    <CopyButton text={codeText} isDarkMode={isDarkMode} />
                  </div>
                )
              },
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
      </div>
    </div>
  )
}

export default MarkdownView
