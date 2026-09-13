import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import logger from 'electron-log'
import { mainFormat, mainPlural } from '../../i18n'
import { getFsToolTexts } from '../../i18n/tool-results-fs'

/**
 * 虚拟文件系统工具集 — 替代 deepagents FilesystemBackend / SafeFilesystemBackend
 *
 * 挂载规则（虚拟路径 → 真实路径）：
 * - '/memories/' → memoryPath（记忆目录）
 * - '/'          → workspacePath（AI 工作区；未配置时无此挂载）
 *
 * 设计要点（对应论文 §6.1 系统边界 / §6.3 声明即能力）：
 * - 工具按次构建、无共享状态（隔离）；
 * - 虚拟路径越界直接拒绝（能力衰减）；
 * - grep/glob 捕获 EPERM（延续原 SafeFilesystemBackend 逻辑）。
 */

/** EPERM / EACCES - 无权限访问的错误码 */
const ACCESS_DENIED_CODES = new Set(['EPERM', 'EACCES'])

/** 单文件读取/搜索结果上限 */
const MAX_FILE_CHARS = 20_000
/** read_file 内存保护上限（超大文件截断到 2M 字符，防止把整个文件读进内存/上下文） */
const MAX_FILE_READ_CHARS = 2_000_000
/** 命令输出上限 */
const MAX_EXEC_CHARS = 8_000
/** 递归搜索条目上限 */
const MAX_SCAN_ENTRIES = 2_000
/**
 * 工具输出硬上限（内存保护；正常业务输出远达不到）。
 * 12K~500K 区间的超长输出由溢出策略（spill.ts）保存全文并返回预览，
 * 因此这里不再提前截断到 20K——否则溢出保存的是截断后的内容，失去意义。
 */
const MAX_OUTPUT_CHARS = 500_000

interface FsMount {
  /** 虚拟前缀，如 '/' 或 '/memories/' */
  prefix: string
  /** 真实根目录 */
  root: string
}

export interface FsBackendOptions {
  /** AI 工作区目录（挂载为虚拟 '/'） */
  workspacePath?: string
  /** 记忆目录（挂载为虚拟 '/memories/'） */
  memoryPath?: string
}

/** 解析虚拟路径 → 真实路径；越界或未挂载返回错误 */
function resolveVirtualPath(
  vp: string,
  mounts: FsMount[]
): { realPath: string } | { error: string } {
  const tr = getFsToolTexts()
  if (!vp) return { error: tr.path.empty }

  // 统一为 POSIX 分隔符
  let normalized = vp.replace(/\\/g, '/')
  // Windows 绝对路径（如 E:\...）一律拒绝，防止扫描驱动器
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return { error: mainFormat(tr.path.absolute, { path: vp }) }
  }
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized
  }
  // 去除末尾斜杠（根路径除外）
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  // 最长前缀优先匹配挂载
  const mountsSorted = [...mounts].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const mount of mountsSorted) {
    if (normalized === mount.prefix.slice(0, -1) || normalized.startsWith(mount.prefix)) {
      const rel = normalized.slice(mount.prefix.length).replace(/^\//, '')
      const realPath = path.join(mount.root, ...(rel ? rel.split('/') : []))
      // 二次校验：确保解析结果仍在挂载根内（防 ../ 逃逸）
      const relative = path.relative(mount.root, realPath)
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { error: mainFormat(tr.path.escapesMount, { path: vp }) }
      }
      return { realPath }
    }
  }

  return { error: mainFormat(tr.path.notMounted, { path: vp }) }
}

