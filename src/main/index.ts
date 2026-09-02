import { app, BrowserWindow, ipcMain, crashReporter } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import logger from 'electron-log'
import { registerAllIpc } from './ipc'
import { registerLifecycleHooks } from './lifecycle'
import { createLoadingWindow } from './windows/loading-window'
import { createMainWindow } from './windows/main-window'
import { registerMermaidPreviewIpc } from './windows/mermaid-preview'
import { createTray } from './tray'
import { setupWeather } from './weather'

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

// 崩溃转储本地收集（修复：渲染进程崩溃后只有 exitCode、无 dump 可查根因）。
// 仅落盘不上传：dumps 保存于 userData/Crashpad/reports
try {
  crashReporter.start({ uploadToServer: false })
} catch (err) {
  logger.warn('[Main] crashReporter 启动失败:', err)
}

// 退出前保存流式数据 / 全窗口关闭退出
registerLifecycleHooks()

app
  .whenReady()
  .then(async () => {
    electronApp.setAppUserModelId('com.ryten.bench')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 注册全部 IPC 处理器（各领域独立模块，见 ./ipc）
    registerAllIpc()
    // 应用版本（加载页展示）
    ipcMain.handle('app-version', () => app.getVersion())
    // Mermaid 预览窗口（HTML 模板存于资源文件 ./resource/mermaid-preview.html）
    registerMermaidPreviewIpc()

    await createLoadingWindow()

    // 预热主窗口：在初始化任务运行的同时（后台）加载渲染进程，
    // 初始化完成后直接交接显示，省去「加载窗口结束后再等 2~3 秒」的空白期。
    // 注：此时 initializationPromise 已赋值，渲染进程早期 IPC 会等待数据库初始化完成。
    createMainWindow()

    // 天气 IPC 与自动刷新只注册/启动一次（主窗口推送；修复：此前随 createMainWindow
    // 重复调用会二次注册 ipcMain.handle 抛错）
    setupWeather()

    // 系统托盘：关闭窗口可驻留后台（是否驻留由「通用设置 → 系统托盘」控制）
    createTray()

    // macOS activate：窗口全部关闭后只重建主窗口（修复：此前重跑 createLoadingWindow +
    // createMainWindow 会二次建库、重复注册 IPC 导致崩溃；初始化只需执行一次）
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow()
      }
    })
  })
  .catch((err) => {
    logger.error('[Main] 主流程初始化失败:', err)
  })
