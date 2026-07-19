import React, { useRef, useEffect, useMemo, useCallback } from 'react'
import { theme } from 'antd'
import { PRIORITY_MAP, DAY_COL_WIDTH, ROW_HEIGHT } from '@renderer/types/planner'
import type { PlannerTreeNode } from '@renderer/types/planner'

interface Props {
  tree: PlannerTreeNode[]
  selectedId: number | null
  collapsedIds: Set<number>
  onSelect: (id: number) => void
  ganttRef: React.RefObject<HTMLDivElement | null>
  treeScrollRef: React.RefObject<HTMLDivElement | null>
}

interface FlatRow {
  id: number
  title: string
  type: string
  start_date: string | null
  end_date: string | null
  progress: number
  priority: number
  dependencies: number[]
}

interface DepArrow {
  fromId: number
  toId: number
}

/** 从树数据中计算甘特图的时间范围 */
function computeDateRange(flatRows: FlatRow[]): { start: Date; end: Date } {
  let minTime = Infinity
  let maxTime = -Infinity

  for (const row of flatRows) {
    if (row.start_date) {
      const t = new Date(row.start_date).getTime()
      if (t < minTime) minTime = t
    }
    if (row.end_date) {
      const t = new Date(row.end_date).getTime()
      if (t > maxTime) maxTime = t
    }
  }

  if (minTime === Infinity || maxTime === -Infinity) {
    // 无任何日期数据，默认使用今天前后各7天
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(start.getDate() - 3)
    const end = new Date(today)
    end.setDate(end.getDate() + 14)
    return { start, end }
  }

  const start = new Date(minTime)
  start.setDate(start.getDate())
  start.setHours(0, 0, 0, 0)

  const end = new Date(maxTime)
  end.setDate(end.getDate())
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

/** 递归计算节点（含子节点）的聚合完成进度（按工时加权平均） */
function computeAggregateProgress(node: PlannerTreeNode): number {
  if (node.children.length === 0) return node.progress

  let totalWeight = 0
  let weightedProgress = 0

  for (const child of node.children) {
    const childProgress = computeAggregateProgress(child)
    if (child.work_hours > 0) {
      weightedProgress += child.work_hours * childProgress
      totalWeight += child.work_hours
    }
  }

  if (totalWeight === 0) return node.progress
  return Math.round(weightedProgress / totalWeight)
}

/** 生成日期范围数组 */
function getDates(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

const MS_PER_DAY = 86400000

const GanttChart: React.FC<Props> = ({
  tree,
  selectedId,
  collapsedIds,
  onSelect,
  ganttRef,
  treeScrollRef
}) => {
  const { token } = theme.useToken()
  const colWidth = DAY_COL_WIDTH
  const headerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 展平树（考虑折叠状态）
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = []

    function walk(nodes: PlannerTreeNode[]): void {
      for (const node of nodes) {
        rows.push({
          id: node.id,
          title: node.title,
          type: node.type,
          start_date: node.start_date,
          end_date: node.end_date,
          progress: computeAggregateProgress(node),
          priority: node.priority ?? 4,
          dependencies: node.dependencies
        })
        if (!collapsedIds.has(node.id)) {
          walk(node.children)
        }
      }
    }

    walk(tree)
    return rows
  }, [tree, collapsedIds])

  // 动态计算时间范围
  const { dates, totalWidth, ganttStartMs, ganttEndMs } = useMemo(() => {
    const range = computeDateRange(flatRows)
    const ds = getDates(range.start, range.end)
    return {
      dates: ds,
      totalWidth: ds.length * colWidth,
      ganttStartMs: range.start.getTime(),
      ganttEndMs: range.end.getTime()
    }
  }, [flatRows, colWidth])

  // 构建 ID -> 行索引映射
  const rowIndexMap = useMemo(() => {
    const map = new Map<number, number>()
    flatRows.forEach((r, i) => map.set(r.id, i))
    return map
  }, [flatRows])

  // 构建依赖箭头
  const depArrows = useMemo(() => {
    const arrows: DepArrow[] = []
    for (const row of flatRows) {
      for (const depId of row.dependencies) {
        if (rowIndexMap.has(depId)) {
          arrows.push({ fromId: depId, toId: row.id })
        }
      }
    }
    return arrows
  }, [flatRows, rowIndexMap])

  // 计算条形位置
  const getBarStyle = useCallback(
    (row: FlatRow) => {
      if (!row.start_date) return null
      const startMs = new Date(row.start_date).getTime()
      const endMs = row.end_date ? new Date(row.end_date).getTime() : startMs + MS_PER_DAY

      const visibleStart = Math.max(startMs, ganttStartMs)
      const visibleEnd = Math.min(endMs, ganttEndMs)

      const left = ((visibleStart - ganttStartMs) / MS_PER_DAY) * colWidth
      const width = Math.max(((visibleEnd - visibleStart) / MS_PER_DAY) * colWidth, 2)

      const priorityInfo = PRIORITY_MAP[row.priority] ?? PRIORITY_MAP[4]
      const progressPct = Math.min(row.progress, 100) / 100

      return { left, width, priorityInfo, progressPct }
    },
    [colWidth, ganttStartMs, ganttEndMs]
  )

  // 同步水平滚动
  useEffect(() => {
    const header = headerRef.current
    const body = bodyRef.current
    if (!header || !body) return

    const syncScroll = (): void => {
      header.scrollLeft = body.scrollLeft
    }
    body.addEventListener('scroll', syncScroll)
    return () => body.removeEventListener('scroll', syncScroll)
  }, [])

  // 同步垂直滚动（Gantt body 跟随 tree）
  useEffect(() => {
    const ts = treeScrollRef?.current
    const body = bodyRef.current
    if (!ts || !body) return

    const syncScroll = (): void => {
      body.scrollTop = ts.scrollTop
    }
    ts.addEventListener('scroll', syncScroll)
    return () => ts.removeEventListener('scroll', syncScroll)
  }, [treeScrollRef])

  // 计算依赖箭头 SVG 坐标
  const renderDepArrows = (): React.ReactNode[] => {
    const elements: React.ReactNode[] = []
    for (const arrow of depArrows) {
      const fromIdx = rowIndexMap.get(arrow.fromId)
      const toIdx = rowIndexMap.get(arrow.toId)
      if (fromIdx === undefined || toIdx === undefined) continue

      const fromRow = flatRows[fromIdx]
      const toRow = flatRows[toIdx]
      const fromStyle = getBarStyle(fromRow)
      const toStyle = getBarStyle(toRow)
      if (!fromStyle || !toStyle) continue

      const fromX = fromStyle.left + fromStyle.width
      const fromY = fromIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 4
      const toX = toStyle.left
      const toY = toIdx * ROW_HEIGHT + ROW_HEIGHT / 2 + 4
      const midX = (fromX + toX) / 2

      const arrowSize = 5
      elements.push(
        <g key={`dep-${arrow.fromId}-${arrow.toId}`}>
          <polyline
            points={`${fromX},${fromY} ${midX},${fromY} ${midX},${toY} ${toX - arrowSize},${toY}`}
            fill="none"
            stroke={token.colorTextQuaternary}
            strokeWidth={1.2}
            strokeDasharray="4,2"
          />
          <polygon
            points={`${toX},${toY} ${toX - arrowSize},${toY - arrowSize / 2} ${toX - arrowSize},${toY + arrowSize / 2}`}
            fill={token.colorTextQuaternary}
          />
        </g>
      )
    }
    return elements
  }

  if (!ganttRef) return null

  return (
    <div
      ref={ganttRef}
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: token.colorBgContainer }}
    >
      {/* 时间轴表头 */}
      <div
        ref={headerRef}
        className="shrink-0 overflow-hidden"
        style={{ height: 36, borderBottom: `2px solid ${token.colorBorderSecondary}` }}
      >
        <div className="flex" style={{ width: totalWidth, height: 36 }}>
          {dates.map((d, i) => (
            <div
              key={i}
              className="flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{
                width: colWidth,
                height: 36,
                color: token.colorTextTertiary,
                borderRight:
                  i < dates.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none'
              }}
            >
              {d.getMonth() + 1}月{d.getDate()}
            </div>
          ))}
        </div>
      </div>

      {/* 甘特图主体 */}
      <div
        ref={bodyRef}
        className="flex-1 custom-scrollbar overflow-auto"
        style={{ position: 'relative' }}
      >
        <div
          style={{ width: totalWidth, height: flatRows.length * ROW_HEIGHT, position: 'relative' }}
        >
          {/* 网格背景竖线 */}
          {dates.map((_, i) => (
            <div
              key={`grid-${i}`}
              style={{
                position: 'absolute',
                left: i * colWidth,
                top: 0,
                width: 1,
                height: '100%',
                background: token.colorFillQuaternary
              }}
            />
          ))}

          {/* 任务行 */}
          {flatRows.map((row, idx) => {
            const isSelected = selectedId === row.id
            const barStyle = getBarStyle(row)

            return (
              <div
                key={row.id}
                className="cursor-pointer select-none"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: idx * ROW_HEIGHT,
                  width: totalWidth,
                  height: ROW_HEIGHT,
                  background: isSelected
                    ? token.colorPrimaryBg
                    : idx % 2 === 0
                      ? token.colorFillAlter
                      : token.colorBgContainer,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`
                }}
                onClick={() => onSelect(row.id)}
              >
                {/* 任务条形 */}
                {barStyle && (
                  <div
                    style={{
                      position: 'absolute',
                      left: barStyle.left,
                      top: 8,
                      height: 20,
                      width: barStyle.width,
                      borderRadius: 4,
                      background: barStyle.priorityInfo.rgba,
                      overflow: 'hidden',
                      border: `1px solid ${barStyle.priorityInfo.hex}`
                    }}
                  >
                    {/* 已完成部分 */}
                    {barStyle.progressPct > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          height: '100%',
                          width: `${barStyle.progressPct * 100}%`,
                          background: barStyle.priorityInfo.hex,
                          borderRadius: '3px 0 0 3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          paddingLeft: 4
                        }}
                      >
                        {barStyle.progressPct > 0.15 && (
                          <span
                            style={{
                              color: '#fff',
                              fontSize: 7,
                              fontWeight: 600,
                              lineHeight: 1,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {row.progress}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* 依赖箭头 SVG 层 */}
          {depArrows.length > 0 && (
            <svg
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: totalWidth,
                height: flatRows.length * ROW_HEIGHT,
                pointerEvents: 'none'
              }}
            >
              {renderDepArrows()}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

export default GanttChart
