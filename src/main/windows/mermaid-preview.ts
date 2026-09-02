import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import logger from 'electron-log'
import mermaidPreviewHtmlPath from '../resource/mermaid-preview.html?asset'

let mermaidPreviewWin: BrowserWindow | null = null
let cachedHtml: string | null = null

/** 从 HTML 资源文件构建预览页（仅注入 SVG 内容，图标/样式/交互均在文件内） */
function buildMermaidPreviewHtml(svg: string): string {
  if (cachedHtml === null) {
    cachedHtml = fs.readFileSync(mermaidPreviewHtmlPath, 'utf-8')
  }
  // 函数形式替换，避免 svg 中的 $ 字符触发 replace 特殊序列
  return cachedHtml.replace('<!-- __MERMAID_SVG__ -->', () => svg)
}

export function registerMermaidPreviewIpc(): void {
  ipcMain.handle('mermaid-preview', (_event, svg: string) => {
    const dataUrl =
      'data:text/html;charset=utf-8,' + encodeURIComponent(buildMermaidPreviewHtml(svg))
    if (mermaidPreviewWin && !mermaidPreviewWin.isDestroyed()) {
      // 快速连续预览时上一次导航会被下一次取代并以 ERR_ABORTED 拒绝——吞掉
      // 避免主进程 unhandled rejection（修复）
      mermaidPreviewWin.loadURL(dataUrl).catch((err) => {
        logger.warn('[Mermaid] 预览加载失败:', (err as Error)?.message)
      })
      mermaidPreviewWin.focus()
      return
    }
    // 独立预览窗口：与应用同款自定义无边框标题栏，可拉伸、可最大化，不占满全屏
    const { workAreaSize } = screen.getPrimaryDisplay()
    mermaidPreviewWin = new BrowserWindow({
      width: Math.round(Math.min(1200, workAreaSize.width * 0.7)),
      height: Math.round(Math.min(800, workAreaSize.height * 0.75)),
      minWidth: 480,
      minHeight: 360,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      title: 'Mermaid 预览',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    mermaidPreviewWin.on('closed', () => {
      mermaidPreviewWin = null
    })
    mermaidPreviewWin.on('ready-to-show', () => {
      mermaidPreviewWin?.show()
    })
    mermaidPreviewWin.loadURL(dataUrl).catch((err) => {
      logger.warn('[Mermaid] 预览加载失败:', (err as Error)?.message)
    })
  })
}
