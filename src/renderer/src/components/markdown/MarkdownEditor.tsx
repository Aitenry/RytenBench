import React, { useEffect, useCallback, useRef } from 'react'
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  type MDXEditorMethods
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import './markdown-body.css'
import type { MarkdownEditorProps } from '@renderer/types/components'

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ initialValue = '', onSave }) => {
  const editorRef = useRef<MDXEditorMethods>(null)

  // 当 initialValue 变化时同步更新编辑器内容
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setMarkdown(initialValue)
    }
  }, [initialValue])

  const handleSave = useCallback((): void => {
    if (onSave && editorRef.current) {
      const markdown = editorRef.current.getMarkdown()
      onSave(markdown)
    }
  }, [onSave])

  // 监听快捷键 Ctrl+S / Command+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleSave])

  return (
    <div className="mdxeditor-wrapper h-full flex flex-col custom-scrollbar rounded-lg border border-gray-200">
      <MDXEditor
        ref={editorRef}
        markdown={initialValue}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          markdownShortcutPlugin()
        ]}
        contentEditableClassName="markdown-body"
      />
      <style>{`
        .mdxeditor-wrapper > .mdxeditor {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .mdxeditor-wrapper .mdxeditor-root-contenteditable {
          flex: 1 !important;
          min-height: 0 !important;
          overflow-y: auto !important;
        }
        .mdxeditor-wrapper .mdxeditor-root-contenteditable > div {
          height: 100% !important;
        }
        .mdxeditor-wrapper .mdxeditor-root-contenteditable .markdown-body {
          height: 100% !important;
        }
      `}</style>
    </div>
  )
}

export default MarkdownEditor
