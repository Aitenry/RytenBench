import React from 'react'
import { SKELETON_CSS, skeletonVars, useSkeletonPalette } from './skeleton-palette'

/**
 * 全局骨架屏物料（加载态的唯一真源）。
 *
 * 背景：改版前项目的加载态混着三套语言——antd `Spin` / `LoadingOutlined` / `RiLoader2Line spin-anim`，
 * 同一个列表上方换个页面就换个转圈样式。2026-09-26 起统一成骨架屏：结构先到位、数据随后填，
 * 避免「整块空白 + 居中转圈」的跳变。
 *
 * 节奏与取色沿用 RouteSkeleton 那一套（1.8s ease-in-out 的透明度呼吸；
 * 深色 rgba(255,255,255,.09) / 浅色 rgba(0,0,0,.06)），路由级骨架（route/RouteSkeleton.tsx）
 * 与组件级骨架共用同一套底层常量——见同目录 skeleton-palette.ts。
 *
 * 取色走 CSS 变量：预设根节点调用一次 useSkeletonPalette()，把 --rb-skel-block / --rb-skel-track
 * 写进内联样式，子树里的 SkeletonBlock 直接引用变量——仪表盘这种几十块的结构没必要一块读一次 token。
 */

/** 同一屏幕里可能同时挂多个骨架预设：样式表重复注入同一条规则没有副作用 */
export const SkeletonStyle: React.FC = () => <style>{SKELETON_CSS}</style>

/**
 * 骨架块：唯一的原子件。宽高圆角都显式给，保证结构稳定（不用随机宽度）。
 * 不传 color 时用根节点上的 --rb-skel-block；没有预设根节点（裸用）时退到 SKELETON_CSS 里的
 * 中灰兜底色，深浅色主题都看得见。
 */
export const SkeletonBlock: React.FC<{
  w?: number | string
  h?: number
  r?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}> = ({ w = '100%', h = 12, r = 6, color, className, style }) => (
  <div
    className={className ? `rb-skel-block ${className}` : 'rb-skel-block'}
    style={{
      width: w,
      height: h,
      borderRadius: r,
      background: color,
      flexShrink: 0,
      ...style
    }}
  />
)

/** 段落文本骨架：宽度按固定 pattern 递变（用随机数会让每次渲染的结构都在抖） */
const TEXT_RATIOS = [1, 0.94, 0.82, 0.97, 0.7, 0.88, 0.62]

export const SkeletonTextLines: React.FC<{
  lines?: number
  height?: number
  gap?: number
  dark?: boolean
}> = ({ lines = 5, height = 11, gap = 9, dark }) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div className="flex flex-col" style={{ ...skeletonVars(palette), gap }}>
      <SkeletonStyle />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock
          key={i}
          w={`${Math.round(TEXT_RATIOS[i % TEXT_RATIOS.length] * 100)}%`}
          h={height}
          r={5}
        />
      ))}
    </div>
  )
}

/**
 * 列表骨架：
 * - line    ：单行（可带前置图标位）——目录、文件夹列表
 * - stacked ：两行堆叠（标题 + 副信息）——话题栏、笔记列表
 */
export const SkeletonListRows: React.FC<{
  rows?: number
  variant?: 'line' | 'stacked'
  icon?: boolean
  dark?: boolean
}> = ({ rows = 4, variant = 'line', icon = false, dark }) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div
      className="flex flex-col"
      style={{ ...skeletonVars(palette), gap: variant === 'stacked' ? 14 : 4 }}
    >
      <SkeletonStyle />
      {Array.from({ length: rows }, (_, i) =>
        variant === 'stacked' ? (
          <div key={i} className="flex flex-col gap-1.5 px-1">
            <SkeletonBlock w={`${74 - (i % 3) * 9}%`} h={12} />
            <SkeletonBlock w={`${48 - (i % 2) * 8}%`} h={9} r={4} />
          </div>
        ) : (
          <div key={i} className="flex items-center gap-2 px-1" style={{ height: 28 }}>
            {icon ? <SkeletonBlock w={13} h={13} r={4} /> : null}
            <SkeletonBlock w={`${64 - (i % 3) * 11}%`} h={11} r={5} />
          </div>
        )
      )}
    </div>
  )
}

/** 设置面板行骨架：左「标题 + 描述」右「控件」，行间发丝线，对齐 SettingRow */
export const SkeletonSettingRows: React.FC<{ rows?: number; dark?: boolean }> = ({
  rows = 4,
  dark
}) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div style={skeletonVars(palette)}>
      <SkeletonStyle />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center"
          style={{
            gap: 12,
            padding: '11px 0',
            borderBottom: i === rows - 1 ? 'none' : `1px solid ${palette.hairline}`
          }}
        >
          <div className="flex flex-col gap-1.5" style={{ flex: 1, minWidth: 0 }}>
            <SkeletonBlock w={`${40 - (i % 3) * 6}%`} h={12} />
            <SkeletonBlock w={`${60 - (i % 2) * 14}%`} h={9} r={4} />
          </div>
          <SkeletonBlock w={28} h={16} r={8} />
        </div>
      ))}
    </div>
  )
}

/** 消息流骨架：加载更早的消息时用，左右交错的气泡轮廓 */
export const SkeletonMessages: React.FC<{ rows?: number; dark?: boolean }> = ({
  rows = 2,
  dark
}) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div className="flex flex-col gap-3" style={skeletonVars(palette)}>
      <SkeletonStyle />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={i % 2 === 0 ? 'flex justify-start' : 'flex justify-end'}>
          <SkeletonBlock w={i % 2 === 0 ? '58%' : '42%'} h={i % 2 === 0 ? 42 : 34} r={12} />
        </div>
      ))}
    </div>
  )
}

