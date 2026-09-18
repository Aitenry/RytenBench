#!/usr/bin/env node
/**
 * PGlite 数据目录抢救工具（纯 PGlite，不需要 Docker / 原生 PostgreSQL）。
 *
 * 背景：RytenBench 的数据库是嵌入式 Postgres（PGlite），**没有 pg_resetwal**。一旦
 * pg_control / pg_wal 里的检查点记录被写坏（非正常退出、或两个进程同时打开同一目录），
 * 集群就再也起不来，Postgres 只会打印：
 *
 *   LOG:  database system was interrupted; last known up at ...
 *   LOG:  invalid xl_info in checkpoint record
 *   PANIC: could not locate a valid checkpoint record at 0/XXXXXXX
 *   RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
 *
 * 但**数据页本身通常是完好的**（PGlite 默认严格持久化：每次事务都落盘）。本工具利用这一点：
 *
 *   1. 建一个健康的新集群（拿到合法的 pg_control / pg_wal）；
 *   2. 把它的 XID 推进到超过坏库 `pg_control` 里的 nextXid（否则旧行会被当成「未来事务」不可见），
 *      然后 CHECKPOINT，让 WAL 末尾就是检查点（重启时无 WAL 可重放，数据页不会被新集群覆盖）；
 *   3. 用坏库的数据文件与事务状态替换掉新集群的（保留新集群的 pg_control / pg_wal）；
 *   4. 启动 → 旧数据可见 → 用应用自己的 drizzle 迁移建一个干净库，把数据整表搬过去
 *      （不直接沿用「缝合库」：它的 nextOid 还是新集群的，再建对象会覆盖旧数据文件）。
 *
 * 用法：
 *   node scripts/recover-pglite.mjs                      # 用默认数据目录，输出到临时目录
 *   node scripts/recover-pglite.mjs --dir <坏库目录>      # 指定坏库
 *   node scripts/recover-pglite.mjs --out <输出目录>      # 指定干净库输出位置
 *   node scripts/recover-pglite.mjs --install             # 校验通过后直接换库（坏库改名留档）
 *
 * 全程只读坏库：所有中间产物都写在系统临时目录里。
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const APP_DATA = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
const SOURCE = resolve(arg('dir', join(APP_DATA, 'ryten-bench', 'RytenBenchDB')))
const OUT = resolve(arg('out', join(tmpdir(), 'RytenBenchDB-recovered')))
const WORK = join(tmpdir(), `pglite-recover-work-${Date.now()}`)
const MIGRATIONS = join(resolve(import.meta.dirname, '..'), 'drizzle')

const STATE_OFFSET = 16 // pg_control: DBState state
const NEXT_XID_OFFSET = 64 // pg_control: checkPointCopy.nextXid（PG18，经验标定）

const log = (...args) => console.log('[recover]', ...args)

if (!existsSync(join(SOURCE, 'global', 'pg_control'))) {
  console.error(`不是 PGlite 数据目录（缺 global/pg_control）：${SOURCE}`)
  process.exit(1)
}
log(`坏库：${SOURCE}`)
log(`输出：${OUT}`)
log(`工作目录：${WORK}`)

const controlPath = join(SOURCE, 'global', 'pg_control')
const control = readFileSync(controlPath)
const nextXid = control.readBigUInt64LE(NEXT_XID_OFFSET)
log(`坏库 nextXid=${nextXid}，state=${control.readUInt32LE(STATE_OFFSET)}`)

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
rmSync(OUT, { recursive: true, force: true })

/* ── 1. 健康新集群 + 推高 XID + 末尾 CHECKPOINT ── */
const DONOR = join(WORK, 'donor')
const donor = new PGlite(DONOR)
await donor.waitReady
const target = nextXid + 5000n
let current = (await donor.query('select pg_current_xact_id()::text as x')).rows[0].x
log(`推进 XID：${current} → ≥ ${target}`)
let spent = 0
while (BigInt(current) < target) {
  await donor.query('select pg_current_xact_id()')
  current = (await donor.query('select pg_current_xact_id()::text as x')).rows[0].x
  spent += 1
  if (spent % 2000 === 0) log(`  …${spent} 次事务，XID=${current}`)
}
await donor.exec('CHECKPOINT') // 之后不再写任何东西：重启时没有 WAL 可重放
log(`XID 推到 ${current}（${spent} 次事务），已 CHECKPOINT`)
await donor.close()

