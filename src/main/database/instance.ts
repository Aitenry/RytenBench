import { Database } from './loading'

// 数据库单例（保持模块级变量）
let database: Database | null = null
// 用于追踪初始化过程
let initializationPromise: Promise<void> | null = null

/** 注入数据库实例（由初始化流程调用） */
export function setDatabaseInstance(db: Database | null): void {
  database = db
}

/** 注入初始化 Promise（由加载窗口创建流程调用） */
export function setInitializationPromise(promise: Promise<void> | null): void {
  initializationPromise = promise
}

/** 获取进行中的初始化 Promise（可能为 null） */
export function getInitializationPromise(): Promise<void> | null {
  return initializationPromise
}

/** 获取数据库实例引用（退出清理等场景直接访问，不等待初始化） */
export function getDatabaseRef(): Database | null {
  return database
}

/**
 * 获取已初始化的数据库实例。
 * 如果数据库尚未初始化，它会等待初始化完成。
 * @returns Promise<Database> 已初始化的数据库实例
 */
export async function getDatabaseInstance(): Promise<Database> {
  if (database) {
    return database
  }

  if (initializationPromise) {
    // 如果初始化正在进行中，则等待它完成
    await initializationPromise
    if (database) {
      return database
    }
  }

  // 如果既没有实例也没有进行中的初始化，则说明初始化未开始或失败
  throw new Error('Database has not been initialized yet.')
}

/**
 * 等待初始化完成。
 * 主窗口预热期间渲染进程可能早于初始化完成启动：
 * 设置/锁屏读取需等初始化（工作区迁移会写回 activeWorkspaceId）完成后才返回，避免拿到迁移前状态。
 */
export async function awaitInitialized(): Promise<void> {
  if (initializationPromise) await initializationPromise
}
