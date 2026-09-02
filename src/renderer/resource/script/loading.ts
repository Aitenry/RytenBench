import { Window } from '../types/window'

document.addEventListener('DOMContentLoaded', () => {
  const progressFill = document.getElementById('progressFill') as HTMLElement
  const progressText = document.getElementById('progressText') as HTMLElement
  const currentTask = document.getElementById('currentTask') as HTMLElement
  const taskProgress = document.getElementById('taskProgress') as HTMLElement

  // 应用版本随 package.json 动态展示（修复：loading.html 硬编码 v0.1.0,升版后启动页显示旧版本）
  const versionEl = document.querySelector('.version')
  ;(window as unknown as Window).loading
    .getAppVersion()
    .then((v) => {
      if (versionEl) versionEl.textContent = `v${v}`
    })
    .catch(() => {})

  // 监听初始化进度更新 - 使用暴露的 API
  ;(window as unknown as Window).loading.onInitProgress((_event, data) => {
    // 更新进度条（逐步推进，细粒度百分比）
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

    // 稍作停留让用户看到完成状态（主窗口此时可能仍在预热，交接由主进程在渲染就绪后触发）
    setTimeout(() => {
      ;(window as unknown as Window).loading.notifyInitComplete() // 使用暴露的 API
    }, 200)
  })

  // 监听初始化错误信号
  ;(window as unknown as Window).loading.onInitError((_event, errorMessage: string) => {
    console.error('Initialization error:', errorMessage)
    if (currentTask) {
      currentTask.textContent = '初始化过程中出错!'
    }
    if (taskProgress) {
      taskProgress.textContent = '请重新启动应用程序!'
    }
    if (progressFill) {
      progressFill.style.backgroundColor = '#e74c3c' // 红色表示错误
    }
  })
})
