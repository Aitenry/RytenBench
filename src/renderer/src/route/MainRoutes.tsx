import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '../views/home/Index'
import RouteSkeleton from './RouteSkeleton'

// 路由级代码分割：Chat（含 monaco 编辑器等重型依赖）等页面按需加载，
// 首屏只加载首页所需模块，显著缩短主窗口 ready-to-show 时间。
// 各 chunk 会在启动空闲期由 viewPreload 提前加载，切页无需等待
const Planner = lazy(() => import('../views/planner/Index'))
const Music = lazy(() => import('../views/music/Index'))
const Chat = lazy(() => import('../views/chat/Index'))

const MainRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<Home />} />
      {/* 每个懒路由独立挂 Suspense：切页立刻呈现对应页面骨架，而不是转圈/空白 */}
      <Route
        path="/chat"
        element={
          <Suspense fallback={<RouteSkeleton variant="chat" />}>
            <Chat />
          </Suspense>
        }
      />
      <Route
        path="/planner"
        element={
          <Suspense fallback={<RouteSkeleton variant="planner" />}>
            <Planner />
          </Suspense>
        }
      />
      <Route
        path="/music"
        element={
          <Suspense fallback={<RouteSkeleton variant="music" />}>
            <Music />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default MainRoutes
