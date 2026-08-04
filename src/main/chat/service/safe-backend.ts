import { FilesystemBackend, type GlobResult, type GrepResult } from 'deepagents'
import * as path from 'path'
import logger from 'electron-log'

/** EPERM / EACCES - 无权限访问的错误码 */
const ACCESS_DENIED_CODES = new Set(['EPERM', 'EACCES'])

/**
 * 安全包装 FilesystemBackend，防止访问系统保护目录（如 Windows 的 System Volume Information）
 * 时抛出 EPERM 错误导致流式输出终止。
 * 注意：resolvePath 在父类是 private，无法重写；通过拦截 grep / glob 的虚拟路径参数来限界。
 */
export class SafeFilesystemBackend extends FilesystemBackend {
  /** 检查虚拟路径解析后是否在 cwd 内，防止 LLM 传入 '/' 或 'E:\' 扫描整个驱动器 */
  private isPathSafe(searchPath: string): boolean {
    // virtualMode 下 '/' 就是 cwd 的虚拟根，总是安全
    if (this.virtualMode) return true
    const rootDir = path.resolve(this.cwd)
    const resolved = path.resolve(rootDir, searchPath)
    const relative = path.relative(rootDir, resolved)
    return !relative.startsWith('..') && !path.isAbsolute(relative)
  }

  /**
   * 安全版 grep 回退搜索：限界 + 捕获 EPERM。
   */
  async grep(
    pattern: string,
    dirPath: string = '/',
    glob: string | null = null
  ): Promise<GrepResult> {
    if (!this.isPathSafe(dirPath)) {
      logger.warn(`[SafeBackend] grep "${pattern}" blocked: path "${dirPath}" outside cwd`)
      return { matches: [] }
    }
    try {
      return await super.grep(pattern, dirPath, glob)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (typeof code === 'string' && ACCESS_DENIED_CODES.has(code)) {
        logger.warn(`[SafeBackend] grep "${pattern}" blocked by ${code}: ${(err as Error).message}`)
        return { matches: [] }
      }
      throw err
    }
  }

  /**
   * 安全版 glob：限界 + 捕获 EPERM。
   */
  async glob(pattern: string, searchPath: string = '/'): Promise<GlobResult> {
    if (!this.isPathSafe(searchPath)) {
      logger.warn(`[SafeBackend] glob "${pattern}" blocked: path "${searchPath}" outside cwd`)
      return { files: [] }
    }
    try {
      return await super.glob(pattern, searchPath)
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (typeof code === 'string' && ACCESS_DENIED_CODES.has(code)) {
        logger.warn(`[SafeBackend] glob "${pattern}" blocked by ${code}: ${(err as Error).message}`)
        return { files: [] }
      }
      throw err
    }
  }
}