/* ── 2. 换入坏库的数据文件（保留新集群的 pg_control 与 pg_wal）── */
rmSync(join(DONOR, 'base'), { recursive: true, force: true })
cpSync(join(SOURCE, 'base'), join(DONOR, 'base'), { recursive: true })
const keepControl = join(WORK, 'pg_control.keep')
cpSync(join(DONOR, 'global', 'pg_control'), keepControl)
for (const name of readdirSync(join(SOURCE, 'global'))) {
  if (name === 'pg_control' || name === 'pg_internal.init') continue
  const dst = join(DONOR, 'global', name)
  rmSync(dst, { recursive: true, force: true })
  cpSync(join(SOURCE, 'global', name), dst, { recursive: true })
}
cpSync(keepControl, join(DONOR, 'global', 'pg_control'))
for (const name of [
  'pg_xact',
  'pg_multixact',
  'pg_commit_ts',
  'pg_subtrans',
  'pg_notify',
  'pg_serial',
  'pg_logical'
]) {
  if (!existsSync(join(SOURCE, name))) continue
  const dst = join(DONOR, name)
  rmSync(dst, { recursive: true, force: true })
  cpSync(join(SOURCE, name), dst, { recursive: true })
}
log('坏库数据文件已就位')

/* ── 3. 打开缝合库（只读用途）── */
const donorDb = new PGlite(DONOR)
try {
  await donorDb.waitReady
} catch (err) {
  console.error(`缝合库仍无法启动：${err?.name}: ${err?.message}`)
  console.error('数据页可能也损坏了；可尝试 --dir 指向更早的备份，或放弃该目录。')
  process.exit(1)
}
const tables = (
  await donorDb.query(
    `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`
  )
).rows.map((r) => r.table_name)
log(`读到 ${tables.length} 张表`)

const dump = {}
for (const table of tables) {
  const columns = (
    await donorDb.query(
      `select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
      [table]
    )
  ).rows.map((r) => r.column_name)
  const rows = (await donorDb.query(`select * from "public"."${table}"`)).rows
  dump[table] = { columns, rows }
  if (rows.length > 0) log(`  ${table}: ${rows.length} 行`)
}
await donorDb.close()

/* ── 4. 用应用自己的迁移建干净库并回填 ── */
const clean = new PGlite(OUT)
await clean.waitReady
await migrate(drizzle(clean), { migrationsFolder: MIGRATIONS })
log('干净库已建（应用 drizzle 迁移）')

const pending = tables.filter((t) => dump[t].rows.length > 0)
let inserted = 0
for (let round = 0; round < 4 && pending.length > 0; round += 1) {
  const retry = []
  for (const table of pending) {
    const { columns, rows } = dump[table]
    const names = columns.map((c) => `"${c}"`).join(',')
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',')
    try {
      for (const row of rows) {
        await clean.query(
          `insert into "public"."${table}" (${names}) values (${placeholders})`,
          columns.map((c) => row[c])
        )
        inserted += 1
      }
    } catch (err) {
      retry.push(table)
      if (round === 3) console.error(`  ✗ ${table}: ${err.message}`)
    }
  }
  pending.length = 0
  pending.push(...retry)
}
log(`回填 ${inserted} 行`)

// 序列对齐（serial 列的 nextval 必须超过已有 max(id)）
const sequences = (
  await clean.query(
    `select c.relname as seq, a.attname as col, n.nspname as schema, t.relname as tbl
     from pg_class c
     join pg_depend d on d.objid = c.oid and d.deptype = 'a'
     join pg_class t on t.oid = d.refobjid
     join pg_namespace n on n.oid = t.relnamespace
     join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
     where c.relkind = 'S'`
  )
).rows
for (const s of sequences) {
  try {
    await clean.query(
      `select setval('"${s.schema}"."${s.seq}"', greatest(coalesce((select max("${s.col}") from "${s.schema}"."${s.tbl}"), 0), 1))`
    )
  } catch (err) {
    console.warn(`  序列 ${s.seq} 对齐失败: ${err.message.slice(0, 80)}`)
  }
}
log(`已对齐 ${sequences.length} 个序列`)

// 校验：逐表比对行数
let mismatch = 0
for (const table of tables) {
  const got = (await clean.query(`select count(*)::int as n from "public"."${table}"`)).rows[0].n
  const want = dump[table].rows.length
  if (got !== want) {
    mismatch += 1
    console.error(`  ✗ ${table}: ${got} ≠ ${want}`)
  }
}
await clean.close()
log(mismatch === 0 ? '✓ 所有表行数一致' : `✗ ${mismatch} 张表行数不一致`)
log(`干净库：${OUT}`)

/* ── 5. 可选：直接换库（坏库改名留档）── */
if (flag('install')) {
  if (mismatch > 0) {
    console.error('行数不一致，拒绝换库（请先人工检查）')
    process.exit(1)
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archived = `${SOURCE}.corrupt-${stamp}`
  renameSync(SOURCE, archived)
  cpSync(OUT, SOURCE, { recursive: true })
  log(`已换库：原目录留档为 ${archived}`)
  log('接下来启动应用即可；若确认无事，可自行删除留档目录。')
} else {
  log('未换库（加 --install 可直接换库，或手动把上面这个目录拷到应用数据目录下）')
}

rmSync(WORK, { recursive: true, force: true })
