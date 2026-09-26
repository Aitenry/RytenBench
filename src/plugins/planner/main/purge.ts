import { withOrm } from '../../../main/database/orm'
import logger from 'electron-log'
import { planner_dependencies, planner_tasks } from './db/schema'

/**
 * planner 插件的**自清数据**实现（`plugin.purge` 贡献，契约见 `src/main/plugins/contributions.ts`）。
 *
 * 卸载插件且用户选择「不保留数据」时由宿主调用。本插件的全部用户数据就是两张表里的行：
 *
 * 1. `planner_dependencies`（任务依赖关系）——**先删**。它对 `planner_tasks` 有两条外键
 *    （`task_id` / `depends_on_task_id`，均 `onDelete('cascade')`），先删父表当然也会级联删掉，
 *    但显式按「子表 → 父表」的顺序删更可控，也不依赖运行期外键是否真的生效。
 * 2. `planner_tasks`（任务树，`parent_id` 自引用同样 `onDelete('cascade')`）。
 *
 * 本插件**没有**任何 core 表的数据（不像 music 会往 `images` 里写封面行），也不写
 * 用户可见目录 / 设置键（`settingsStore` 里没有 planner 前缀的键），因此这里不碰
 * 其它插件的行、不删任何文件。
 *
 * 表结构一律不动：迁移由 core 统一应用，卸载后迁移记录必须仍然一致。
 */
export async function purgePlannerData(): Promise<void> {
  const counts = await withOrm('purgePlannerData.deleteRows', async (db) =>
    db.transaction(async (tx) => {
      const deps = await tx.delete(planner_dependencies).returning({ id: planner_dependencies.id })
      const tasks = await tx.delete(planner_tasks).returning({ id: planner_tasks.id })
      return { deps: deps.length, tasks: tasks.length }
    })
  )

  logger.info(
    `[planner] 已清除插件数据：任务 ${counts.tasks} 行、依赖 ${counts.deps} 行（表结构未动）`
  )
}
