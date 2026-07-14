import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import rehypeRaw from 'rehype-raw'
import {
  RiCheckLine,
  RiFileCopyLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiSearchLine,
  RiCloseLine,
  RiArrowUpSLine
} from '@remixicon/react'
import { extractTextFromChildren } from '@renderer/utils/markdown'
import { useMessage } from '@renderer/hooks/useMessage'
import type {
  HeadingItem,
  TocItemProps,
  TableOfContentsProps,
  MarkdownViewProps
} from '@renderer/types/components'

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

const parseHeadings = (content: string): HeadingItem[] => {
  const headings: HeadingItem[] = []
  const stack: HeadingItem[] = []

  let inCodeBlock = false
  let headingIndex = 0
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
      const id = `h-${headingIndex++}`

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
        onClick={() => onNavigate(item.id)}
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

const MarkdownView = ({ content, isDarkMode = false }: MarkdownViewProps): React.ReactNode => {
  const contentRef = useRef<HTMLDivElement>(null)
  const headings = useMemo(() => parseHeadings(content), [content])

  // 构建文档顺序的扁平 ID 列表，与 ReactMarkdown 渲染顺序一致
  const headingFlatIds = useMemo(() => {
    const ids: string[] = []
    const traverse = (items: HeadingItem[]): void => {
      items.forEach((item) => {
        ids.push(item.id)
        traverse(item.children)
      })
    }
    traverse(headings)
    return ids
  }, [headings])

  // ─── Search functionality ───
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const matchNodesRef = useRef<HTMLElement[]>([])
  const currentMatchIndexRef = useRef(-1)

  const clearHighlights = useCallback(() => {
    if (!contentRef.current) return
    const marks = contentRef.current.querySelectorAll('mark.search-highlight')
    marks.forEach((mark) => {
      const parent = mark.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
      }
    })
    contentRef.current.normalize()
  }, [])

  const highlightMatches = useCallback((query: string): HTMLElement[] => {
    if (!contentRef.current || !query.trim()) return []

    const container = contentRef.current
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const el = node.parentElement
        if (!el) return NodeFilter.FILTER_ACCEPT
        if (el.closest('.search-bar')) return NodeFilter.FILTER_REJECT
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })

    const textNodes: Text[] = []
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text)
    }

    const marks: HTMLElement[] = []
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escapedQuery})`, 'gi')

    for (const textNode of textNodes) {
      const text = textNode.textContent || ''
      regex.lastIndex = 0
      if (!regex.test(text)) continue
      regex.lastIndex = 0

      const fragment = document.createDocumentFragment()
      let lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
        }
        const mark = document.createElement('mark')
        mark.className = 'search-highlight'
        mark.textContent = match[0]
        marks.push(mark)
        fragment.appendChild(mark)
        lastIndex = regex.lastIndex
      }
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
      }
      textNode.parentNode?.replaceChild(fragment, textNode)
    }

    return marks
  }, [])

  const navigateMatch = useCallback((direction: 1 | -1) => {
    const marks = matchNodesRef.current
    if (marks.length === 0) return

    marks.forEach((m) => m.classList.remove('search-highlight-current'))

    const newIndex =
      (((currentMatchIndexRef.current + direction) % marks.length) + marks.length) % marks.length
    currentMatchIndexRef.current = newIndex

    marks[newIndex].classList.add('search-highlight-current')
    marks[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' })

    setCurrentMatch(newIndex + 1)
  }, [])

  // Ctrl+F keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchVisible(true)
        setTimeout(() => {
          searchInputRef.current?.focus()
          searchInputRef.current?.select()
        }, 0)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Apply highlights when search query, visibility or content changes
  useEffect(() => {
    if (!searchVisible || !searchQuery.trim()) {
      clearHighlights()
      matchNodesRef.current = []
      setMatchCount(0)
      setCurrentMatch(0)
      currentMatchIndexRef.current = -1
      return
    }
    const marks = highlightMatches(searchQuery)
    matchNodesRef.current = marks
    setMatchCount(marks.length)
    currentMatchIndexRef.current = -1
    setCurrentMatch(0)
  }, [searchQuery, searchVisible, content, clearHighlights, highlightMatches])

  const handleSearchKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      navigateMatch(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      setSearchVisible(false)
    }
  }

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
    mark.search-highlight {
      background-color: ${isDarkMode ? '#1e3a5f' : '#bfdbfe'};
      color: ${isDarkMode ? '#93c5fd' : '#1e40af'};
      border-radius: 2px;
      padding: 0 1px;
    }
    mark.search-highlight-current {
      background-color: ${isDarkMode ? '#2563eb' : '#3b82f6'};
      color: #ffffff;
      border-radius: 2px;
      padding: 0 1px;
    }
  `

  const handleNavigate = (id: string): void => {
    // id 格式为 "h-{index}"，直接按 DOM 中标题元素的索引定位，不依赖 DOM id 属性
    const index = parseInt(id.split('-')[1], 10)
    if (isNaN(index)) return
    const allHeadings = contentRef.current?.querySelectorAll('h1, h2, h3, h4, h5, h6')
    if (allHeadings && allHeadings[index]) {
      allHeadings[index].scrollIntoView({ behavior: 'smooth' })
    }
  }

  const headingIndexRef = useRef(0)
  headingIndexRef.current = 0

  const getHeadingId = (): string => {
    const id = headingFlatIds[headingIndexRef.current]
    headingIndexRef.current++
    return id || `heading-${headingIndexRef.current}`
  }

  return (
    <div className="flex h-full">
      <style>{dynamicStyles}</style>
      <TableOfContents headings={headings} isDarkMode={isDarkMode} onNavigate={handleNavigate} />
      <div className="flex-1 flex flex-col min-w-0 relative">
        {searchVisible && (
          <div
            className={`search-bar absolute top-2 right-2 z-10 w-[360px] flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg ${
              isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}
          >
            <RiSearchLine size={16} className={isDarkMode ? 'text-gray-400' : 'text-gray-500'} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索..."
              className={`flex-1 bg-transparent outline-none text-sm ${
                isDarkMode
                  ? 'text-gray-200 placeholder-gray-500'
                  : 'text-gray-700 placeholder-gray-400'
              }`}
            />
            {matchCount > 0 && (
              <span
                className={`text-xs flex-shrink-0 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}
              >
                {currentMatch}/{matchCount}
              </span>
            )}
            <button
              onClick={() => navigateMatch(-1)}
              disabled={matchCount === 0}
              className={`p-1 rounded hover:bg-opacity-20 hover:bg-gray-400 disabled:opacity-30 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              <RiArrowUpSLine size={16} />
            </button>
            <button
              onClick={() => navigateMatch(1)}
              disabled={matchCount === 0}
              className={`p-1 rounded hover:bg-opacity-20 hover:bg-gray-400 disabled:opacity-30 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              <RiArrowDownSLine size={16} />
            </button>
            <button
              onClick={() => setSearchVisible(false)}
              className={`p-1 rounded hover:bg-opacity-20 hover:bg-gray-400 ${
                isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <RiCloseLine size={16} />
            </button>
          </div>
        )}
        <div
          ref={contentRef}
          className={`flex-1 overflow-y-auto rounded-xl custom-scrollbar ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}
        >
          <div
            className={`markdown-body px-[13px] ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}
          >
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
                h1: ({ children, ...props }) => (
                  <h1 {...props} id={getHeadingId()}>
                    {children}
                  </h1>
                ),
                h2: ({ children, ...props }) => (
                  <h2 {...props} id={getHeadingId()}>
                    {children}
                  </h2>
                ),
                h3: ({ children, ...props }) => (
                  <h3 {...props} id={getHeadingId()}>
                    {children}
                  </h3>
                ),
                h4: ({ children, ...props }) => (
                  <h4 {...props} id={getHeadingId()}>
                    {children}
                  </h4>
                ),
                h5: ({ children, ...props }) => (
                  <h5 {...props} id={getHeadingId()}>
                    {children}
                  </h5>
                ),
                h6: ({ children, ...props }) => (
                  <h6 {...props} id={getHeadingId()}>
                    {children}
                  </h6>
                ),
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
    </div>
  )
}

export default MarkdownView
