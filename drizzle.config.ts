import { defineConfig } from 'drizzle-kit'
import { homedir } from 'os'
import { join } from 'path'

/**
 * drizzle-kit 配置（仅开发期使用，不进打包产物）。
 *
 * - schema：TS schema 是结构的单一真源，改完执行 `pnpm drizzle-kit generate` 产出增量 SQL。
 * - out：迁移 SQL 与快照目录，随 extraResources 进安装包（database/drizzle），启动时由迁移器应用。
 * - dbCredentials：只在 `push` / `pull` / `studio` 这类需要连库的命令用到；
 *   默认指向 `pnpm dev` 用的那个 PGlite 数据目录（app.getPath('userData')/RytenBenchDB），
 *   需要连别的库时用 `DRIZZLE_DB_DIR=<目录> pnpm drizzle-kit studio` 覆盖。
 *
 * 注意：introspect.casing 必须是 preserve —— 全项目（含 preload / 渲染层）都用 snake_case 字段名。
 */
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  schema: './src/main/database/schema',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DRIZZLE_DB_DIR ??
      join(process.env.APPDATA ?? homedir(), 'ryten-bench', 'RytenBenchDB')
  },
  introspect: { casing: 'preserve' },
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
  verbose: true
})
