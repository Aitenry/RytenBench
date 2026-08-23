import React from 'react'
import { theme } from 'antd'
import { useTheme } from '@renderer/contexts/useTheme'

export type RouteSkeletonVariant = 'chat' | 'planner' | 'music'

const MONO_FONT = "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace"

const SKELETON_CSS = `
.rb-skel-block {
  animation: rb-skel-pulse 1.8s ease-in-out infinite;
}
@keyframes rb-skel-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
.rb-skel-tag {
  position: absolute;
  right: 12px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ${MONO_FONT};
  font-size: 10px;
  letter-spacing: 0.16em;
  user-select: none;
  pointer-events: none;
}
.rb-skel-tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  animation: rb-skel-dot 1.2s ease-in-out infinite;
}
@keyframes rb-skel-dot {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
`

/**
 * 路由级骨架屏：切页时若目标页面 chunk 尚未加载完成，立即呈现对应页面的
 * 骨架结构（话题栏 / 甘特图 / 歌单），替代原来的居中转圈与「卡在上一页」。
 * 颜色取自 antd token，浅色 / 深色主题自动适配；右下角一枚等宽「LOADING」
 * 标签呼应编辑部的等宽标签语言。
 */
const RouteSkeleton: React.FC<{ variant: RouteSkeletonVariant }> = ({ variant }) => {
  const {
    token: {
      colorBgContainer,
      colorBgLayout,
      colorBorderSecondary,
      colorPrimary,
      colorTextTertiary
    }
  } = theme.useToken()
  const { effectiveTheme } = useTheme()
  const isDark = effectiveTheme === 'dark'

  const blockColor = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'
  const trackColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'

  const block = (
    w: number | string,
    h: number,
    r = 6,
    color: string = blockColor
  ): React.ReactElement => (
    <div
      className="rb-skel-block"
      style={{ width: w, height: h, borderRadius: r, background: color, flexShrink: 0 }}
    />
  )

  let content: React.ReactNode
  if (variant === 'chat') {
    content = (
      <div className="flex h-full w-full min-h-0" style={{ background: colorBgContainer }}>
        {/* 话题侧栏 */}
        <div
          className="flex flex-col gap-3 px-3 py-4"
          style={{ width: 230, flexShrink: 0, borderRight: `1px solid ${colorBorderSecondary}` }}
        >
          <div className="flex items-center gap-2.5">
            {block(30, 30, 10)}
            {block(120, 13)}
          </div>
          <div style={{ height: 10 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {block(128 - (i % 3) * 16, 12)}
              {block(84, 9)}
            </div>
          ))}
        </div>
        {/* 主区：头部 + 消息区 + 输入框 */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="flex items-center gap-3 px-4"
            style={{
              height: 52,
              flexShrink: 0,
              borderBottom: `1px solid ${colorBorderSecondary}`
            }}
          >
            {block(24, 24, 8)}
            {block(150, 13)}
            <div className="flex-1" />
            {block(64, 26, 8)}
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 px-8 py-6">
            <div className="flex w-full max-w-3xl flex-col gap-3">
              <div className="flex justify-center">{block(220, 14)}</div>
              {block(300, 56, 12)}
              {block(380, 72, 12)}
              <div className="self-end">{block(260, 44, 12)}</div>
            </div>
            {block('100%', 110, 14)}
          </div>
        </div>
      </div>
    )
  } else if (variant === 'planner') {
    content = (
      <div className="flex h-full w-full flex-col" style={{ background: colorBgContainer }}>
        {/* 顶部工具栏 */}
        <div
          className="flex items-center gap-2.5 px-4"
          style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${colorBorderSecondary}` }}
        >
          {block(96, 30, 8)}
          {block(96, 30, 8)}
          <div className="flex-1" />
          {block(64, 30, 8)}
        </div>
        <div className="flex min-h-0 flex-1">
          {/* 任务树 */}
          <div
            className="flex flex-col gap-2.5 p-4"
            style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${colorBorderSecondary}` }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col gap-1.5" style={{ paddingLeft: (i % 3) * 14 }}>
                {block(150 - (i % 3) * 26, 12)}
                {block(96, 9)}
              </div>
            ))}
          </div>
          {/* 甘特图 */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            {block('100%', 10)}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-3">
                {block(22, 14)}
                <div
                  className="flex-1"
                  style={{
                    height: 30,
                    borderRadius: 6,
                    background: trackColor,
                    overflow: 'hidden'
                  }}
                >
                  {/* 甘特条用强调色点缀，呼应单色强调的设计语言 */}
                  <div
                    className="rb-skel-block"
                    style={{
                      width: `${32 + ((i * 13) % 55)}%`,
                      height: '100%',
                      borderRadius: 6,
                      background: `color-mix(in srgb, ${colorPrimary} 30%, transparent)`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  } else {
    content = (
      <div className="flex h-full w-full gap-2.5 p-2.5" style={{ background: colorBgLayout }}>
        {/* 歌单侧栏 */}
        <div
          className="flex flex-col gap-2.5 p-3"
          style={{ width: 200, flexShrink: 0, background: colorBgContainer, borderRadius: 10 }}
        >
          {block(28, 28, 10)}
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              {block(150 - (i % 2) * 14, 12)}
              {block(76, 9)}
            </div>
          ))}
        </div>
        {/* 主区：正在播放 + 列表 + 播放控制条 */}
        <div
          className="flex min-w-0 flex-1 flex-col"
          style={{ background: colorBgContainer, borderRadius: 10, overflow: 'hidden' }}
        >
          <div
            className="flex items-center gap-5 p-5"
            style={{ borderBottom: `1px solid ${colorBorderSecondary}` }}
          >
            {block(112, 112, 12)}
            <div className="flex flex-col gap-2.5">
              {block(190, 18)}
              {block(130, 12)}
              {block(88, 10)}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                {block(16, 16, 5)}
                {block(190, 13)}
                {block(120, 11)}
                <div className="flex-1" />
                {block(36, 11)}
              </div>
            ))}
          </div>
          <div
            className="flex items-center gap-4 px-5"
            style={{ height: 64, flexShrink: 0, borderTop: `1px solid ${colorBorderSecondary}` }}
          >
            {block(36, 36, 8)}
            <div className="flex flex-col gap-1.5">
              {block(130, 10, 5)}
              {block(72, 8, 5)}
            </div>
            <div className="flex-1" />
            {block(22, 22, 6)}
            {block(30, 30, 15)}
            {block(22, 22, 6)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full min-h-0 overflow-hidden">
      <style>{SKELETON_CSS}</style>
      {content}
      <div className="rb-skel-tag" style={{ color: colorTextTertiary }}>
        <span className="rb-skel-tag-dot" style={{ background: colorPrimary }} />
        LOADING
      </div>
    </div>
  )
}

export default RouteSkeleton
