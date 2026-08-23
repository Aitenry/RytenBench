import type { ComponentType } from 'react'

/**
 * 视图 chunk 预加载
 *
 * 背景：Chat / Planner / Music 是 React.lazy 拆包页面，首次切换时才现场加载对应
 * chunk。Chat 的 chunk 含 monaco 编辑器（约 6MB），下载后还要在主线程求值，
 * 求值期间渲染进程无法绘制新画面，界面会「卡在上一页」好几秒。
 *
 * 方案：
 * 1. 启动后的空闲时段分批提前 import 各 chunk（重 → 轻），首次切换时模块
 *    已求值完毕，直接渲染目标页面；
 * 2. 侧边栏悬停/聚焦时也提前加载对应 chunk，作为空闲预加载未完成时的兜底；
 * 3. 万一仍未就绪，Suspense 会展示对应页面的骨架屏（见 RouteSkeleton），
 *    而不是停留在旧页面。
 */

export type LazyViewKey = 'chat' | 'planner' | 'music'

type LazyModule = () => Promise<{ default: ComponentType }>

/** 与 MainRoutes 中 lazy() 工厂指向同一份动态 import，加载后由模块缓存共享 */
const factories: Record<LazyViewKey, LazyModule> = {
  chat: () => import('../views/chat/Index'),
  planner: () => import('../views/planner/Index'),
  music: () => import('../views/music/Index')
}

const inflight = new Map<LazyViewKey, Promise<void>>()

export function isLazyViewKey(key: string): key is LazyViewKey {
  return key === 'chat' || key === 'planner' || key === 'music'
}

/** 立即加载指定视图的 chunk；幂等，重复调用共享同一次加载 */
export function preloadView(key: LazyViewKey): Promise<void> {
  const running = inflight.get(key)
  if (running) return running
  const task = factories[key]()
    .then(() => undefined)
    .catch((err) => {
      // 预加载失败不阻塞使用：Suspense 仍会按需加载并显示骨架屏
      console.warn(`[preload] "${key}" 视图预加载失败`, err)
    })
  inflight.set(key, task)
  return task
}

let scheduled = false

/**
 * 启动后空闲预加载（只调度一次）：先让首屏稳定一小段时间（minDelay 兜底），
 * 再按 重 → 轻 分批加载，避免与启动初期的主进程交互抢主线程。
 */
export function scheduleViewPreload(): void {
  if (scheduled) return
  scheduled = true
  runWhenIdle(() => preloadView('chat'), 3000, 3000)
  runWhenIdle(() => preloadView('planner'), 5000, 2500)
  runWhenIdle(() => preloadView('music'), 6500, 2500)
}

function runWhenIdle(task: () => void, minDelay: number, idleTimeout: number): void {
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => task(), { timeout: idleTimeout })
    } else {
      task()
    }
  }, minDelay)
}