/** 图谱画布骨架：中心节点 + 六条辐条 + 环绕节点，先把画布的结构占住 */
export const SkeletonGraph: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const palette = useSkeletonPalette(dark)
  const spokes = [0, 60, 120, 180, 240, 300]
  const radius = 150
  const satellite = 44
  return (
    <div
      className="relative h-full w-full"
      style={{ ...skeletonVars(palette), padding: 20, overflow: 'hidden' }}
    >
      <SkeletonStyle />
      <div className="flex items-center gap-2">
        <SkeletonBlock w={10} h={10} r={3} color={palette.accent} />
        <SkeletonBlock w={72} h={10} r={5} />
      </div>
      <div className="absolute inset-0">
        <div className="absolute" style={{ left: '50%', top: '50%' }}>
          {spokes.map((deg) => (
            <div
              key={`spoke-${deg}`}
              className="rb-skel-block"
              style={{
                position: 'absolute',
                width: radius,
                height: 1,
                background: palette.track,
                transformOrigin: '0 50%',
                transform: `rotate(${deg}deg)`
              }}
            />
          ))}
          {spokes.map((deg) => {
            const rad = (deg * Math.PI) / 180
            return (
              <SkeletonBlock
                key={`node-${deg}`}
                w={satellite}
                h={satellite}
                r={satellite / 2}
                style={{
                  position: 'absolute',
                  left: Math.cos(rad) * radius - satellite / 2,
                  top: Math.sin(rad) * radius - satellite / 2
                }}
              />
            )
          })}
          <SkeletonBlock
            w={92}
            h={92}
            r={46}
            color={palette.accent}
            style={{ position: 'absolute', left: -46, top: -46 }}
          />
        </div>
      </div>
    </div>
  )
}

/** 首页仪表盘骨架：问候 + 统计三块 + 快速新建三块 + 两栏列表（对齐 EmptyDashboard 排版） */
export const SkeletonDashboard: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div
      className="custom-scrollbar"
      style={{ ...skeletonVars(palette), flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}
    >
      <SkeletonStyle />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 40px 56px' }}>
        <SkeletonBlock w={210} h={26} r={8} />
        <div style={{ marginTop: 10, marginBottom: 24 }}>
          <SkeletonBlock w={280} h={12} r={5} />
        </div>

        <div className="flex" style={{ gap: 12, marginBottom: 24 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '16px 18px',
                borderRadius: 12,
                border: `1px solid ${palette.hairline}`
              }}
            >
              <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
                <SkeletonBlock w={15} h={15} r={4} />
                <SkeletonBlock w={48} h={10} r={5} />
              </div>
              <SkeletonBlock w={42} h={22} r={6} />
              <div style={{ marginTop: 8 }}>
                <SkeletonBlock w={106} h={10} r={5} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex" style={{ gap: 12, marginBottom: 28 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, minWidth: 0 }}>
              <SkeletonBlock h={42} r={10} />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[0, 1].map((col) => (
            <div key={col}>
              <div style={{ marginBottom: 12 }}>
                <SkeletonBlock w={92} h={12} r={5} />
              </div>
              <div className="flex flex-col" style={{ gap: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonBlock key={i} h={36} r={8} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 文档编辑器骨架：标题 + 元信息行 + 三段落（段落宽度逐段收窄） */
export const SkeletonDocPane: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div
      className="custom-scrollbar"
      style={{ ...skeletonVars(palette), flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}
    >
      <SkeletonStyle />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 40px 64px' }}>
        <SkeletonBlock w="62%" h={28} r={8} />
        <div className="flex items-center" style={{ gap: 10, marginTop: 14, marginBottom: 28 }}>
          <SkeletonBlock w={64} h={10} r={5} />
          <SkeletonBlock w={88} h={10} r={5} />
          <SkeletonBlock w={52} h={10} r={5} />
        </div>
        {[0, 1, 2].map((p) => (
          <div key={p} className="flex flex-col" style={{ gap: 10, marginBottom: 26 }}>
            <SkeletonBlock w={`${Math.max(40, 54 - p * 7)}%`} h={15} r={5} />
            <SkeletonTextLines lines={p === 1 ? 4 : 3} height={11} gap={10} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 待办面板骨架：勾选位 + 标题 + 字段胶囊行 + 正文 */
export const SkeletonTodoPane: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const palette = useSkeletonPalette(dark)
  return (
    <div
      className="custom-scrollbar"
      style={{ ...skeletonVars(palette), flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}
    >
      <SkeletonStyle />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 40px 64px' }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <SkeletonBlock w={20} h={20} r={7} />
          <SkeletonBlock w="46%" h={22} r={7} />
        </div>
        <div
          className="flex"
          style={{ gap: 10, marginTop: 20, marginBottom: 26, flexWrap: 'wrap' }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center"
              style={{
                gap: 8,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${palette.hairline}`
              }}
            >
              <SkeletonBlock w={13} h={13} r={4} />
              <SkeletonBlock w={56} h={10} r={5} />
            </div>
          ))}
        </div>
        <SkeletonTextLines lines={6} height={11} gap={10} />
      </div>
    </div>
  )
}
