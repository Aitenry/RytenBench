import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import type { LazyLoader } from '@renderer/plugin-host/types'

/**
 * 懒路由视图缓存：**同一个 load 工厂永远对应同一个 React.lazy 实例**。
 *
 * 为什么必须稳定（2026-09-26 线上复现 + CDP 采样定位）：
 * 目标路由的 chunk 还没就绪时，这次导航的渲染会抛出 lazy 的 promise 而挂起；React 在并发
 * 渲染（react-router v7 的导航默认走 startTransition）里会把这次**未提交**的渲染整棵丢弃
 * （unwind），等 ping 之后从根重试。重试等同于**重新挂载**路由视图组件——所以任何基于
 * `useMemo`/组件内状态的缓存都会失效：
 *
 *   useMemo(() => lazy(route.load), [route])   // ❌ 每轮重试都新建 lazy + 新 promise
 *   lazyViewFor(route.load)                    // ✅ 跨重试拿到同一个 lazy（payload 已 resolved）
 *
 * 前者每次都抛出一个全新的 promise，Suspense 永远等不到「已 resolved 的 payload」，
 * 于是 ping → 重试 → 再挂起 无限循环：表现为点击菜单后 URL（hash）与侧栏高亮都变了，
 * 中间视图却一直停在上一页，渲染进程 100% CPU 空转（采样栈恒为
 * lazyInitializer → resolveLazy → renderRootConcurrent）；必须点一次非懒路由
 * （首页，直接提交）再点目标页才生效。
 */

const cache = new WeakMap<object, LazyExoticComponent<ComponentType>>()

export function lazyViewFor(loader: LazyLoader): LazyExoticComponent<ComponentType> {
  let cached = cache.get(loader)
  if (!cached) {
    cached = lazy(loader)
    cache.set(loader, cached)
  }
  return cached
}
