import React from 'react'
import { theme } from 'antd'
import { RiDatabase2Line } from '@remixicon/react'
import type { UsageDetails } from '../../utils/usage'

/**
 * 「本轮用量」面板（悬停用量徽标时弹出，位置在徽标上方）。
 *
 * 结构：标题（左标签 / 右总量）→ 发丝线 → 提供方 / 模型（长文本单独占一行，
 * 塞进右对齐的值列会被折断）→ dt/dd 数值明细 → 输出下的推理子行。
 * 数据全部来自模型真实回传的 token（归一化见 utils/usage.ts），
 * 字段缺失的行不渲染——例如没有缓存明细就不显示「缓存命中」。
 */

/** 千分位（面板里显示精确值） */
const exact = (value: number): string => value.toLocaleString('en-US')

const UsagePanel: React.FC<{ details: UsageDetails }> = ({ details }) => {
  const { token } = theme.useToken()

  const rows: { label: string; value: React.ReactNode; dim?: boolean }[] = []
  if (details.hasCache) {
    if (details.inputTokens > 0) {
      rows.push({
        label: '缓存命中',
        value: `${((details.cacheReadTokens / details.inputTokens) * 100).toFixed(1)}%`
      })
    }
    rows.push({
      label: '未缓存输入',
      value: `${exact(details.inputTokens - details.cacheReadTokens)} tok`
    })
    rows.push({ label: '缓存读取', value: `${exact(details.cacheReadTokens)} tok` })
    if (details.cacheWriteTokens > 0) {
      rows.push({ label: '缓存写入', value: `${exact(details.cacheWriteTokens)} tok` })
    }
  } else {
    rows.push({ label: '输入', value: `${exact(details.inputTokens)} tok` })
  }
  rows.push({ label: '输出', value: `${exact(details.outputTokens)} tok` })
  if (details.hasReasoning) {
    rows.push({ label: '└ 其中推理', value: `${exact(details.reasoningTokens)} tok`, dim: true })
  }
  if (details.calls > 1) rows.push({ label: '模型调用', value: `${details.calls} 次` })

  return (
    <div
      role="dialog"
      aria-label="本轮用量"
      style={{
        width: 300,
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: token.boxShadowSecondary,
        pointerEvents: 'none'
      }}
    >
      {/* 标题：左「本轮用量」，右总量 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            color: token.colorTextSecondary
          }}
        >
          <RiDatabase2Line size={14} />
          本轮用量
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: token.colorText,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {exact(details.totalTokens)} tok
        </span>
      </div>

      <div style={{ height: 1, background: token.colorBorderSecondary, margin: '8px 0' }} />

      {/* 提供方 / 模型：长路径独占一行，不塞进右对齐的值列 */}
      {details.route && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: token.colorTextTertiary }}>提供方 / 模型</div>
          <div
            style={{
              fontSize: 12.5,
              color: token.colorText,
              marginTop: 2,
              wordBreak: 'break-all'
            }}
          >
            {details.route}
          </div>
        </div>
      )}

      {/* 数值明细：dt 左 / dd 右对齐等宽数字 */}
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          rowGap: 6,
          columnGap: 12
        }}
      >
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <dt
              style={{
                fontSize: 11.5,
                color: row.dim ? token.colorTextQuaternary : token.colorTextTertiary
              }}
            >
              {row.label}
            </dt>
            <dd
              style={{
                margin: 0,
                textAlign: 'right',
                fontSize: row.dim ? 11.5 : 12.5,
                color: row.dim ? token.colorTextTertiary : token.colorText,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {row.value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  )
}

export default UsagePanel
