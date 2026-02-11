import React, { useEffect, useState } from 'react'
import { theme } from 'antd'
import TodoList, { TodoItem } from '@renderer/components/home/TodoItem'
import { Window } from '../../resource/types/window'
import MainContent from '@renderer/components/home/MainContent'

const Home: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()
  const [initialTodos, setInitialTodos] = useState<TodoItem[]>([])
  // 模拟数据
  useEffect(() => {
    async function fetchTodos(): Promise<void> {
      try {
        const allTodos = await (window as unknown as Window).api.todoItems.getAll()
        setInitialTodos(allTodos)
      } catch (error) {
        console.error('Error fetching todos:', error)
      }
    }

    fetchTodos().then()
  }, []) // 空依赖数组，只在组件挂载时执行一次

  return (
    <div className="h-full flex-1 flex flex-row gap-2.5">
      {/* 主内容区 */}
      <main
        className="w-18/24"
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
