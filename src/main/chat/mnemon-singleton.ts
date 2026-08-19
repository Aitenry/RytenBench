import * as path from 'path'
import { buildMnemon, type MnemonComponent } from './runtime/mnemon'

/**
 * Mnemon 进程级单例 — 按存储根缓存
 *
 * ChatService 每次请求都会新建 Runtime，但记忆系统（PGlite 数据库、文件控制面）
 * 必须是跨请求共享的进程级组件。按 storageRoot 缓存，应用退出时统一关闭。
 */

const instances = new Map<string, MnemonComponent>()

/** 获取（或创建）记忆组件；未配置记忆目录返回 undefined */
export function getMnemonComponent(memoryPath?: string): MnemonComponent | undefined {
  if (!memoryPath) return undefined
  const storageRoot = path.join(memoryPath, 'mnemon')
  const existing = instances.get(storageRoot)
  if (existing) return existing
  const component = buildMnemon(storageRoot)
  instances.set(storageRoot, component)
  return component
}

/** 关闭全部记忆组件（应用退出时调用） */
export async function closeAllMnemon(): Promise<void> {
  for (const component of instances.values()) {
    try {
      await component.close()
    } catch (err) {
      // 关闭失败不阻塞退出
    }
  }
  instances.clear()
}

/** 供诊断：当前缓存的存储根 */
export function mnemonStorageRoots(): string[] {
  return [...instances.keys()]
}
