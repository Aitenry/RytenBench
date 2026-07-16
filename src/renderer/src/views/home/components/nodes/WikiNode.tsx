import React, { useState } from 'react'
import { Tag, Modal } from 'antd'
import { RiBook2Line, RiPencilLine, RiInboxArchiveLine, RiBubbleChartLine } from '@remixicon/react'
import type { NodeProps, Node } from '@xyflow/react'
import GraphView from '@renderer/components/graph/GraphView'
import type { WikiRow } from '@renderer/types/models'
import type { ThemePalette } from '@renderer/types/components'
import { parseTags } from '../../utils/canvasUtils'

/* ──────────── React Flow node data type ──────────── */

export interface WikiNodeData extends Record<string, unknown> {
  wiki: WikiRow
  palette: ThemePalette
  onOpen: (wiki: WikiRow) => void
  onEdit: (wiki: WikiRow) => void
  onArchive: (wiki: WikiRow) => void
}

/** Type A: Wiki folder — stacked paper look */
const WikiNode: React.FC<NodeProps<Node<WikiNodeData>>> = ({ data }) => {
  const { wiki, palette } = data
  const [hovered, setHovered] = useState(false)
  const [graphModalOpen, setGraphModalOpen] = useState(false)
  const tags = parseTags(wiki.tags)

  const arcBtnBase: React.CSSProperties = {
    position: 'absolute',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    background: palette.wikiCardBg,
    color: palette.textSecondary,
    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
    opacity: hovered ? 1 : 0,
    transform: hovered ? undefined : 'scale(0.6)',
    transition:
      'opacity 0.3s ease, transform 0.2s ease, background 0.15s ease, box-shadow 0.15s ease',
    zIndex: 2
  }

  return (
    <>
      <div
        style={{ cursor: 'pointer', position: 'relative' }}
        onClick={() => data.onOpen(wiki)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* stacked paper layers behind */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 4,
            width: 240,
            height: 200,
            background: palette.wikiStackOuter,
            borderRadius: 14,
            transform: 'rotate(-1.5deg)',
            boxShadow: palette.wikiStackShadow
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 2,
            width: 240,
            height: 200,
            background: palette.wikiStackInner,
            borderRadius: 14,
            transform: 'rotate(0.8deg)',
            boxShadow: palette.wikiStackShadow
          }}
        />
        {/* main card */}
        <div
          style={{
            position: 'relative',
            width: 240,
            minHeight: 200,
            background: palette.wikiCardBg,
            borderRadius: 14,
            boxShadow: palette.wikiCardShadow,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'box-shadow 0.2s ease'
          }}
          className="hover:shadow-lg"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <RiBook2Line size={20} style={{ color: palette.wikiIconColor }} />
            <span
              className="font-semibold truncate"
              style={{ fontSize: 15, flex: 1, color: palette.textColor }}
            >
              {wiki.title}
            </span>
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {tags.map((tag, i) => (
                <Tag key={i} style={{ margin: 0, fontSize: 11 }}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}
          {wiki.summary && (
            <div
              className="line-clamp-3"
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                marginBottom: 12,
                fontStyle: 'italic',
                color: palette.textSecondary
              }}
            >
              {wiki.summary}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 'auto'
            }}
          >
            <span style={{ fontSize: 11, color: palette.textSecondary }}>
              {new Date(wiki.updated_at).toLocaleDateString('zh-CN')}
            </span>
            <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
              {wiki.doc_count} 篇
            </Tag>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0 }}>
          <button
            style={{
              ...arcBtnBase,
              transform: hovered ? 'translate(-37px, -33px)' : 'translate(-37px, -33px) scale(0.6)'
            }}
            onClick={(e) => {
              e.stopPropagation()
              data.onArchive(wiki)
            }}
            title="归档文档到知识库"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = palette.wikiIconColor
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = palette.wikiCardBg
              e.currentTarget.style.color = palette.textSecondary
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
            }}
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
              data.onEdit(wiki)
            }}
            title="编辑知识库"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = palette.wikiIconColor
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = palette.wikiCardBg
              e.currentTarget.style.color = palette.textSecondary
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
            }}
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
              setGraphModalOpen(true)
            }}
            title="查看知识图谱"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = palette.wikiIconColor
              e.currentTarget.style.color = '#fff'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = palette.wikiCardBg
              e.currentTarget.style.color = palette.textSecondary
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
            }}
          >
            <RiBubbleChartLine size={14} />
          </button>
        </div>
      </div>
      <Modal
        title={`知识图谱`}
        open={graphModalOpen}
        onCancel={() => setGraphModalOpen(false)}
        width="calc(100vw - 60px)"
        centered
        styles={{ body: { height: 'calc(100vh - 130px)', overflow: 'hidden', padding: 0 } }}
        footer={null}
      >
        <GraphView selectedWiki={wiki} />
      </Modal>
    </>
  )
}

export default React.memo(WikiNode)
