import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/logo.png?asset'
import logger from 'electron-log'
import { safeSend } from '../safe-send'
import { getMainWindow, markMainWindowReady, setMainWindow } from './window-manager'
import { setupWeather } from '../weather'
import { isCloseToTrayEnabled, isTrayAvailable, syncTrayState } from '../tray'
import { isQuittingNow, markQuitting } from '../lifecycle'

export function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800, // 打开应用时即为最小尺寸（与 min 一致），可后续手动拉大
    minWidth: 1200,
    minHeight: 800,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    ...{ icon },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  setMainWindow(win)

  // 渲染就绪后标记 ready；只有「初始化完成 + 渲染就绪」才会真正展示（tryShowMainWindow 交接）
  win.on('ready-to-show', () => {
    logger.info('[Window] Main window ready-to-show')
    markMainWindowReady()
  })

  win.on('closed', () => {
    if (getMainWindow() === win) setMainWindow(null)
  })

  // 关闭拦截：开启「关闭到系统托盘」时，关闭窗口改为隐藏到托盘（真正退出时放行）
  win.on('close', (event) => {
    if (isCloseToTrayEnabled() && isTrayAvailable() && !isQuittingNow()) {
      event.preventDefault()
      win.hide()
    }
  })

  // 窗口显隐时同步托盘状态（右键菜单文案实时反映）
  win.on('show', () => syncTrayState())
  win.on('hide', () => syncTrayState())

  // 系统关机/注销（Windows）：窗口事件（Electron 43 中 session-end 为窗口事件而非 app 事件）。
  // 托盘驻留时窗口不会关闭，若不放行，Windows 只能强杀进程，可能丢失未落盘数据。
  win.on('session-end', () => {
    markQuitting()
    app.quit()
  })

  // 渲染进程退出诊断：记录原因（崩溃/OOM/被杀/正常退出），便于排查「运行运行突然白屏」
  // 等异常；主进程本身不会因渲染进程退出而崩溃。
  win.webContents.on('render-process-gone', (_event, details) => {
    const abnormal = details.reason !== 'clean-exit' && details.reason !== 'killed'
    const msg = `[Window] 渲染进程退出 reason=${details.reason} exitCode=${details.exitCode}`
    if (abnormal) logger.error(msg)
    else logger.info(msg)
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/index.html`).then()
  } else {
    win.loadFile(join(__dirname, '../renderer/resource/index.html')).then()
  }
  logger.info('[Window] Main window created, renderer loading started')

  win.webContents.once('dom-ready', () => {
    logger.info('[Window] Main window dom-ready')
    safeSend(win.webContents, 'main-window-ready')
  })

  // 窗口控制 IPC（作用于发送方窗口：主窗口与 mermaid 预览窗口共用）
  const windowMaxStates = new Map<
    number,
    { isMaximized: boolean; normalBounds: Electron.Rectangle | null }
  >()

  const winFromEvent = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
  ): BrowserWindow | null => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.once('closed', () => windowMaxStates.delete(win.id))
    }
    return win
  }

  ipcMain.on('window-minimize', (event) => {
    winFromEvent(event)?.minimize()
  })
  ipcMain.on('window-maximize', (event) => {
    const win = winFromEvent(event)
    if (!win || win.isDestroyed()) return
    let st = windowMaxStates.get(win.id)
    if (!st) {
      st = { isMaximized: false, normalBounds: null }
      windowMaxStates.set(win.id, st)
    }
    if (st.isMaximized) {
      // 还原到之前的尺寸和位置
      if (st.normalBounds) win.setBounds(st.normalBounds)
      st.isMaximized = false
    } else {
      // 保存当前尺寸，然后最大化到可用工作区
      st.normalBounds = win.getBounds()
      const { workArea } = screen.getPrimaryDisplay()
      win.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
      })
      st.isMaximized = true
    }
    safeSend(win.webContents, 'window-maximized', st.isMaximized)
  })
  ipcMain.on('window-close', (event) => {
    winFromEvent(event)?.close()
  })
  ipcMain.handle('window-is-maximized', (event) => {
    const win = winFromEvent(event)
    return win ? (windowMaxStates.get(win.id)?.isMaximized ?? false) : false
  })

  // 启动天气自动刷新（依赖主窗口推送更新）
  setupWeather()
}
