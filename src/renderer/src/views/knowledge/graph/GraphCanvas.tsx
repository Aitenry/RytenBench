import React, { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { theme } from 'antd'
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
  const {
    token: { colorBgContainer }
  } = theme.useToken()

  useEffect(() => {
    if (!containerRef.current || !data) return

    const chart = getOrCreateChart(containerRef.current)
    const count = data.nodes.length
    const cw = containerRef.current.clientWidth || 800
    const ch = containerRef.current.clientHeight || 600
    const cx = cw / 2
    const cy = ch / 2
    const padding = 60
    const maxR = Math.min(cx, cy) - padding

    // Node size scales down as count grows — sqrt phyllotaxis needs breathing room
    const symbolSize = count <= 10 ? 28 : count <= 30 ? 20 : count <= 80 ? 14 : 10

    // Sunflower phyllotaxis: optimal disk packing. sqrt(r) ∝ i for constant area density
    const phi = (1 + Math.sqrt(5)) / 2
    const goldenAngle = (2 * Math.PI) / (phi * phi)

    const positionedNodes = data.nodes.map((node, i) => {
      const r = maxR * Math.sqrt((i + 0.5) / count)
      const angle = i * goldenAngle
      return {
        ...node,
        symbolSize,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        fixed: true
      }
    })

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
                textStyle: { fontSize: 11 }
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
            fontSize: 10,
            color: '#333'
          },
          labelLayout: {
            hideOverlap: true
          },
          scaleLimit: {
            min: 0.3,
            max: 4
          },
          lineStyle: {
            color: 'source',
            curveness: 0.15,
            opacity: 0.35
          },
          emphasis: {
            focus: 'adjacency',
            lineStyle: {
              width: 2.5,
              opacity: 0.9
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
  }, [data, onEntityClick, onEntityDblClick, colorBgContainer])

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
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: colorBgContainer }}
    />
  )
}

export default GraphCanvas
