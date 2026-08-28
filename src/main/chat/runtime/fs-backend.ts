import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import logger from 'electron-log'

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
  if (!vp) return { error: '路径不能为空' }

  // 统一为 POSIX 分隔符
  let normalized = vp.replace(/\\/g, '/')
  // Windows 绝对路径（如 E:\...）一律拒绝，防止扫描驱动器
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return { error: `路径 "${vp}" 是绝对路径，请使用虚拟路径（如 /uploads/xxx）` }
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
        return { error: `路径 "${vp}" 越出挂载根目录` }
      }
      return { realPath }
    }
  }

  return { error: `路径 "${vp}" 未挂载到任何虚拟目录` }
}

/** 工具输出统一格式化（字符串原样；对象 JSON 序列化；超硬上限截断，溢出策略负责内联预览） */
function formatOutput(output: unknown): string {
  if (output == null) return 'OK'
  const text = typeof output === 'string' ? output : JSON.stringify(output)
  if (text.length > MAX_OUTPUT_CHARS) {
    return `${text.slice(0, MAX_OUTPUT_CHARS)}\n...（输出过大，已截断，共 ${text.length} 字符）`
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

  const resolve = (vp: string): { realPath: string } | { error: string } =>
    resolveVirtualPath(vp, mounts)

  const tools: StructuredToolInterface[] = [
    tool(
      async ({ file_path, offset, limit }) => {
        const resolved = resolve(file_path)
        if ('error' in resolved) return resolved.error
        try {
          const stat = fs.statSync(resolved.realPath)
          if (!stat.isFile()) return `路径不是文件: ${file_path}`
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
            const lineNote = `（第 ${startLine}-${Math.min(endLine, lines.length)} 行 / 共 ${lines.length} 行${oversized ? '，文件超大仅索引前 2M 字符' : ''}）\n`
            return lineNote + sliced.join('\n')
          }
          // 内联读取上限：超出部分不进入模型上下文（read 工具自有边界，不走溢出策略，
          // 参考 dsh-spill-policy 的 read 豁免——大文件用 offset/limit 或 grep 按需读取）
          if (content.length > MAX_FILE_CHARS) {
            return `${content.slice(0, MAX_FILE_CHARS)}\n...（文件过长，共 ${content.length.toLocaleString()} 字符，已省略中间内容。可用 offset/limit 参数按行读取任意片段，或用 grep 检索关键字。）`
          }
          return content
        } catch (err) {
          return `读取文件失败: ${(err as Error).message}`
        }
      },
      {
        name: 'read_file',
        description:
          '读取虚拟文件系统中的文件内容（UTF-8）。路径使用虚拟路径，如 /uploads/report.txt 或 /memories/_global/memories/AGENTS.md。大文件超出内联上限时会给出溢出文件定位符，可用 offset/limit 按行读取其中片段，或用 grep 检索。',
        schema: z.object({
          file_path: z.string().describe('要读取的文件的虚拟路径'),
          offset: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('起始行号（从 1 开始），用于按需读取大文件的片段'),
          limit: z.number().int().positive().optional().describe('读取的行数，与 offset 配合使用')
        })
      }
    ),

    tool(
      async ({ file_path, content }) => {
        const resolved = resolve(file_path)
        if ('error' in resolved) return resolved.error
        try {
          fs.mkdirSync(path.dirname(resolved.realPath), { recursive: true })
          fs.writeFileSync(resolved.realPath, content, 'utf-8')
          return `已写入 ${file_path}（${Buffer.byteLength(content, 'utf-8')} 字节）`
        } catch (err) {
          return `写入文件失败: ${(err as Error).message}`
        }
      },
      {
        name: 'write_file',
        description: '写入（或覆盖）虚拟文件系统中的文件，自动创建父目录。',
        schema: z.object({
          file_path: z.string().describe('要写入的文件的虚拟路径'),
          content: z.string().describe('文件内容')
        })
      }
    ),

    tool(
      async ({ file_path, old_string, new_string, replace_all }) => {
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
            return `未找到匹配内容，未做任何修改。请检查 old_string 是否与文件内容完全一致（包括空白与换行）。`
          }
          if (count > 1 && !replace_all) {
            return `old_string 在文件中出现 ${count} 次。请提供更长的唯一上下文，或将 replace_all 设为 true。`
          }
          const updated = replace_all
            ? current.split(old_string).join(new_string)
            : current.replace(old_string, new_string)
          fs.writeFileSync(resolved.realPath, updated, 'utf-8')
          return `已更新 ${file_path}：替换了 ${count} 处。`
        } catch (err) {
          return `编辑文件失败: ${(err as Error).message}`
        }
      },
      {
        name: 'edit_file',
        description:
          '编辑虚拟文件系统中的文件：将 old_string 替换为 new_string。要求 old_string 唯一匹配；多匹配时需提供更长上下文或设置 replace_all。',
        schema: z.object({
          file_path: z.string().describe('要编辑的文件的虚拟路径'),
          old_string: z.string().describe('要查找并替换的原文（必须与文件内容完全一致）'),
          new_string: z.string().describe('替换后的新内容'),
          replace_all: z
            .boolean()
            .optional()
            .describe('为 true 时替换全部匹配；默认 false（要求唯一匹配）')
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
          return `列出目录失败: ${(err as Error).message}`
        }
      },
      {
        name: 'ls',
        description: '列出虚拟文件系统目录下的文件与子目录。',
        schema: z.object({
          path: z.string().optional().describe('目录的虚拟路径，默认根目录 /')
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
          return `搜索失败: ${(err as Error).message}`
        }
      },
      {
        name: 'glob',
        description: '按 glob 模式（支持 *、**、?）在虚拟文件系统中递归搜索文件与目录路径。',
        schema: z.object({
          pattern: z.string().describe('glob 模式，如 **/*.md'),
          path: z.string().optional().describe('搜索起始目录的虚拟路径，默认根目录 /')
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
          return `搜索失败: ${(err as Error).message}`
        }
      },
      {
        name: 'grep',
        description: '在虚拟文件系统中递归搜索匹配正则表达式的文本行。',
        schema: z.object({
          pattern: z.string().describe('正则表达式'),
          path: z.string().optional().describe('搜索起始目录的虚拟路径，默认根目录 /'),
          glob: z.string().optional().describe('可选的文件名 glob 过滤')
        })
      }
    )
  ]

  // execute 仅在工作区目录存在时启用（对应论文 §6.1：命令执行是系统边界外的副作用，需显式开放）
  if (options.workspacePath) {
    tools.push(
      tool(
        async ({ command }) => {
          return await new Promise<string>((resolvePromise) => {
            exec(
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
                  text = `${text.slice(0, MAX_EXEC_CHARS)}\n...（输出过长，已截断）`
                }
                resolvePromise(JSON.stringify({ exitCode, stdout: text }))
              }
            )
          })
        },
        {
          name: 'execute',
          description:
            '在工作区目录中执行 shell 命令（Windows），返回 stdout/stderr 与退出码。仅用于只读查询与工作区内的操作。',
          schema: z.object({
            command: z.string().describe('要执行的 shell 命令')
          })
        }
      )
    )
  }

  return tools
}

/** 供其他模块复用的输出格式化（子代理最终输出等） */
export { formatOutput }