/** 工具输出统一格式化（字符串原样；对象 JSON 序列化；超硬上限截断，溢出策略负责内联预览） */
function formatOutput(output: unknown): string {
  if (output == null) return 'OK'
  const text = typeof output === 'string' ? output : JSON.stringify(output)
  if (text.length > MAX_OUTPUT_CHARS) {
    const tr = getFsToolTexts()
    const note = mainFormat(tr.output.truncated, { total: text.length })
    return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...${note}`
  }
  return text
}

/** 简易 glob → 正则（支持 *、**、?） */
function globToRegExp(pattern: string): RegExp {
  const GLOBSTAR = '__GLOBSTAR__'
  let re = pattern
    .replace(/\*\*/g, GLOBSTAR) // 临时占位
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(new RegExp(GLOBSTAR, 'g'), '.*')
  // 纯文件名模式也匹配路径末尾
  if (!re.includes('/')) {
    re = `(?:^|/)${re}$`
  } else {
    re = `^${re}$`
  }
  return new RegExp(re)
}

/** 递归收集目录下的相对路径列表（限界） */
function walkDir(root: string, relDir: string, out: string[], cap = MAX_SCAN_ENTRIES): void {
  if (out.length >= cap) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(path.join(root, relDir), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= cap) return
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      out.push(rel + '/')
      walkDir(root, rel, out, cap)
    } else if (entry.isFile()) {
      out.push(rel)
    }
  }
}

/**
 * 构建文件系统工具集。无任何挂载时返回空数组（组件不激活，对应论文「依赖缺失 = 不激活」）。
 */
export function buildFsTools(options: FsBackendOptions): StructuredToolInterface[] {
  const mounts: FsMount[] = []
  if (options.workspacePath) {
    mounts.push({ prefix: '/', root: options.workspacePath })
  }
  if (options.memoryPath) {
    mounts.push({ prefix: '/memories/', root: options.memoryPath })
  }
  if (mounts.length === 0) return []

  const tr = getFsToolTexts()
  const resolve = (vp: string): { realPath: string } | { error: string } =>
    resolveVirtualPath(vp, mounts)

  const tools: StructuredToolInterface[] = [
    tool(
      async ({ file_path, offset, limit }) => {
        const resolved = resolve(file_path)
        if ('error' in resolved) return resolved.error
        try {
          const stat = fs.statSync(resolved.realPath)
          if (!stat.isFile()) return mainFormat(tr.read.notFile, { path: file_path })
          let content = fs.readFileSync(resolved.realPath, 'utf-8')
          // 内存保护：超过 2M 字符的文件只保留前 2M 字符
          const oversized = content.length > MAX_FILE_READ_CHARS
          if (oversized) {
            content = content.slice(0, MAX_FILE_READ_CHARS)
          }
          // 行区间读取（offset 从 1 开始）：大文件按需读取指定片段
          if (offset != null || limit != null) {
            const startLine = Math.max(1, offset ?? 1)
            const lines = content.split('\n')
            const endLine = limit != null ? startLine + limit - 1 : lines.length
            const sliced = lines.slice(startLine - 1, endLine)
            const shownEnd = Math.min(endLine, lines.length)
            const lineNote = mainFormat(
              oversized ? tr.read.lineRangeOversized : tr.read.lineRange,
              { start: startLine, end: shownEnd, total: lines.length }
            )
            return lineNote + sliced.join('\n')
          }
          // 内联读取上限：超出部分不进入模型上下文（read 工具自有边界，不走溢出策略，
          // 参考 dsh-spill-policy 的 read 豁免——大文件用 offset/limit 或 grep 按需读取）
          if (content.length > MAX_FILE_CHARS) {
            const note = mainFormat(tr.read.truncated, {
              total: content.length.toLocaleString()
            })
            return `${content.slice(0, MAX_FILE_CHARS)}\n...${note}`
          }
          return content
        } catch (err) {
          return mainFormat(tr.read.failed, { message: (err as Error).message })
        }
      },
      {
        name: 'read_file',
        description:
          'Read a file (UTF-8) from the virtual filesystem. Paths are virtual and must start with "/", e.g. /uploads/report.txt or /memories/_global/memories/AGENTS.md. When a file exceeds the inline limit, the result starts with a spill locator for the full content: use offset/limit to read a line range of that file, or grep to locate what you need.',
        schema: z.object({
          file_path: z.string().describe('Virtual path of the file to read'),
          offset: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              'Start line number (1-based); use to read one part of a large file on demand'
            ),
          limit: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('Number of lines to read, used together with offset')
        })
      }
    ),

    tool(
      async ({ file_path, content }) => {
        const resolved = resolve(file_path)
        if ('error' in resolved) return resolved.error
        try {
          // 异步写（修复：同步写阻塞主进程事件循环）
          await fs.promises.mkdir(path.dirname(resolved.realPath), { recursive: true })
          await fs.promises.writeFile(resolved.realPath, content, 'utf-8')
          return mainFormat(tr.write.written, {
            path: file_path,
            bytes: Buffer.byteLength(content, 'utf-8')
          })
        } catch (err) {
          return mainFormat(tr.write.failed, { message: (err as Error).message })
        }
      },
      {
        name: 'write_file',
        description:
          'Write a file in the virtual filesystem, overwriting it if it already exists. Missing parent directories are created automatically.',
        schema: z.object({
          file_path: z.string().describe('Virtual path of the file to write'),
          content: z.string().describe('Full file content')
        })
      }
    ),

    tool(
      async ({ file_path, old_string, new_string, replace_all }) => {
        // 空 old_string 会使下方的非重叠计数循环永不终止（indexOf('', idx) 恒等于 idx，
        // idx = found + 0 永不前进）——同步死循环直接卡死主进程事件循环，入口必须显式拒绝
        if (!old_string) {
          return tr.edit.emptyOldString
        }
        const resolved = resolve(file_path)
        if ('error' in resolved) return resolved.error
        try {
          const current = fs.readFileSync(resolved.realPath, 'utf-8')
          // 非重叠计数
          let count = 0
          let idx = 0
          while (true) {
            const found = current.indexOf(old_string, idx)
            if (found === -1) break
            count++
            idx = found + old_string.length
          }
          if (count === 0) {
            return tr.edit.noMatch
          }
          if (count > 1 && !replace_all) {
            return mainPlural(tr.edit.occurrences_one, tr.edit.occurrences_other, count)
          }
          const updated = replace_all
            ? current.split(old_string).join(new_string)
            : current.replace(old_string, new_string)
          fs.writeFileSync(resolved.realPath, updated, 'utf-8')
          return mainFormat(mainPlural(tr.edit.updated_one, tr.edit.updated_other, count), {
            path: file_path
          })
        } catch (err) {
          return mainFormat(tr.edit.failed, { message: (err as Error).message })
        }
      },
      {
        name: 'edit_file',
        description:
          'Edit a file in the virtual filesystem by replacing old_string with new_string. old_string must match the file content exactly and be unique; when it occurs more than once, either provide a longer unique context or set replace_all to true. Prefer this over write_file for targeted changes.',
        schema: z.object({
          file_path: z.string().describe('Virtual path of the file to edit'),
          old_string: z
            .string()
            .min(1, 'old_string must not be empty')
            .describe(
              'Exact text to find and replace (must match the file content character for character)'
            ),
          new_string: z.string().describe('Replacement text'),
          replace_all: z
            .boolean()
            .optional()
            .describe(
              'When true, replace every occurrence; defaults to false (a unique match is required)'
            )
        })
      }
    ),

    tool(
      async ({ path: dirPath }) => {
        const resolved = resolve(dirPath ?? '/')
        if ('error' in resolved) return resolved.error
        try {
          const entries = fs.readdirSync(resolved.realPath, { withFileTypes: true })
          const files: string[] = []
          const dirs: string[] = []
          for (const entry of entries) {
            if (entry.isDirectory()) dirs.push(entry.name)
            else if (entry.isFile()) files.push(entry.name)
          }
          return JSON.stringify({ path: dirPath ?? '/', files, dirs })
        } catch (err) {
          return mainFormat(tr.ls.failed, { message: (err as Error).message })
        }
      },
      {
        name: 'ls',
        description:
          'List the files and subdirectories directly inside a virtual filesystem directory (one level, not recursive). Use glob to match paths recursively by pattern.',
        schema: z.object({
          path: z
            .string()
            .optional()
            .describe('Virtual path of the directory, defaults to the root /')
        })
      }
    ),

    tool(
      async ({ pattern, path: searchPath }) => {
        const resolved = resolve(searchPath ?? '/')
        if ('error' in resolved) return resolved.error
        try {
          const regex = globToRegExp(pattern)
          const relPaths: string[] = []
          walkDir(resolved.realPath, '', relPaths)
          const matches = relPaths.filter((rel) => regex.test(rel)).slice(0, 200)
          return JSON.stringify({ pattern, files: matches })
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code
          if (typeof code === 'string' && ACCESS_DENIED_CODES.has(code)) {
            logger.warn(`[FsBackend] glob "${pattern}" blocked by ${code}`)
            return JSON.stringify({ pattern, files: [] })
          }
          return mainFormat(tr.glob.failed, { message: (err as Error).message })
        }
      },
      {
        name: 'glob',
        description:
          'Find files and directories by path pattern in the virtual filesystem. Patterns support *, ** and ? (e.g. **/*.md) and are matched against paths, not file contents; use grep to search inside files.',
        schema: z.object({
          pattern: z.string().describe('Glob pattern, e.g. **/*.md'),
          path: z
            .string()
            .optional()
            .describe('Virtual path of the directory to start from, defaults to the root /')
        })
      }
    ),

    tool(
      async ({ pattern, path: searchPath, glob: fileGlob }) => {
        const resolved = resolve(searchPath ?? '/')
        if ('error' in resolved) return resolved.error
        try {
          const regex = new RegExp(pattern)
          const fileRegex = fileGlob ? globToRegExp(fileGlob) : null
          const relPaths: string[] = []
          walkDir(resolved.realPath, '', relPaths)
          const matches: { path: string; line: number; content: string }[] = []
          for (const rel of relPaths) {
            if (rel.endsWith('/')) continue
            if (fileRegex && !fileRegex.test(rel)) continue
            if (matches.length >= 100) break
            try {
              const abs = path.join(resolved.realPath, rel)
              const stat = fs.statSync(abs)
              if (stat.size > 1024 * 1024) continue // 跳过 >1MB 文件
              const lines = fs.readFileSync(abs, 'utf-8').split('\n')
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  matches.push({ path: '/' + rel, line: i + 1, content: lines[i].slice(0, 200) })
                  if (matches.length >= 100) break
                }
              }
            } catch {
              // 单个文件失败（EPERM 等）跳过
            }
          }
          return JSON.stringify({ matches })
        } catch (err) {
          const code = (err as NodeJS.ErrnoException)?.code
          if (typeof code === 'string' && ACCESS_DENIED_CODES.has(code)) {
            logger.warn(`[FsBackend] grep "${pattern}" blocked by ${code}`)
            return JSON.stringify({ matches: [] })
          }
          return mainFormat(tr.glob.failed, { message: (err as Error).message })
        }
      },
      {
        name: 'grep',
        description:
          'Search file contents in the virtual filesystem and return matching lines with their paths and line numbers. The pattern is a regular expression matched against each line; use glob to narrow which files are searched.',
        schema: z.object({
          pattern: z
            .string()
            .describe('Regular expression matched against each line of file content'),
          path: z
            .string()
            .optional()
            .describe('Virtual path of the directory to start from, defaults to the root /'),
          glob: z.string().optional().describe('Optional glob filter for the file paths to search')
        })
      }
    )
  ]

  // execute 仅在工作区目录存在时启用（对应论文 §6.1：命令执行是系统边界外的副作用，需显式开放）
  if (options.workspacePath) {
    tools.push(
      tool(
        async ({ command }, config) => {
          return await new Promise<string>((resolvePromise) => {
            const child = exec(
              command,
              {
                cwd: options.workspacePath,
                timeout: 30_000,
                maxBuffer: 2 * 1024 * 1024,
                windowsHide: true
              },
              (error, stdout, stderr) => {
                const out = stdout || ''
                const errOut = stderr || ''
                const exitCode = error
                  ? typeof (error as { code?: number }).code === 'number'
                    ? (
                        error as {
                          code: number
                        }
                      ).code
                    : 1
                  : 0
                let text = out
                if (errOut) text += (text ? '\n' : '') + `[stderr]\n${errOut}`
                if (text.length > MAX_EXEC_CHARS) {
                  text = `${text.slice(0, MAX_EXEC_CHARS)}\n...${tr.exec.truncated}`
                }
                resolvePromise(JSON.stringify({ exitCode, stdout: text }))
              }
            )
            // 取消贯通（修复：此前 execute 不响应「停止」，命令最多再跑 30s 且副作用不随取消中止）
            const signal = config?.signal
            const onAbort = (): void => {
              try {
                child.kill()
              } catch {
                // 进程已退出
              }
            }
            if (signal) {
              if (signal.aborted) onAbort()
              else signal.addEventListener('abort', onAbort, { once: true })
            }
            // 子进程关闭后移除监听，避免 listener 泄漏
            child.on('close', () => {
              if (signal) signal.removeEventListener('abort', onAbort)
            })
          })
        },
        {
          name: 'execute',
          description:
            'Run a shell command (Windows) with the workspace directory as the working directory, returning stdout/stderr and the exit code. Use it for read-only queries and operations confined to the workspace; prefer `read_file`, `write_file`, `ls`, `glob` and `grep` for file and directory work.',
          schema: z.object({
            command: z.string().describe('Shell command to execute')
          })
        }
      )
    )
  }

  return tools
}

/** 供其他模块复用的输出格式化（子代理最终输出等） */
export { formatOutput }
