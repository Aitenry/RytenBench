import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '../views/home/Index'
import Planner from '../views/planner/Index'
import Music from '../views/music/Index'
import Chat from '../views/chat/Index'

const MainRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/planner" element={<Planner />} />
      <Route path="/music" element={<Music />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default MainRoutes
