import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

/**
 * 自研任务列表解析插件（替代 markdown-it-task-lists）。
 *
 * 原插件只给 li/ul 打标记，遇到「普通列表与任务列表相邻」时
 * markdown-it 会把它们合并成一个 <ul>（含混排项），ProseMirror
 * 的 taskList 节点只接受 taskItem 子节点，混排会被包裹重组，
 * 产生空任务项、内容漂移等问题。
 *
 * 本插件在 token 层面将混排列表按类型拆分成独立的 <ul>：
 * - 任务项：首部 "[ ] "/"[x] " 转为复选框，li 打 task-list-item 类
 * - 任务列表 ul 打 contains-task-list 类（供 tiptap-markdown 的
 *   updateDOM 映射为 taskList 节点）
 */
export function taskCheckboxPlugin(md: MarkdownIt): void {
  /* 复选框渲染 */
  md.renderer.rules.task_checkbox = (tokens, idx) => {
    const checked = tokens[idx].attrGet('checked') === 'true'
    return `<input class="task-list-item-checkbox" type="checkbox" disabled${checked ? ' checked=""' : ''}>`
  }

  md.core.ruler.after('inline', 'task-list-items', (state) => {
    const TokenCtor = state.Token as new (type: string, tag: string, nesting: number) => Token

    const cloneToken = (t: Token): Token => {
      const c = new TokenCtor(t.type, t.tag, t.nesting)
      c.level = t.level
      c.map = t.map
      c.attrs = t.attrs ? t.attrs.map((a) => a.slice()) : null
      c.block = t.block
      c.hidden = t.hidden
      c.meta = t.meta
      c.content = t.content
      c.children = t.children
      return c
    }

    const addClass = (tok: Token, cls: string): void => {
      const idx = tok.attrIndex('class')
      if (idx < 0) {
        tok.attrPush(['class', cls])
      } else if (tok.attrs && !tok.attrs[idx][1].split(/\s+/).includes(cls)) {
        tok.attrs[idx][1] = `${tok.attrs[idx][1]} ${cls}`
      }
    }

    const isTaskStart = (content: string): boolean =>
      content.startsWith('[ ] ') ||
      content.startsWith('[x] ') ||
      content.startsWith('[X] ') ||
      content === '[ ]' ||
      content === '[x]' ||
      content === '[X]'

    /* 将一个任务项的首个 inline 内容转为复选框 */
    const transformTaskItem = (itemTokens: Token[], level: number): Token[] => {
      for (const tok of itemTokens) {
        if (tok.type === 'list_item_open' && tok.level === level + 1) {
          addClass(tok, 'task-list-item')
          continue
        }
        if (tok.type === 'inline' && isTaskStart(tok.content)) {
          const checked =
            tok.content.startsWith('[x] ') ||
            tok.content.startsWith('[X] ') ||
            tok.content === '[x]' ||
            tok.content === '[X]'
          const checkbox = new TokenCtor('task_checkbox', '', 0)
          checkbox.attrSet('checked', checked ? 'true' : 'false')
          if (tok.children) {
            tok.children.unshift(checkbox)
            if (tok.children.length > 1 && tok.children[1].type === 'text') {
              tok.children[1].content = tok.children[1].content.slice(3)
            }
          }
          tok.content = tok.content.slice(3)
          break
        }
      }
      return itemTokens
    }

    /* 判断一个列表项是否为任务项（首个 inline 以 [ ] /[x] 开头） */
    const classifyItem = (itemTokens: Token[]): 'task' | 'plain' => {
      const inline = itemTokens.find((t) => t.type === 'inline')
      if (inline && isTaskStart(inline.content)) return 'task'
      return 'plain'
    }

    /* 拆分混排列表时，去除「仅包裹单个 inline」的段落包装，
       避免原紧凑列表被 markdown-it 判定为 loose 后往返漂移 */
    const stripParagraphs = (tokens: Token[], level: number): Token[] => {
      const out: Token[] = []
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]
        if (t.type === 'paragraph_open' && t.level === level + 2) {
          let j = i + 1
          const inner: Token[] = []
          while (j < tokens.length) {
            if (tokens[j].type === 'paragraph_close' && tokens[j].level === level + 2) break
            inner.push(tokens[j])
            j++
          }
          const inlineCount = inner.filter((x) => x.type === 'inline').length
          if (inlineCount === 1 && inner.length === 1) {
            out.push(...inner)
            i = j /* 跳过 paragraph_close */
          } else {
            out.push(t)
          }
        } else {
          out.push(t)
        }
      }
      return out
    }

    /* 递归处理 token 数组中的全部 bullet_list（含嵌套），返回重建后的数组 */
    const processTokens = (arr: Token[]): Token[] => {
      const out: Token[] = []
      let i = 0
      while (i < arr.length) {
        const t = arr[i]
        if (t.type === 'bullet_list_open') {
          const rebuilt = rebuildList(arr, i)
          out.push(...rebuilt.tokens)
          i = rebuilt.end
        } else {
          out.push(t)
          i++
        }
      }
      return out
    }

    /* 重建单个 bullet_list：按任务/普通类型拆分成多个独立 ul */
    const rebuildList = (arr: Token[], openIdx: number): { tokens: Token[]; end: number } => {
      const openTok = arr[openIdx]
      const level = openTok.level
      let closeTok: Token | null = null
      let i = openIdx + 1

      const runs: { kind: 'task' | 'plain' | null; tokens: Token[] }[] = []
      let currentKind: 'task' | 'plain' | null = null
      let currentRun: Token[] = []

      const flush = (): void => {
        if (currentRun.length > 0) {
          runs.push({ kind: currentKind, tokens: currentRun })
          currentRun = []
        }
      }

      while (i < arr.length) {
        const t = arr[i]
        if (t.type === 'bullet_list_close' && t.level === level) {
          closeTok = t
          flush()
          i++
          break
        }
        if (t.type === 'list_item_open' && t.level === level + 1) {
          /* 消费完整列表项（到同层级的 list_item_close） */
          const itemTokens: Token[] = []
          let depth = 0
          while (i < arr.length) {
            const s = arr[i]
            itemTokens.push(s)
            if (s.type === 'list_item_open' && s.level === level + 1) depth++
            if (s.type === 'list_item_close' && s.level === level + 1) {
              depth--
              if (depth === 0) {
                i++
                break
              }
            }
            i++
          }
          /* 递归处理项内嵌套列表 */
          const processed = processTokens(itemTokens)
          const kind = classifyItem(processed)
          if (kind !== currentKind) {
            flush()
            currentKind = kind
          }
          currentRun.push(...processed)
        } else {
          currentRun.push(t)
          i++
        }
      }

      const out: Token[] = []
      const wasSplit = runs.length > 1
      for (const run of runs) {
        const openClone = cloneToken(openTok)
        const runTokens = wasSplit ? stripParagraphs(run.tokens, level) : run.tokens
        if (run.kind === 'task') {
          addClass(openClone, 'contains-task-list')
          for (const itemTokens of splitItems(runTokens, level)) {
            transformTaskItem(itemTokens, level)
          }
        }
        out.push(openClone, ...runTokens, cloneToken(closeTok as Token))
      }
      return { tokens: out, end: i }
    }

    /* 把一个 run 的 token 按 list_item 边界切分（每项一组） */
    const splitItems = (tokens: Token[], level: number): Token[][] => {
      const groups: Token[][] = []
      let current: Token[] = []
      let depth = 0
      for (const t of tokens) {
        current.push(t)
        if (t.type === 'list_item_open' && t.level === level + 1) depth++
        if (t.type === 'list_item_close' && t.level === level + 1) {
          depth--
          if (depth === 0) {
            groups.push(current)
            current = []
          }
        }
      }
      return groups
    }

    state.tokens = processTokens(state.tokens)
  })
}
