import React, { useState, useEffect, useCallback } from 'react'
import { Input } from 'antd'
import type { MarkdownEditorProps } from '@renderer/types/components'

const { TextArea } = Input

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    const newValue = e.target.value
    setValue(newValue)
  }

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
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: '1fr',
        // 自定义滚动条样式
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(128,128,128,0.3) transparent'
      }}
    >
      <TextArea
        showCount
        onChange={handleChange}
        value={value}
        placeholder="请输入内容..."
        style={{
          height: '100%',
          resize: 'none'
        }}
      />
    </div>
  )
}

export default MarkdownEditor
