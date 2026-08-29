import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import logger from 'electron-log'
import { registerAllIpc } from './ipc'
import { registerLifecycleHooks } from './lifecycle'
import { createLoadingWindow } from './windows/loading-window'
import { createMainWindow } from './windows/main-window'
import { registerMermaidPreviewIpc } from './windows/mermaid-preview'
import { createTray } from './tray'

// 单实例锁：防止多开，同时确保安装程序能正确检测和关闭进程
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 再次启动时恢复主窗口（包括隐藏在系统托盘中的情况）
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })
}

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'main.log'

// 退出前保存流式数据 / 全窗口关闭退出
registerLifecycleHooks()

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ryten.bench')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册全部 IPC 处理器（各领域独立模块，见 ./ipc）
  registerAllIpc()
  // Mermaid 预览窗口（HTML 模板存于资源文件 ./resource/mermaid-preview.html）
  registerMermaidPreviewIpc()

  await createLoadingWindow()

  // 预热主窗口：在初始化任务运行的同时（后台）加载渲染进程，
  // 初始化完成后直接交接显示，省去「加载窗口结束后再等 2~3 秒」的空白期。
  // 注：此时 initializationPromise 已赋值，渲染进程早期 IPC 会等待数据库初始化完成。
  createMainWindow()

  // 系统托盘：关闭窗口可驻留后台（是否驻留由「通用设置 → 系统托盘」控制）
  createTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLoadingWindow()
      createMainWindow()
    }
  })
})
