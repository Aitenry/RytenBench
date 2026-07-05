import React, { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { Button, theme } from 'antd'
import { RiEyeLine, RiEyeOffLine } from '@remixicon/react'
import { useTheme } from '@renderer/contexts/ThemeContext'
import { GraphEntity } from './types'

/** ECharts graph node (built in Index.tsx useMemo) */
export interface GraphChartNode {
  id: string
  name: string
  category: number
  symbolSize: number
  original: GraphEntity
}

/** ECharts graph link (built in Index.tsx useMemo) */
export interface GraphChartLink {
  source: string
  target: string
  label: string
}

/** ECharts graph category (built in Index.tsx useMemo) */
export interface GraphChartCategory {
  name: string
  itemStyle: { color: string }
}

/** Complete ECharts graph data (from Index.tsx useMemo) */
export interface GraphChartData {
  nodes: GraphChartNode[]
  links: GraphChartLink[]
  categories: GraphChartCategory[]
}

interface GraphCanvasProps {
  data: GraphChartData
  onEntityClick: (entity: GraphEntity) => void
  onEntityDblClick?: (entity: GraphEntity) => void
  searchQuery?: string
}

let _chart: echarts.ECharts | null = null
let _container: HTMLDivElement | null = null

function getOrCreateChart(container: HTMLDivElement): echarts.ECharts {
  if (_chart && !_chart.isDisposed() && _container === container) return _chart
  if (_chart && !_chart.isDisposed()) _chart.dispose()
  _chart = echarts.init(container)
  _container = container
  return _chart
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({ data, onEntityClick, onEntityDblClick }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hideIsolated, setHideIsolated] = useState(true)
  const {
    token: { colorBgContainer }
  } = theme.useToken()
  const { effectiveTheme } = useTheme()
  const isDarkMode = effectiveTheme === 'dark'

  // Count isolated nodes (no connections) — used by both chart and hint overlay
  const connectedNodeIds = new Set<string>()
  for (const link of data.links) {
    connectedNodeIds.add(String(link.source))
    connectedNodeIds.add(String(link.target))
  }
  const connectedNodes = data.nodes.filter((n) => connectedNodeIds.has(n.id))
  const isolatedCount = data.nodes.length - connectedNodes.length

  useEffect(() => {
    if (!containerRef.current || !data) return

    const chart = getOrCreateChart(containerRef.current)
    const cw = containerRef.current.clientWidth || 800
    const ch = containerRef.current.clientHeight || 600
    const cx = cw / 2
    const cy = ch / 2
    const padding = 40
    const maxR = Math.min(cx, cy) - padding

    // If all nodes are isolated, show all to avoid blank canvas
    const nodesToRender = hideIsolated && connectedNodes.length > 0 ? connectedNodes : data.nodes
    const effectiveCount = nodesToRender.length

    // Node size: aggressively shrink for large graphs
    const symbolSize =
      effectiveCount <= 10
        ? 28
        : effectiveCount <= 30
          ? 22
          : effectiveCount <= 80
            ? 16
            : effectiveCount <= 200
              ? 12
              : effectiveCount <= 500
                ? 8
                : 5

    // Sunflower phyllotaxis: optimal disk packing. sqrt(r) ∝ i for constant area density
    const phi = (1 + Math.sqrt(5)) / 2
    const goldenAngle = (2 * Math.PI) / (phi * phi)

    const positionedNodes = nodesToRender.map((node, i) => {
      const r = maxR * Math.sqrt((i + 0.5) / effectiveCount)
      const angle = i * goldenAngle
      return {
        ...node,
        symbolSize,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        fixed: true
      }
    })

    // Dynamic visual scaling based on graph size
    const labelFontSize =
      effectiveCount <= 50 ? 11 : effectiveCount <= 200 ? 9 : effectiveCount <= 500 ? 8 : 7
    const lineOpacity = 0.35
    const lineWidth = 1

    const option: EChartsOption = {
      backgroundColor: colorBgContainer,
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; data?: { name?: string; label?: string } }
          if (p.dataType === 'node') {
            return `<b>${p.data?.name || ''}</b>`
          }
          if (p.dataType === 'edge') {
            return p.data?.label || ''
          }
          return ''
        }
      },
      legend:
        data.categories.length > 0
          ? [
              {
                data: data.categories.map((c) => c.name),
                orient: 'vertical',
                left: 8,
                top: 8,
                textStyle: { fontSize: effectiveCount > 300 ? 10 : 11 }
              }
            ]
          : undefined,
      series: [
        {
          type: 'graph',
          layout: 'none',
          data: positionedNodes,
          links: data.links.map((l) => ({
            source: l.source,
            target: l.target,
            data: { label: l.label }
          })),
          categories: data.categories,
          roam: true,
          label: {
            show: true,
            position: 'right',
            formatter: '{b}',
            fontSize: labelFontSize,
            color: isDarkMode ? 'rgba(255,255,255,0.75)' : '#333'
          },
          labelLayout: {
            hideOverlap: true
          },
          scaleLimit: {
            min: 0.2,
            max: 6
          },
          lineStyle: {
            color: 'source',
            curveness: 0.15,
            width: lineWidth,
            opacity: lineOpacity
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 3,
              opacity: 0.95
            },
            label: {
              show: true,
              fontSize: Math.max(labelFontSize, 10)
            }
          }
        }
      ]
    }

    chart.setOption(option, true)

    // Handle click
    const handleClick = (params: unknown): void => {
      const p = params as { dataType?: string; data?: { original?: GraphEntity } }
      if (p.dataType === 'node' && p.data?.original) {
        onEntityClick(p.data.original)
      }
    }
    chart.off('click')
    chart.on('click', handleClick)

    // Handle double click
    if (onEntityDblClick) {
      const handleDblClick = (params: unknown): void => {
        const p = params as { dataType?: string; data?: { original?: GraphEntity } }
        if (p.dataType === 'node' && p.data?.original) {
          onEntityDblClick(p.data.original)
        }
      }
      chart.off('dblclick')
      chart.on('dblclick', handleDblClick)
    }
  }, [data, onEntityClick, onEntityDblClick, colorBgContainer, hideIsolated])

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      if (_chart && !_chart.isDisposed()) {
        _chart.resize()
      }
    })
    ro.observe(container)
    return () => {
      ro.disconnect()
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: colorBgContainer }}
      />
      {isolatedCount > 0 && (
        <>
          <Button
            type="dashed"
            shape="circle"
            size="small"
            icon={hideIsolated ? <RiEyeOffLine size={14} /> : <RiEyeLine size={14} />}
            title={hideIsolated ? `显示 ${isolatedCount} 个孤点` : `隐藏 ${isolatedCount} 个孤点`}
            onClick={() => setHideIsolated(!hideIsolated)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10
            }}
          />
          {hideIsolated && (
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                padding: '4px 10px',
                background: 'rgba(0,0,0,0.6)',
                color: '#fff',
                borderRadius: 4,
                fontSize: 11,
                pointerEvents: 'none',
                zIndex: 10
              }}
            >
              已隐藏 {isolatedCount} 个孤点
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default GraphCanvas
