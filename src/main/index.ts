import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase, Database } from './database/loading'

let loadingWindow: BrowserWindow | null = null
let database: Database | null = null

// 模拟初始化任务
async function performInitializationTasks(): Promise<void> {
  const tasks = [
    { name: '加载配置', execute: async () => await loadConfig() },
    { name: '初始化数据库', execute: async () => (database = await createDatabase()) },
    { name: '加载服务', execute: async () => await loadServices() },
    { name: '准备UI组件', execute: async () => await prepareUIComponents() }
  ]

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]

    // 先通知当前任务名称，再开始执行
    const progress = ((i + 1) / tasks.length) * 100

    // 执行任务
    await task.execute()

    if (loadingWindow) {
      loadingWindow.webContents.send('init-progress', {
        currentTask: task.name,
        progress: Math.round(progress),
        taskIndex: i + 1,
        totalTasks: tasks.length
      })
    }
  }
}

// 示例任务函数
async function loadConfig(): Promise<void> {
  // 加载配置的逻辑
  return new Promise((resolve) => setTimeout(resolve, 1000)) // 模拟耗时操作
}

async function loadServices(): Promise<void> {
  // 加载服务的逻辑
  return new Promise((resolve) => setTimeout(resolve, 1800)) // 模拟耗时操作
}

async function prepareUIComponents(): Promise<void> {
  // 准备UI组件的逻辑
  return new Promise((resolve) => setTimeout(resolve, 1200)) // 模拟耗时操作
}

function createLoadingWindow(): void {
  loadingWindow = new BrowserWindow({
    width: 360,
    height: 230,
    frame: false, // 无边框窗口
    transparent: true, // 窗口透明，以便CSS可以实现圆角和阴影
    resizable: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true, // 始终在最前
    ...{ icon },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 禁用加载窗口的菜单栏
  loadingWindow.setMenu(null)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    loadingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/loading.html`).then()
  } else {
    loadingWindow.loadFile(join(__dirname, '../renderer/resource/loading.html')).then()
  }

  // 监听渲染进程发送的 'init-complete' 信号
  ipcMain.once('init-complete', () => {
    if (loadingWindow) {
      loadingWindow.close()
      loadingWindow = null
    }
    createMainWindow()
  })

  // 启动初始化任务
  performInitializationTasks()
    .then(() => {
      console.log('All initialization tasks completed')
      // 发送完成信号
      if (loadingWindow) {
        loadingWindow.webContents.send('init-complete')
      }
    })
    .catch((err) => {
      console.error('Initialization failed:', err)
      // 可以在这里处理错误，比如显示错误信息
      if (loadingWindow) {
        loadingWindow.webContents.send('init-error', err.message)
      }
    })
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 770,
    minWidth: 1200,
    minHeight: 770,
    show: false,
    autoHideMenuBar: true,
    ...{ icon },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/index.html`).then()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/resource/index.html')).then()
  }

  // 主窗口加载完成后，发送信号给渲染进程
  mainWindow.webContents.once('dom-ready', () => {
    mainWindow.webContents.send('main-window-ready')
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('cn.toryu.asetools')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 监听初始化进度更新
  ipcMain.on('init-progress', (_event, data) => {
    console.log('Init progress:', data)
    // 这里可以添加其他处理逻辑
  })

  // 启动加载窗口
  createLoadingWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLoadingWindow()
    }
  })
})

app.on('before-quit', async () => {
  try {
    if (database) await database.close()
  } catch (error) {
    console.error('Error during app shutdown:', error)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
