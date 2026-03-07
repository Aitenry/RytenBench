import React, { useState, useEffect, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'

interface MarkdownEditorProps {
  initialValue?: string
  onSave?: (content: string) => void
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ initialValue = '', onSave }) => {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const handleSave = useCallback((): void => {
    if (onSave) {
      onSave(value)
    }
  }, [onSave, value])

  // 监听快捷键 Ctrl+S / Command+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // 检查是否按下 Ctrl (或 Cmd) 且键为 's'，且没有其他修饰键（Shift/Alt）
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 's') {
        e.preventDefault() // 阻止浏览器默认保存行为
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleSave]) // 依赖 handleSave，确保它始终是最新的

  return (
    <div>
      <MDEditor
        value={value}
        onChange={(val) => setValue(val || '')}
        preview="live"
        height={500}
        highlightEnable
      />
    </div>
  )
}

export default MarkdownEditor
