import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '../views/home/Index'
import Planner from '../views/planner/Index'
import Weather from '../views/weather/Index'
import Music from '../views/music/Index'
import Chat from '../views/chat/Index'
import SystemSettings from '../views/settings/Index'
import type { MainRoutesProps } from '@renderer/types/components'

const MainRoutes: React.FC<MainRoutesProps> = ({ defaultRoute = '/home' }) => {
  return (
    <Routes>
      {/* 根据参数设置默认路由 */}
      <Route path="/" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/planner" element={<Planner />} />
      <Route path="/weather" element={<Weather />} />
      <Route path="/music" element={<Music />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/settings" element={<SystemSettings />} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

export default MainRoutes
