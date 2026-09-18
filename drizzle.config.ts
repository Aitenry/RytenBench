import { defineConfig } from 'drizzle-kit'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * drizzle-kit 配置（仅开发期使用，不进打包产物）。
 *
 * - schema：TS schema 是结构的单一真源，改完执行 `pnpm drizzle-kit generate` 产出增量 SQL。
 * - out：迁移 SQL 与快照目录，随 extraResources 进安装包（database/drizzle），启动时由迁移器应用。
 * - dbCredentials：只在 `push` / `pull` / `studio` 这类**需要连库**的命令用到。
 *
 * ⚠️ 绝对不要把它指向应用正在使用的数据目录（`app.getPath('userData')/RytenBenchDB`）。
 * PGlite 是嵌入式 Postgres，**没有跨进程锁**：两个进程同时打开同一个数据目录会各自
 * 往同一份 pg_wal / pg_control 写，直接写出撕裂的检查点记录——2026-09-18 那次
 * 「Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"」正是这么来的（坏库诊断出
 * `invalid xl_info in checkpoint record` / `PANIC: could not locate a valid checkpoint record`，
 * 恢复过程见 docs/database-pglite-recovery.md）。
 * 因此默认给一个**独立的草稿目录**；确需连真实库时显式传 DRIZZLE_DB_DIR，并先退出应用：
 *
 *   DRIZZLE_DB_DIR="C:\Users\<you>\AppData\Roaming\ryten-bench\RytenBenchDB" pnpm drizzle-kit studio
 */
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  schema: './src/main/database/schema',
  out: './drizzle',
  dbCredentials: {
    // 草稿库：与本机应用数据目录完全隔离（默认落在系统临时目录下）
    url: process.env.DRIZZLE_DB_DIR ?? join(tmpdir(), 'ryten-bench-drizzle-scratch')
  },
  introspect: { casing: 'preserve' },
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
  verbose: true
})
