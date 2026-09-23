// 只读检视应用数据库：文件改动记录 + 会话里工具块是否带卡片。
//
// 为什么需要它：用户报「明明编辑了文件，聊天里没有编辑卡片」「有些文件没改却显示已改」，
// 这类问题**只能在真实数据上定位**——代码里 `card` 的构造、渲染分支都看过了，
// 真正能一锤定音的是「库里到底存了什么」。排查思路：
//   ① `file_change` 表：每个文件的改动记录（来源 / 快照标记 / 状态）；
//   ② `harness_dialogue.blocks`：每条助手消息里 write_file / edit_file 块有没有 `card`。
//
// 安全约束（PGlite 无跨进程锁，直接连应用在用的库 = 双写，会写坏 WAL 检查点）：
// 本脚本**先把库整目录复制到系统临时目录**，只打开副本，且只读查询。
//
// 跑法：node scripts/inspect-app-db.mjs
//       node scripts/inspect-app-db.mjs --write-cards      # 全库扫写改卡片的 card
//       node scripts/inspect-app-db.mjs --dialogue 381     # 看某条消息的 blocks 明细
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

/** 应用 userData 下的真实库目录（Electron app.getPath('userData') + RytenBenchDB） */
function appDbDir() {
  const appData = process.env.APPDATA
  if (!appData) throw new Error('APPDATA 不可用：本脚本目前按 Windows 路径定位应用数据目录')
  const dir = join(appData, 'ryten-bench', 'RytenBenchDB')
  if (!existsSync(dir)) throw new Error(`找不到应用数据库目录：${dir}`)
  return dir
}

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const valueOf = (name) => {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}

const source = appDbDir()
const workdir = await mkdtemp(join(tmpdir(), 'ryten-db-inspect-'))
const copy = join(workdir, 'db')
console.log(`复制数据库副本（只读检视，绝不动真库）：\n  源  ${source}\n  副本 ${copy}`)
await cp(source, copy, { recursive: true })

const db = new PGlite(copy)
await db.waitReady

const pad = (v, n) => String(v ?? '').padEnd(n)
const padStart = (v, n) => String(v ?? '').padStart(n)

try {
  if (flag('--write-cards')) {
    const res = await db.query(
      `SELECT id, blocks::text AS blocks FROM harness_dialogue WHERE role = 'assistant' ORDER BY id DESC`
    )
    let write = 0
    let writeWithCard = 0
    let edit = 0
    let editWithCard = 0
    const rows = []
    for (const row of res.rows) {
      let blocks
      try {
        blocks = JSON.parse(row.blocks)
      } catch {
        continue
      }
      const found = []
      for (const b of blocks) {
        if (b.type !== 'tool') continue
        const name = b.tool?.name
        if (name === 'write_file') {
          write++
          if (b.tool.card) writeWithCard++
          found.push({ name, card: b.tool.card ?? null })
        }
        if (name === 'edit_file') {
          edit++
          if (b.tool.card) editWithCard++
          found.push({ name, card: b.tool.card ?? null })
        }
      }
      if (found.length > 0) rows.push({ id: row.id, found })
    }
    console.log(`\nwrite_file 块 ${write}（带 card ${writeWithCard}）`)
    console.log(`edit_file  块 ${edit}（带 card ${editWithCard}）`)
    for (const r of rows.slice(0, 12)) {
      console.log(`\ndialogue ${r.id}`)
      for (const f of r.found.slice(0, 8)) {
        console.log('   ', f.name, f.card ? JSON.stringify(f.card) : '<NO CARD>')
      }
      if (r.found.length > 8) console.log(`    …共 ${r.found.length} 个写改块`)
    }
  } else if (valueOf('--dialogue')) {
    const id = Number(valueOf('--dialogue'))
    const res = await db.query(
      `SELECT id, role, topic_id, blocks::text AS blocks FROM harness_dialogue WHERE id = $1`,
      [id]
    )
    const row = res.rows[0]
    if (!row) {
      console.log(`没有 id=${id} 的消息`)
    } else {
      const blocks = JSON.parse(row.blocks)
      const counts = new Map()
      for (const b of blocks) counts.set(b.type, (counts.get(b.type) ?? 0) + 1)
      console.log(
        `\ndialogue ${row.id} role=${row.role} topic=${row.topic_id} blocks=${blocks.length}`,
        JSON.stringify([...counts.entries()])
      )
      for (const [i, b] of blocks.entries()) {
        if (b.type !== 'tool') continue
        const t = b.tool ?? {}
        const cardKeys = t.card ? Object.keys(t.card).join(',') : '<NO CARD>'
        console.log(
          `${padStart(i, 4)} ${pad(t.name, 22)} ${pad(t.status, 10)} card{${cardKeys}} ${t.card ? JSON.stringify(t.card).slice(0, 90) : ''}`
        )
      }
    }
  } else {
    const rows = await db.query(
      `SELECT id, path, kind, source, status, added, removed, has_before, has_after,
              before_bytes, after_bytes, created_at::text AS created_at
       FROM file_change ORDER BY id DESC LIMIT 40`
    )
    console.log('\n--- file_change（最新 40 条）---')
    for (const r of rows.rows) {
      const reviewable =
        (r.has_before === 1 && r.has_after === 1) ||
        (r.kind === 'create' && r.has_after === 1) ||
        (r.kind === 'delete' && r.has_before === 1)
      console.log(
        [
          padStart(r.id, 4),
          pad(r.created_at?.slice(11, 19), 9),
          pad(r.kind, 7),
          pad(r.source, 11),
          pad(r.status, 9),
          pad(`+${r.added}/-${r.removed}`, 11),
          `快照 before=${r.has_before} after=${r.has_after}`,
          reviewable ? '可画差异' : '无差异（不进待审查）',
          r.path
        ].join(' ')
      )
    }
    const agg = await db.query(
      `SELECT status, kind, source, count(*)::int AS n FROM file_change GROUP BY 1,2,3 ORDER BY n DESC`
    )
    console.log('\n--- 汇总（状态 / 类型 / 来源）---')
    for (const r of agg.rows) console.log(JSON.stringify(r))
  }
} finally {
  await db.close()
  await rm(workdir, { recursive: true, force: true })
}
