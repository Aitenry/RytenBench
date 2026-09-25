import type { Track } from '../../shared/types'

/**
 * 插件级「当前曲目」快照（模块级可订阅 store）。
 *
 * 为什么要它：底栏（外壳）需要在**不 import 音乐模块**的前提下知道音乐条目该不该出现。
 * 插件把 Provider 里的当前曲目同步到这里，底栏插槽的 `isVisible()` 直接读
 * `getCurrentTrack()`，`subscribeCurrentTrack` 负责在可见性变化时叫宿主重渲染。
 */
let currentTrack: Track | null = null
const listeners = new Set<() => void>()

/** 当前曲目（无则 null）——宿主每次渲染都会读一次 */
export function getCurrentTrack(): Track | null {
  return currentTrack
}

/** 订阅「当前曲目」变化（含 null ↔ 有曲目的可见性切换） */
export function subscribeCurrentTrack(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** 写入当前曲目（AudioProvider 在曲目变化时调用）；仅在可见性可能变化时通知订阅者 */
export function publishCurrentTrack(next: Track | null): void {
  const prev = currentTrack
  currentTrack = next
  // 只按 id 判定：同一首曲目的字段更新（例如收藏状态）不改变底栏可见性，
  // 不必让宿主为它重渲染；null ↔ 有曲目、换曲则必须通知。
  if (prev?.id === next?.id) return
  for (const onChange of [...listeners]) {
    try {
      onChange()
    } catch (err) {
      console.error('[music] 底栏可见性订阅回调异常:', err)
    }
  }
}
