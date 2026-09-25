import React from 'react'
import * as antd from 'antd'
import * as RemixIcons from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
// 已迁移的插件从自包含目录 @plugins 引入（四个内置插件都已收进 src/plugins/<id>/）
import home from '@plugins/home/renderer/plugin'
import music from '@plugins/music/renderer/plugin'
import planner from '@plugins/planner/renderer/plugin'
import harness from '@plugins/harness/renderer/plugin'

/**
 * 内置插件注册表：显式 import（不用 import.meta.glob），
 * 规避 electron-vite 6 beta 下 HMR 动态发现的不稳定。
 * 菜单顺序：home(10) → planner(20) → music(30) → harness(40)。
 */
export const builtinPlugins: Plugin[] = [home, planner, music, harness]

/**
 * 宿主 vendored 实例：外部插件构建时 externalize react/antd 等，
 * 运行时经 ctx.require(name) 取这里的唯一实例，杜绝双重 React / antd 上下文分裂。
 */
export const vendorModules: Record<string, unknown> = {
  react: React,
  antd,
  '@remixicon/react': RemixIcons
}
