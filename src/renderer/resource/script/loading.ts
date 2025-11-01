import { Window } from '../types/window'

document.addEventListener('DOMContentLoaded', () => {
  const progressFill = document.getElementById('progressFill') as HTMLElement
  const progressText = document.getElementById('progressText') as HTMLElement
  const currentTask = document.getElementById('currentTask') as HTMLElement
  const taskProgress = document.getElementById('taskProgress') as HTMLElement

  // 监听初始化进度更新 - 使用暴露的 API
  ;(window as unknown as Window).loading.onInitProgress((_event, data) => {
    // 更新进度条
    if (progressFill) {
      progressFill.style.width = `${data.progress}%`
    }
    if (progressText) {
      progressText.textContent = `${data.progress}%`
    }

    // 更新当前任务信息
    if (currentTask) {
      currentTask.textContent = data.currentTask
    }
    if (taskProgress) {
      taskProgress.textContent = `加载进度 ${data.taskIndex}/${data.totalTasks}`
    }
  })

  // 监听初始化完成信号
  ;(window as unknown as Window).loading.onInitComplete(() => {
    if (currentTask) {
      currentTask.textContent = '已经初始化完成!'
    }
    if (taskProgress) {
      taskProgress.textContent = '准备就绪！'
    }

    // 延迟一小段时间让用户看到完成状态
    setTimeout(() => {
      ;(window as unknown as Window).loading.notifyInitComplete() // 使用暴露的 API
    }, 500)
  })

  // 监听初始化错误信号
  ;(window as unknown as Window).loading.onInitError((_event, errorMessage: string) => {
    console.error('Initialization error:', errorMessage)
    if (currentTask) {
      currentTask.textContent = 'Error occurred during initialization'
    }
    if (taskProgress) {
      taskProgress.textContent = 'Please restart the application'
    }
    if (progressFill) {
      progressFill.style.backgroundColor = '#e74c3c' // 红色表示错误
    }
  })
})
