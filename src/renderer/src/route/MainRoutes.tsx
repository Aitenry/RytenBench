import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '../views/home/Index'
import PlannerMatters from '../views/planner/matters/Index'
import PlannerSchedule from '../views/planner/schedule/Index'
import MCPTool from '../views/tools/mcp/Index'
import APITool from '../views/tools/api/Index'
import Weather from '../views/weather/Index'
import Music from '../views/music/Index'
import Chat from '../views/chat/Index'
import ProviderConfig from '../views/settings/provider/Index'
import SystemSettings from '../views/settings/system/Index'
import type { MainRoutesProps } from '@renderer/types/components'

const MainRoutes: React.FC<MainRoutesProps> = ({ defaultRoute = '/home' }) => {
  return (
    <Routes>
      {/* 根据参数设置默认路由 */}
      <Route path="/" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/planner/matters" element={<PlannerMatters />} />
      <Route path="/planner/schedule" element={<PlannerSchedule />} />
      <Route path="/tools/mcp" element={<MCPTool />} />
      <Route path="/tools/api" element={<APITool />} />
      <Route path="/weather" element={<Weather />} />
      <Route path="/music" element={<Music />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/settings/provider" element={<ProviderConfig />} />
      <Route path="/settings/system" element={<SystemSettings />} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

export default MainRoutes
