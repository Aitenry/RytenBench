import React from 'react'
import { RiLoopRightLine } from '@remixicon/react'

/**
 * 「继续执行」这类短指令的分隔行。
 *
 * 用户 2026-09-19 反馈：「会出现独立的内容，是因为断开之后，用户会发送『继续执行』，
 * 这个导致页面看起来不连贯。」自动续跑断开（被 disarm / 停止生成）后，用户会手动发一句
 * 「继续执行」——它被渲染成一个独立的用户气泡，于是页面上出现
 * 「续跑批次行 → 蓝色提问气泡 → 又一轮回复」这种断开的观感。
 *
 * 它本质是「再跑一轮」的控制指令，不是提问：这里渲染成一条低调的居中分隔行，
 * 让页面读起来是连续的；批次把它吸收进去时也复用同一外观。
 */
const ContinuationNote: React.FC<{
  text: string
  colorTextSecondary: string
  colorBorderSecondary: string
}> = ({ text, colorTextSecondary, colorBorderSecondary }) => (
  // min-width:0 / max-width:100%：与续跑横幅同一套收缩策略，窄窗口不撑宽容器
  <div className="flex justify-center mb-4" style={{ minWidth: 0, maxWidth: '100%' }}>
    <div
      data-goal-continuation
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 10,
        color: colorTextSecondary,
        fontSize: 12,
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden'
      }}
    >
      <RiLoopRightLine size={12} style={{ flex: '0 0 auto', opacity: 0.7 }} />
      <span
        style={{
          minWidth: 0,
          flex: '0 1 auto',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {text}
      </span>
      <span
        style={{
          flex: '1 1 auto',
          minWidth: 24,
          height: 1,
          background: colorBorderSecondary,
          opacity: 0.6
        }}
      />
    </div>
  </div>
)

export default ContinuationNote
