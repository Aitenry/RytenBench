/**
 * 插件宿主根键常量。
 *
 * 根键（host root keys）：宿主骨架始终存在的能力，插件只能 inject、不能 provide——
 * 保证视图永远无法推翻宿主（论文：需求方只能面向共享上下文声明依赖）。
 */
export const HOST_KEYS = [
  'route',
  'menu',
  'settingsSection',
  'appProvider',
  'globalComponent',
  'api',
  'i18n',
  'events',
  'storage'
] as const

export type HostKey = (typeof HOST_KEYS)[number]

/** 外部插件可经 ctx.require(name) 获取的宿主 vendored 实例（避双重 React 实例） */
export const VENDOR_MODULES = ['react', 'antd', '@remixicon/react'] as const
