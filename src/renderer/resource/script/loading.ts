import { Window } from '../types/window'

/* 启动页静态文案：主进程用 ?lang= 传入已解析好的界面语言（zh-CN / en-US），
   HTML 里的中文只是脚本执行前的兜底，这里在模块顶层立刻覆盖，避免首帧错语言。 */
type SplashLang = 'zh-CN' | 'en-US'

const SPLASH_TEXT: Record<SplashLang, Record<string, string>> = {
  'zh-CN': {
    subtitle: '基于AI的个人轻量级工作台',
    initializing: '正在初始化...',
    taskProgress: '加载进度 {index}/{total}',
    completedTask: '已经初始化完成!',
    completedHint: '准备就绪！',
    errorTask: '初始化过程中出错!',
    errorHint: '请重新启动应用程序!'
  },
  'en-US': {
    subtitle: 'A lightweight personal AI workspace',
    initializing: 'Initializing…',
    taskProgress: 'Step {index} of {total}',
    completedTask: 'Initialization complete',
    completedHint: 'Ready to go.',
    errorTask: 'Initialization failed',
    errorHint: 'Please restart the application.'
  }
}

const LANG: SplashLang =
  new URLSearchParams(window.location.search).get('lang') === 'en-US' ? 'en-US' : 'zh-CN'
const TEXT = SPLASH_TEXT[LANG]

/** 简单 {name} 插值 */
const fill = (template: string, vars: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_all, key: string) => String(vars[key] ?? ''))

// 模块顶层：HTML 解析完即执行，早于首次可见绘制
document.querySelectorAll<HTMLElement>('[data-splash]').forEach((el) => {
  const key = el.dataset.splash
  if (!key || !TEXT[key]) return
  // 进度行是带占位符的模板，初始态固定为 0/0，随后由 init-progress 覆盖
  el.textContent =
    key === 'taskProgress' ? fill(TEXT.taskProgress, { index: 0, total: 0 }) : TEXT[key]
})

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

    // 更新当前任务信息（步骤名由主进程按同一语言下发）
    if (currentTask) {
      currentTask.textContent = data.currentTask
    }
    if (taskProgress) {
      taskProgress.textContent = fill(TEXT.taskProgress, {
        index: data.taskIndex,
        total: data.totalTasks
      })
    }
  })

  // 监听初始化完成信号
  ;(window as unknown as Window).loading.onInitComplete(() => {
    if (currentTask) {
      currentTask.textContent = TEXT.completedTask
    }
    if (taskProgress) {
      taskProgress.textContent = TEXT.completedHint
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
      currentTask.textContent = TEXT.errorTask
    }
    if (taskProgress) {
      taskProgress.textContent = TEXT.errorHint
    }
    if (progressFill) {
      progressFill.style.backgroundColor = '#e74c3c' // 红色表示错误
    }
  })
})
