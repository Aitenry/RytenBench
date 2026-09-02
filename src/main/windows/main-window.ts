import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/logo.png?asset'
import logger from 'electron-log'
import { safeSend } from '../safe-send'
import { getMainWindow, markMainWindowReady, setMainWindow } from './window-manager'
import { isCloseToTrayEnabled, isTrayAvailable, syncTrayState } from '../tray'
import { isQuittingNow, markQuitting } from '../lifecycle'

/** 各窗口的最大化状态（主窗口与 mermaid 预览窗口共用；随窗口销毁清理） */
const windowMaxStates = new Map<
  number,
  { isMaximized: boolean; normalBounds: Electron.Rectangle | null }
>()

let windowControlIpcRegistered = false

/** 渲染端警告去重窗口（KaTeX 等库会为同一条消息连发数百次） */
const CONSOLE_WARN_DEDUPE_WINDOW_MS = 10_000
const CONSOLE_WARN_REPEAT_SUMMARY_AT = 100
const consoleWarnSeen = new Map<string, { count: number; lastAt: number }>()

/**
 * 窗口控制 IPC（作用于发送方窗口）：全局只注册一次。
 * 修复：此前注册在 createMainWindow 内——macOS 关闭全部窗口后 activate 重开主窗口会
 * 触发 ipcMain.handle 重复注册抛错（Attempted to register a second handler），
 * ipcMain.on 也会双绑（一次点击触发两次处理）。
 */
function registerWindowControlIpcOnce(): void {
  if (windowControlIpcRegistered) return
  windowControlIpcRegistered = true

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
}

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
  // 修复：崩溃/OOM 后主窗口只剩死帧（应用「跑着跑着用不了/卡住」）——IPC 已全局注册一次，
  // 直接销毁并重建主窗口恢复可用（新 webContents 不在 safeSend 死名单中）。
  win.webContents.on('render-process-gone', (_event, details) => {
    const abnormal = details.reason !== 'clean-exit' && details.reason !== 'killed'
    const msg = `[Window] 渲染进程退出 reason=${details.reason} exitCode=${details.exitCode}`
    if (abnormal) logger.error(msg)
    else logger.info(msg)
    if (
      details.reason === 'crashed' ||
      details.reason === 'oom' ||
      details.reason === 'launch-failed' ||
      details.reason === 'integrity-failure'
    ) {
      logger.warn('[Window] 渲染进程异常退出，300ms 后重建主窗口恢复可用...')
      setTimeout(() => {
        if (getMainWindow() === win && !win.isDestroyed()) {
          win.destroy()
        }
        if (!getMainWindow()) {
          createMainWindow()
        }
      }, 300)
    }
  })

  // 渲染进程 console 错误/警告转发到主进程日志（修复：渲染端异常此前无任何落盘线索,
  // 崩溃后只剩 exitCode 无法定位根因）。
  // 修复：KaTeX 等库会为同一条警告连发数百次（如中文入数学模式），警告按 10 秒窗口
  // 去重（第 100 次重复时留一条计数摘要），错误始终逐条转发。
  win.webContents.on('console-message', (event) => {
    const level = event.level
    const msg = event.message
    if (level !== 'error' && level !== 'warning') return
    if (level === 'error') {
      logger.error(`[Renderer:error] ${msg}`)
      return
    }
    const key = msg
    const now = Date.now()
    const seen = consoleWarnSeen.get(key)
    if (seen && now - seen.lastAt < CONSOLE_WARN_DEDUPE_WINDOW_MS) {
      seen.count += 1
      if (seen.count === CONSOLE_WARN_REPEAT_SUMMARY_AT) {
        logger.warn(
          `[Renderer:warning] ${msg}（同条消息已重复 ${seen.count}+ 次，10 秒内不再转发）`
        )
      }
      return
    }
    consoleWarnSeen.set(key, { count: 1, lastAt: now })
    logger.warn(`[Renderer:warning] ${msg}`)
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })

  // 拦截主窗口导航：仅允许应用自身页面（开发 URL / 生产 file://）。
  // 聊天正文里的站外链接若不带 target="_blank"，点击会把窗口原地导航到远程页面；
  // 该窗口的 preload（sandbox:false）暴露了完整 window.api，远程页面可借此调用
  // 主进程 IPC——必须拦截并转交系统浏览器（hash 路由的页内导航不会触发本事件）。
  win.webContents.on('will-navigate', (event, url) => {
    const devOrigin = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
    const allowed = devOrigin ? url.startsWith(devOrigin) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      shell.openExternal(url).catch((err) => logger.warn('[Window] 外部链接打开失败:', err))
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/index.html`).catch((err) => {
      logger.error('[Window] 主窗口加载失败:', err)
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/resource/index.html')).catch((err) => {
      logger.error('[Window] 主窗口加载失败:', err)
    })
  }
  logger.info('[Window] Main window created, renderer loading started')

  win.webContents.once('dom-ready', () => {
    logger.info('[Window] Main window dom-ready')
    safeSend(win.webContents, 'main-window-ready')
  })

  // 窗口控制 IPC 全局只注册一次（macOS activate 重开窗口时不得重复注册）
  registerWindowControlIpcOnce()
}
