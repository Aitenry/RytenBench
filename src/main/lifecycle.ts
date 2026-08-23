import { app } from 'electron'
import logger from 'electron-log'
import { activeChatStreams, streamAbortControllers } from './context'
import { getDatabaseRef } from './database/instance'

let isQuitting = false

/** 注册应用生命周期钩子：退出前保存流式数据 / 全窗口关闭退出 */
export function registerLifecycleHooks(): void {
  app.on('before-quit', (event) => {
    if (isQuitting) return
    isQuitting = true

    // 没有活跃流时直接退出，不阻塞进程终止
    if (activeChatStreams.size === 0) {
      return
    }

    // 有活跃流时拦截退出，先保存数据再退出
    event.preventDefault()
    ;(async () => {
      try {
        for (const controller of streamAbortControllers.values()) {
          controller.abort()
        }
        await Promise.race([
          Promise.allSettled([...activeChatStreams]),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ])
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
