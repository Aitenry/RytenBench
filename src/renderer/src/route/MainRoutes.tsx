import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RouteSkeleton from './RouteSkeleton'
import { lazyViewFor } from './lazyViewCache'
import { usePluginMenus, usePluginRoutes } from '@renderer/plugin-host/PluginHostContext'
import type { RegisteredRoute } from '@renderer/plugin-host/types'

// 路由级代码分割：Harness（含代码编辑器、差异视图等重型依赖）等页面按需加载，
// 首屏只加载首页所需模块，显著缩短主窗口 ready-to-show 时间。
// 各 chunk 会在启动空闲期由 viewPreload 提前加载，切页无需等待。
// 路由表由插件注册表驱动（插件停用 = 路由即时消失），插件的 lazy/Component 二选一。

const PluginRouteView: React.FC<{ route: RegisteredRoute }> = ({ route }) => {
  // lazy 实例必须来自模块级缓存（见 lazyViewCache.ts）：在渲染期新建 lazy 会让
  // 「切到尚未加载的路由」陷入 Suspense 重试死循环，视图永远停在上一页。
  const View = route.load ? lazyViewFor(route.load) : null
  if (View) {
    return (
      <Suspense fallback={<RouteSkeleton variant={route.skeleton ?? 'generic'} />}>
        <View />
      </Suspense>
    )
  }
  const Eager = route.Component
  return Eager ? <Eager /> : <RouteSkeleton variant={route.skeleton ?? 'generic'} />
}

const MainRoutes: React.FC = () => {
  const routes = usePluginRoutes()
  const menus = usePluginMenus()
  // 默认页 = 第一个有序启用的菜单键；宿主装载完成前（menus 尚空）不渲染兜底重定向，
  // 避免 Navigate 指向尚未注册的路由
  const defaultPath: string | null = menus.length > 0 ? `/${menus[0].key}` : null

  return (
    <Routes>
      {defaultPath && <Route path="/" element={<Navigate to={defaultPath} replace />} />}
      {routes.map((r) => (
        <Route key={r.path} path={r.path} element={<PluginRouteView route={r} />} />
      ))}
      {defaultPath && <Route path="*" element={<Navigate to={defaultPath} replace />} />}
    </Routes>
  )
}

export default MainRoutes
