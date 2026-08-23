import React from 'react'
import { useTheme } from '@renderer/contexts/useTheme'
import { getProviderColor, getProviderMonogram } from '@renderer/utils/providerMeta'

/**
 * 供应商「印字号」徽章：无品牌图标供应商的统一降级视觉。
 * 等宽双字母 monogram + 发丝边框 + 纸张色底（编辑部/终端混排，非 AI 模板风）。
 * 品牌色由 providerMeta 统一供给；黑白单色品牌在暗色主题下自动换暖白。
 */
const MONO_FONT = "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Consolas, monospace"

interface ProviderMarkProps {
  providerType: string
  /** 徽章边长（px）；≤14 时圆角收窄为 3px */
  size?: number
  /** 指定品牌色；缺省按 providerType + 当前主题从 providerMeta 取，未收录降级灰色 */
  color?: string
}

const ProviderMark: React.FC<ProviderMarkProps> = ({ providerType, size = 18, color }) => {
  const { effectiveTheme } = useTheme()
  const mergedColor =
    color ?? getProviderColor(providerType, effectiveTheme === 'dark') ?? '#808080'
  const glyph = getProviderMonogram(providerType)
  const radius = size <= 14 ? 3 : 4
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center flex-shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: `1px solid ${mergedColor}42`,
        background: `${mergedColor}14`,
        color: mergedColor,
        fontFamily: MONO_FONT,
        fontSize: Math.round(size * 0.56),
        fontWeight: 600,
        lineHeight: 1
      }}
    >
      {glyph}
    </span>
  )
}

export default ProviderMark