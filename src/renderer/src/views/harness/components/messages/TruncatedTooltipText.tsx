import React, { useEffect, useRef, useState } from 'react'
import { Tooltip } from 'antd'

/** 数字等宽字体：计数里的数字用等宽字形，避免位数变化时整行抖动 */
export const MONO_FONT = "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace"

/** 工具卡片文本：单行显示 + 溢出省略，悬停展示完整内容（无箭头 Tooltip，仅在溢出时出现）
 *
 *  两个易踩的坑，都在这里一次性收口：
 *  1. 省略号只对「块级（或块化）且宽度受约束」的盒子生效。此前这里是内联 span，
 *     overflow/text-overflow 被完全忽略，且 clientWidth 恒为 0 → 长文本（execute 的整条命令）
 *     直接顶破卡片、悬停提示还对短文本误触发。故此处显式 display:block，
 *     并加 1px 容差避免子像素取整导致误判。
 *  2. 光泽必须做在「承载文字的那一个元素」上：外层 ShinyText 包内层截断 span 时，
 *     省略号失效；且外层基色若用 colorText，暗色主题下基色 rgba(255,255,255,0.85)
 *     与高光 rgba(255,255,255,0.9) 几乎同色，看起来「只有图标在发光、文字没有光」。
 *     这里用 shinyBaseColor=colorTextSecondary（与 ShinyIcon 同基色）+ 纯白高光，
 *     明暗两种主题下光泽都清晰可见。
 */
export const TruncatedTooltipText: React.FC<{
  text: string
  style?: React.CSSProperties
  /** 光泽基色（传入即启用光泽扫过；建议与同排 ShinyIcon 的 baseColor 一致） */
  shinyBaseColor?: string
  /** 光泽高光色，默认纯白（与 ShinyIcon 扫过色一致） */
  shinyShineColor?: string
}> = ({ text, style, shinyBaseColor, shinyShineColor = '#fff' }) => {
  const spanRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const check = (): void => {
      setOverflow(el.scrollWidth > el.clientWidth + 1)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])

  return (
    // Tooltip 与 span 始终渲染，保证 ResizeObserver 观察的 DOM 节点稳定；
    // 空 title 时 antd 不会显示提示（仅溢出时 title 才有内容）
    <Tooltip title={overflow ? text : ''} arrow={false} styles={{ root: { maxWidth: 560 } }}>
      <span
        ref={spanRef}
        className={shinyBaseColor ? 'shiny-text' : undefined}
        style={{
          // 覆盖 .shiny-text 的 display:inline-block —— 省略号必须是块级盒子
          display: 'block',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
          ...(shinyBaseColor
            ? ({
                '--shiny-base': shinyBaseColor,
                '--shiny-shine': shinyShineColor
              } as React.CSSProperties)
            : null),
          ...style
        }}
      >
        {text}
      </span>
    </Tooltip>
  )
}

export default TruncatedTooltipText
