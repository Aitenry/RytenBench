import { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm' // 支持表格、任务列表等
import highlight from 'rehype-highlight' // 代码高亮
import sanitize from 'rehype-sanitize' // 防止 XSS 攻击

// 定义组件的 props 类型
interface MarkdownViewProps {
  content: string // 从父组件传入的 Markdown 文本
}

const MarkdownView = ({ content }: MarkdownViewProps): JSX.Element => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[highlight, sanitize]}
      // 自定义组件：让链接在新窗口打开
      components={{
        a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

export default MarkdownView
