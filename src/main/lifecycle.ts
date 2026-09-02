import { app } from 'electron'
import logger from 'electron-log'
import { activeChatStreams, streamAbortControllers } from './context'
import { getDatabaseRef } from './database/instance'

let isQuitting = false
/** 资源清理是否已完成（完成后放行最终退出） */
let cleanupDone = false

/** 应用是否正在退出（托盘「关闭窗口→隐藏」拦截用：真正退出时放行） */
export function isQuittingNow(): boolean {
  return isQuitting
}

/** 标记应用正在退出（系统关机等场景下提前放行关闭拦截） */
export function markQuitting(): void {
  isQuitting = true
}

/** 注册应用生命周期钩子：退出前保存流式数据 / 关闭数据库与 Mnemon / 全窗口关闭退出 */
export function registerLifecycleHooks(): void {
  app.on('before-quit', (event) => {
    // 清理完成后放行最终退出
    if (cleanupDone) return
    // 清理进行中：拦截重入 quit（修复：此前直接放行，正在保存的流被掐断、
    // 数据库/记忆清理未完成进程即退出）
    if (isQuitting) {
      event.preventDefault()
      return
    }
    isQuitting = true
    // 统一拦截本次退出：清理完成后再真正退出（修复：此前无活跃流时直接 return，
    // database.close()/closeAllMnemon() 从未执行）
    event.preventDefault()

    void (async () => {
      try {
        // 有活跃流时先中止并等待落库（最长 5s）
        if (activeChatStreams.size > 0) {
          for (const controller of streamAbortControllers.values()) {
            controller.abort()
          }
          await Promise.race([
            Promise.allSettled([...activeChatStreams]),
            new Promise((resolve) => setTimeout(resolve, 5000))
          ])
        }
      } catch (error) {
        logger.error('Error during stream abort:', error)
      } finally {
        try {
          const database = getDatabaseRef()
          if (database) {
            await database.close()
          }
        } finally {
          try {
            const { closeAllMnemon } = await import('./chat/mnemon-singleton')
            await closeAllMnemon()
          } catch (err) {
            logger.warn('[Mnemon] 退出清理失败:', err)
          }
          cleanupDone = true
          app.quit()
        }
      }
    })()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
