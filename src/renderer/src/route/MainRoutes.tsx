import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '../views/Home'
import Notes from '../views/Notes'
import Knowledge from '../views/Knowledge'
import Planner from '../views/Planner'
import Tools from '../views/Tools'
import Weather from '../views/Weather'
import Music from '../views/Music'

interface MainRoutesProps {
  defaultRoute?: string // 默认路由参数
}

const MainRoutes: React.FC<MainRoutesProps> = ({ defaultRoute = '/home' }) => {
  return (
    <Routes>
      {/* 根据参数设置默认路由 */}
      <Route path="/" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/notes" element={<Notes />} />
      <Route path="/knowledge" element={<Knowledge />} />
      <Route path="/planner" element={<Planner />} />
      <Route path="/tools" element={<Tools />} />
      <Route path="/weather" element={<Weather />} />
      <Route path="/music" element={<Music />} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

export default MainRoutes
