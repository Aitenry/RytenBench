import React from 'react'

interface ShinyTextProps {
  children: React.ReactNode
  /** 光泽基底色（默认取 CSS 变量 --shiny-base，回退 #b5b5b5） */
  baseColor?: string
  /** 高光扫过色（默认取 --shiny-shine，回退 #fff） */
  shineColor?: string
  /** 扫过周期（秒），默认 1.5 */
  speed?: number
  /** 关闭动效：渲染为普通静态文本 */
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * reactbits ShinyText 移植：文字以「基底色→白色高光→基底色」渐变填充
 * （background-clip: text + text-fill-color: transparent），
 * 白色光泽带按 @keyframes shiny-shine 周期扫过文字。
 * 样式与 keyframes 见 src/renderer/src/assets/main.css
 */
const ShinyText: React.FC<ShinyTextProps> = ({
  children,
  baseColor,
  shineColor,
  speed = 1.5,
  disabled = false,
  className = '',
  style
}) => {
  if (disabled) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    )
  }
  return (
    <span
      className={`shiny-text ${className}`}
      style={
        {
          '--shiny-base': baseColor,
          '--shiny-shine': shineColor,
          animationDuration: `${speed}s`,
          ...style
        } as React.CSSProperties
      }
    >
      {children}
    </span>
  )
}

interface ShinyIconProps {
  /** 任意 @remixicon/react 图标组件 */
  icon: React.ComponentType<{
    size?: number | string
    color?: string
    className?: string
    style?: React.CSSProperties
  }>
  size?: number
  baseColor?: string
  shineColor?: string
  speed?: number
  /** 是否旋转（加载指示类图标用），默认不转 */
  spin?: boolean
  /** 关闭动效：渲染为普通静态图标 */
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * ShinyText 的图标版：SVG 无法使用 background-clip: text，
 * 采用「底层基底色图标 + 上层白色图标（mask 渐变带裁剪扫过）」双层叠加，
 * 光泽观感与文字一致，动画同样走 @keyframes shiny-shine-mask
 */
const ShinyIcon: React.FC<ShinyIconProps> = ({
  icon: Icon,
  size = 16,
  baseColor,
  shineColor,
  speed = 1.5,
  spin = false,
  disabled = false,
  className = '',
  style
}) => {
  if (disabled) {
    return (
      <Icon size={size} className={`${className}${spin ? ' animate-spin' : ''}`} style={style} />
    )
  }
  return (
    <span
      className={`shiny-icon ${className}${spin ? ' animate-spin' : ''}`}
      style={{ width: size, height: size, ...style }}
    >
      <Icon size={size} color={baseColor ?? 'var(--shiny-base, #b5b5b5)'} />
      <Icon
        size={size}
        color={shineColor ?? 'var(--shiny-shine, #fff)'}
        className="shiny-icon-sweep"
        style={{ animationDuration: `${speed}s` }}
      />
    </span>
  )
}

export { ShinyText, ShinyIcon }
export default ShinyText
