import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SlashMenuItemDef, SlashMenuTheme } from './slash-menu'

export interface SlashMenuListProps {
  items: SlashMenuItemDef[]
  theme: SlashMenuTheme
  command: (item: SlashMenuItemDef) => void
}

export interface SlashMenuListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * Slash 菜单弹层（经 ReactRenderer 挂载到 body，Floating UI 托管定位）。
 */
const SlashMenuList = forwardRef<SlashMenuListHandle, SlashMenuListProps>(
  ({ items, theme, command }, ref) => {
    const [index, setIndex] = useState(0)

    /* items 变化（查询过滤）时重置选中项 */
    useEffect(() => {
      setIndex(0)
    }, [items])

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event: KeyboardEvent): boolean => {
          if (event.key === 'ArrowDown') {
            setIndex((i) => Math.min(i + 1, items.length - 1))
            return true
          }
          if (event.key === 'ArrowUp') {
            setIndex((i) => Math.max(i - 1, 0))
            return true
          }
          if (event.key === 'Enter') {
            const item = items[index]
            if (item) command(item)
            return true
          }
          return false
        }
      }),
      [items, index, command]
    )

    const cssVars = {
      '--slash-bg': theme.bg,
      '--slash-border': theme.border,
      '--slash-text': theme.text,
      '--slash-text-secondary': theme.textSecondary,
      '--slash-text-tertiary': theme.textTertiary,
      '--slash-accent': theme.accent,
      '--slash-accent-soft': theme.accentSoft,
      '--slash-hover': theme.hoverBg
    } as React.CSSProperties

    return (
      <div className="slash-menu custom-scrollbar" style={cssVars}>
        {items.length === 0 ? (
          <div className="slash-empty">无匹配块</div>
        ) : (
          items.slice(0, 8).map((item, i) => (
            <button
              key={item.key}
              type="button"
              className={`slash-item${i === index ? ' is-active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => command(item)}
            >
              <span className="slash-item-icon">
                {item.iconText ? (
                  <span className="slash-item-texticon">{item.iconText}</span>
                ) : item.Icon ? (
                  <item.Icon size={15} />
                ) : null}
              </span>
              <span className="slash-item-info">
                <span className="slash-item-title">{item.title}</span>
                {item.description && <span className="slash-item-desc">{item.description}</span>}
              </span>
            </button>
          ))
        )}
        <div className="slash-menu-footer">↑↓ 选择 · Enter 插入 · Esc 关闭</div>
      </div>
    )
  }
)

SlashMenuList.displayName = 'SlashMenuList'

export default SlashMenuList
