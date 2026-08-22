import React, { useEffect, useRef, useState } from 'react'
import { renderMermaidDiagram } from './mermaid'

interface MermaidDiagramProps {
  code: string
  isDarkMode?: boolean
}

/** 只读预览中的 Mermaid 图表（mermaid 包懒加载，主题跟随明暗） */
const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, isDarkMode = false }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const blockRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    // 保留上一张图直到新图就绪，避免内容更新时闪烁/高度跳动
    renderMermaidDiagram(code, isDarkMode)
      .then((result) => {
        if (cancelled) return
        setSvg(result)
        setState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [code, isDarkMode])

  // 把 SVG 等比缩小到可见区域（聊天/预览无画布交互，须保证整图可见）
  useEffect(() => {
    if (state !== 'ready' || !blockRef.current) return
    const svgEl = blockRef.current.querySelector('svg')
    const vb = svgEl?.viewBox?.baseVal
    if (!svgEl || !vb || vb.width <= 0 || vb.height <= 0) return
    const availW = Math.max(1, blockRef.current.clientWidth - 32)
    const availH = Math.max(1, Math.min(window.innerHeight * 0.6, 480) - 32)
    const scale = Math.min(1, availW / vb.width, availH / vb.height)
    svgEl.style.width = `${Math.round(vb.width * scale)}px`
    svgEl.style.height = `${Math.round(vb.height * scale)}px`
  }, [state, svg])

  if (state === 'error') {
    return (
      <div className="mermaid-block mermaid-error">
        <div>图表语法错误：{error}</div>
      </div>
    )
  }

  // 加载中但已有旧图：继续展示旧图（仅首次无图时显示加载提示）
  if (!svg) {
    return <div className="mermaid-block mermaid-loading">图表渲染中…</div>
  }

  return <div ref={blockRef} className="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />
}

export default MermaidDiagram
