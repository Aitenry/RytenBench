import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '../views/home/Index'
import NoteTag from '../views/notes/tags/Index'
import NoteAll from '../views/notes/all/Index'
import KnowledgeBase from '../views/knowledge/base/Index'
import KnowledgeGraph from '../views/knowledge/graph/Index'
import PlannerMatters from '../views/planner/matters/Index'
import PlannerSchedule from '../views/planner/schedule/Index'
import MCPTool from '../views/tools/mcp/Index'
import APITool from '../views/tools/api/Index'
import Weather from '../views/weather/Index'
import Music from '../views/music/Index'
import Chat from '../views/chat/Index'

interface MainRoutesProps {
  defaultRoute?: string // 默认路由参数
}

const MainRoutes: React.FC<MainRoutesProps> = ({ defaultRoute = '/home' }) => {
  return (
    <Routes>
      {/* 根据参数设置默认路由 */}
      <Route path="/" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/notes/all" element={<NoteAll />} />
      <Route path="/notes/tags" element={<NoteTag />} />
      <Route path="knowledge/base" element={<KnowledgeBase />} />
      <Route path="knowledge/graph" element={<KnowledgeGraph />} />
      <Route path="/planner/matters" element={<PlannerMatters />} />
      <Route path="/planner/schedule" element={<PlannerSchedule />} />
      <Route path="/tools/mcp" element={<MCPTool />} />
      <Route path="/tools/api" element={<APITool />} />
      <Route path="/weather" element={<Weather />} />
      <Route path="/music" element={<Music />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

export default MainRoutes
