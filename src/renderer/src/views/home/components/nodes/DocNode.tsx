import React, { useState } from 'react'
import { Modal } from 'antd'
import { RiFileTextLine, RiPencilLine, RiDeleteBinLine, RiInboxArchiveLine } from '@remixicon/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DocListItem } from '@renderer/types/models'
import type { ThemePalette } from '@renderer/types/components'

/* ──────────── React Flow node data type ──────────── */

export interface DocNodeData extends Record<string, unknown> {
  doc: DocListItem
  palette: ThemePalette
  onOpen: (doc: DocListItem) => void
  onEdit: (doc: DocListItem) => void
  onDelete: (doc: DocListItem) => void
  onArchive: (doc: DocListItem) => void
}

const DocNode: React.FC<NodeProps<Node<DocNodeData>>> = ({ data }) => {
  const { doc, palette } = data
  const [hovered, setHovered] = useState(false)

  const arcBtnBase: React.CSSProperties = {
    position: 'absolute',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: `1px solid ${palette.docCardBorder}`,
    cursor: 'pointer',
    background: palette.docCardBg,
    color: palette.textSecondary,
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
    opacity: hovered ? 1 : 0,
    transition:
      'opacity 0.3s ease, transform 0.2s ease, background 0.15s ease, box-shadow 0.15s ease',
    zIndex: 2
  }

  const btnHoverIn = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.currentTarget.style.background = palette.textColor
    e.currentTarget.style.color = palette.docCardBg
    e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
  }

  const btnHoverOut = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.currentTarget.style.background = palette.docCardBg
    e.currentTarget.style.color = palette.textSecondary
    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
  }

  return (
    <div
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={() => data.onOpen(doc)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 220,
          minHeight: 140,
          background: palette.docCardBg,
          borderRadius: 14,
          boxShadow: palette.docCardShadow,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid ${palette.docCardBorder}`,
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <RiFileTextLine size={18} style={{ color: palette.docIconColor }} />
          <span
            className="font-semibold truncate"
            style={{ fontSize: 14, flex: 1, color: palette.textColor }}
          >
            {doc.title}
          </span>
        </div>
        {doc.summary && (
          <div
            className="line-clamp-3"
            style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8, color: palette.textSecondary }}
          >
            {doc.summary}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: palette.textSecondary }}>
          {doc.word_count} 字 · {new Date(doc.updated_at).toLocaleDateString('zh-CN')}
        </span>
      </div>

      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0 }}>
        <button
          style={{
            ...arcBtnBase,
            transform: hovered ? 'translate(-37px, -33px)' : 'translate(-37px, -33px) scale(0.6)'
          }}
          onClick={(e) => {
            e.stopPropagation()
            data.onArchive(doc)
          }}
          title="归档到知识库目录"
          onMouseEnter={btnHoverIn}
          onMouseLeave={btnHoverOut}
        >
          <RiInboxArchiveLine size={14} />
        </button>
        <button
          style={{
            ...arcBtnBase,
            transform: hovered ? 'translate(-3px, -27px)' : 'translate(-3px, -27px) scale(0.6)'
          }}
          onClick={(e) => {
            e.stopPropagation()
            data.onEdit(doc)
          }}
          title="编辑文档"
          onMouseEnter={btnHoverIn}
          onMouseLeave={btnHoverOut}
        >
          <RiPencilLine size={14} />
        </button>
        <button
          style={{
            ...arcBtnBase,
            transform: hovered ? 'translate(6px, 7px)' : 'translate(6px, 7px) scale(0.6)'
          }}
          onClick={(e) => {
            e.stopPropagation()
            Modal.confirm({
              title: '确定要删除这篇文档吗？',
              content: '删除后无法恢复。',
              onOk: () => data.onDelete(doc),
              okText: '确定',
              cancelText: '取消'
            })
          }}
          title="删除文档"
          onMouseEnter={btnHoverIn}
          onMouseLeave={btnHoverOut}
        >
          <RiDeleteBinLine size={14} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(DocNode)
