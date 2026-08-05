import React, { useMemo, useCallback, useState, useRef, useLayoutEffect, useEffect } from 'react'
import { RiCloseLine, RiArrowDownSLine } from '@remixicon/react'
import { Dropdown } from 'antd'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import '../utils/monacoSetup'
import { getLanguageFromPath } from '../utils/fileLang'

export interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
}

interface FileEditorProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  isDarkMode: boolean
  colorBgContainer: string
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  onCloseFile: (filePath: string) => void
  onSelectFile: (filePath: string) => void
  onContentChange: (filePath: string, content: string) => void
  onSaveFile: (filePath: string) => void
}

/** Width reserved for the "more" dropdown button. */
const MORE_BTN_WIDTH = 38

const FileEditor: React.FC<FileEditorProps> = ({
  openFiles,
  activeFilePath,
  isDarkMode,
  colorBgContainer,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  onCloseFile,
  onSelectFile,
  onContentChange,
  onSaveFile
}) => {
  const activeFile = openFiles.find((f) => f.path === activeFilePath) || null
  const language = activeFile ? getLanguageFromPath(activeFile.path) : 'plaintext'
  const editorTheme = isDarkMode ? 'vs-dark' : 'vs'

  // --- Tab overflow management ---
  const tabBarRef = useRef<HTMLDivElement>(null)
  const tabElemsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const [visibleCount, setVisibleCount] = useState(openFiles.length)

  useLayoutEffect(() => {
    const el = tabBarRef.current
    if (!el) return

    const calc = (): void => {
      const containerWidth = el.clientWidth
      const map = tabElemsRef.current

      // Pass 1: without "more" button, how many tabs fit?
      // Use cumulative offsetWidth instead of offsetLeft for reliable measurement
      let used = 0
      let count = openFiles.length
      for (let i = 0; i < openFiles.length; i++) {
        const tab = map.get(openFiles[i].path)
        used += tab ? tab.offsetWidth : 180
        if (used > containerWidth) {
          count = Math.max(1, i)
          break
        }
      }

      // Pass 2: if overflow, the "more" button takes space, recalc
      if (count < openFiles.length) {
        used = MORE_BTN_WIDTH
        for (let i = 0; i < openFiles.length; i++) {
          const tab = map.get(openFiles[i].path)
          used += tab ? tab.offsetWidth : 180
          if (used > containerWidth) {
            count = Math.max(1, i)
            break
          }
          count = i + 1
        }
      }

      setVisibleCount(count)
    }

    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [openFiles])

  const visibleFiles = openFiles.slice(0, visibleCount)
  const overflowFiles = openFiles.slice(visibleCount)

  const editorOptions: editor.IStandaloneEditorConstructionOptions = useMemo(
    () =>
      ({
        fontSize: 13,
        fontFamily:
          "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        renderWhitespace: 'selection',
        tabSize: 2,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 8 },
        suggest: { showWords: false },
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        overviewRulerLanes: 0,
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
          verticalSliderSize: 4,
          horizontalSliderSize: 4,
          useShadows: false
        }
      }) as editor.IStandaloneEditorConstructionOptions,
    []
  )

  const handleEditorMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const path = activeFilePath
        if (path) onSaveFile(path)
      })
    },
    [activeFilePath, onSaveFile]
  )

  useEffect(() => {
    const existingStyle = document.getElementById('monaco-scrollbar-style')
    const thumbColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
    const thumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
    if (existingStyle) {
      existingStyle.textContent = `
        .monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
          border-radius: 3px;
          background: ${thumbColor} !important;
        }
        .monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover,
        .monaco-editor .monaco-scrollable-element > .scrollbar > .slider.active {
          background: ${thumbHoverColor} !important;
        }
      `
    } else {
      const style = document.createElement('style')
      style.id = 'monaco-scrollbar-style'
      style.textContent = `
        .monaco-editor .monaco-scrollable-element > .scrollbar > .slider {
          border-radius: 3px;
          background: ${thumbColor} !important;
        }
        .monaco-editor .monaco-scrollable-element > .scrollbar > .slider:hover,
        .monaco-editor .monaco-scrollable-element > .scrollbar > .slider.active {
          background: ${thumbHoverColor} !important;
        }
      `
      document.head.appendChild(style)
    }
  }, [isDarkMode])

  const tabBaseStyle = (isActive: boolean): React.CSSProperties => ({
    height: 34,
    maxWidth: 160,
    paddingLeft: 10,
    paddingRight: 22,
    color: isActive ? colorText : colorTextSecondary,
    background: isActive ? colorBgContainer : 'transparent',
    borderTopLeftRadius: isActive ? 6 : 0,
    borderTopRightRadius: isActive ? 6 : 0,
    borderLeft: isActive
      ? `1px solid ${isDarkMode ? '#252526' : '#e4e4e4'}`
      : '1px solid transparent',
    borderRight: isActive
      ? `1px solid ${isDarkMode ? '#252526' : '#e4e4e4'}`
      : `1px solid ${isDarkMode ? '#1e1e1e' : '#e4e4e4'}`,
    borderTop: `1px solid ${isDarkMode ? '#252526' : '#e4e4e4'}`
  })

  const closeBtnStyle: React.CSSProperties = {
    position: 'absolute',
    right: 6,
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '2px',
    borderRadius: 3,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer'
  }

  // No files open → render nothing
  if (openFiles.length === 0) return null

  const dropdownItems = overflowFiles.map((f) => {
    const isActive = f.path === activeFilePath
    return {
      key: f.path,
      className: isActive ? 'dropdown-file-item-active' : '',
      style: isActive
        ? {
            background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
          }
        : undefined,
      label: (
        <div className="flex items-center justify-between gap-2" style={{ minWidth: 160 }}>
          <span
            className="truncate text-xs"
            style={{
              maxWidth: 130,
              color: isActive ? colorText : colorTextSecondary,
              fontWeight: isActive ? 500 : 400
            }}
          >
            {f.name}
            {f.isDirty && (
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isDarkMode ? '#fcc419' : '#e67700',
                  marginLeft: 4,
                  verticalAlign: 'middle'
                }}
              />
            )}
          </span>
          <RiCloseLine
            size={14}
            style={{ color: colorTextTertiary, cursor: 'pointer', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              onCloseFile(f.path)
            }}
          />
        </div>
      )
    }
  })

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: colorBgContainer }}>
      <style>{`
        .file-overflow-dropdown .ant-dropdown-menu {
          display: grid;
          gap: 4px;
        }
        .file-overflow-dropdown .ant-dropdown-menu-item {
          border-radius: 4px;
        }
      `}</style>
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        className="flex items-end shrink-0 overflow-hidden relative"
        style={{
          height: 35,
          background: isDarkMode ? '#252526' : '#f3f3f3',
          borderBottom: `1px solid ${isDarkMode ? '#1e1e1e' : '#e4e4e4'}`
        }}
      >
        {visibleFiles.map((file) => {
          const isActive = file.path === activeFilePath
          return (
            <div
              key={file.path}
              ref={(el) => {
                if (el) tabElemsRef.current.set(file.path, el)
                else tabElemsRef.current.delete(file.path)
              }}
              className="flex items-center gap-1.5 cursor-pointer select-none shrink-0 text-[13px] relative"
              style={tabBaseStyle(isActive)}
              onClick={() => onSelectFile(file.path)}
            >
              <span className="truncate flex-1 min-w-0">{file.name}</span>
              {file.isDirty && (
                <span
                  className="shrink-0"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isDarkMode ? '#fcc419' : '#e67700'
                  }}
                />
              )}
              <button
                style={closeBtnStyle}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseFile(file.path)
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode
                    ? 'rgba(255,255,255,0.15)'
                    : 'rgba(0,0,0,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <RiCloseLine
                  size={15}
                  style={{ color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }}
                />
              </button>
            </div>
          )
        })}

        {overflowFiles.length > 0 && (
          <Dropdown
            menu={{
              items: dropdownItems,
              onClick: ({ key }) => {
                const file = overflowFiles.find((f) => f.path === key)
                if (file) onSelectFile(file.path)
              }
            }}
            trigger={['click']}
            placement="bottomRight"
            classNames={{ root: 'file-overflow-dropdown' }}
          >
            <div
              className="flex items-center justify-center shrink-0 cursor-pointer"
              style={{
                width: MORE_BTN_WIDTH,
                height: 34,
                color: colorTextSecondary,
                borderLeft: `1px solid ${isDarkMode ? '#1e1e1e' : '#e4e4e4'}`
              }}
            >
              <RiArrowDownSLine size={16} />
            </div>
          </Dropdown>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        {activeFile && (
          <Editor
            key={activeFile.path}
            height="100%"
            theme={editorTheme}
            language={language}
            value={activeFile.content}
            options={editorOptions}
            onMount={handleEditorMount}
            onChange={(value) => {
              if (value !== undefined && activeFilePath) {
                onContentChange(activeFilePath, value)
              }
            }}
            loading={
              <div
                className="flex items-center justify-center h-full"
                style={{ color: colorTextTertiary, fontSize: 13 }}
              >
                Loading editor...
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}

export default FileEditor
