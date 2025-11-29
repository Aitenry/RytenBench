import React, { useEffect, useState } from 'react'
import { theme } from 'antd'
import Music from '../assets/music.png'
import TodoList, { TodoItem } from '@renderer/components/home/TodoItem'
import { Window } from '../../resource/types/window'
import CardItem from '@renderer/components/home/CardItem'
import MainContent from '@renderer/components/home/MainContent'

const Home: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()
  const [initialTodos, setInitialTodos] = useState<TodoItem[]>([])
  // 模拟数据
  const weatherData = {
    city: '广州市',
    date: '02月19日 星期一 10:04:36',
    temperature: '23°',
    condition: '多云',
    highLow: '27/21°C',
    feelsLike: '体感温度 22.8°C',
    icon: '☁️' // 天气图标，可以替换为对应的 RemixIcon
  }

  const workTimeData = {
    today: '0 小时 0 分钟',
    avgLastWeek: '比上周的每日平均值多 0 小时 0 分钟',
    thisWeek: '本周已工作：0 小时 0 分钟',
    todayWorked: '今天已工作：2 分钟'
  }

  const musicData = {
    title: 'Hypnotized',
    artist: 'Purple Disco Machine',
    duration: '03:15',
    current: '00:00',
    cover: Music, // 占位图
    isPlaying: false
  }
  useEffect(() => {
    async function fetchTodos(): Promise<void> {
      try {
        const allTodos = await (window as unknown as Window).api.todoItems.getAll()
        setInitialTodos(allTodos)
      } catch (error) {
        console.error('Error fetching todos:', error)
      }
    }

    fetchTodos()
  }, []) // 空依赖数组，只在组件挂载时执行一次

  return (
    <div className="h-full flex-1 flex flex-row mx-2.5 gap-2.5">
      {/* 左侧边栏 - 包含三个卡片 */}
      <aside
        className="w-6/24"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          padding: '16px'
        }}
      >
        <CardItem weatherData={weatherData} workTimeData={workTimeData} musicData={musicData} />
      </aside>

      {/* 主内容区 */}
      <main
        className="w-12/24"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <MainContent />
      </main>

      {/* 右侧边栏 */}
      <aside
        className="w-6/24"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <TodoList initialTodos={initialTodos} />
      </aside>
    </div>
  )
}

export default Home
