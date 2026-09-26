import * as fs from 'fs'
import { inArray, isNotNull } from 'drizzle-orm'
import logger from 'electron-log'
import { settingsStore } from '../../../main/context'
import { withOrm } from '../../../main/database/orm'
import { images } from '../../../main/database/schema/common'
import { music_folders, music_tracks } from './db/schema'

/**
 * music 插件的**自清数据**实现（`plugin.purge` 贡献，契约见 `src/main/plugins/contributions.ts`）。
 *
 * 卸载插件且用户选择「不保留数据」时由宿调用，做两件事：
 *
 * 1. **删行**：`music_tracks` → `music_folders`（顺序不能反：曲目对歌单有外键级联，
 *    先删父表会连带删子表，但显式按序删更可控），外加两表引用过、之后没人再引用的
 *    `images` 封面行——`images` 是 core 的表，这里只删**确实由本插件插入**的行
 *    （id 来自行内的 image_id），不碰文档/知识库的封面。
 * 2. **删应用托管的歌单目录**：`musicDirectory/<folder.path 里的 uuid>`。
 *    `folder.path` 就是 `create-folder` 建的 `${musicDirectory}\${uuid}`（见 main/ipc.ts）。
 *    **只删这一层**：不删 `musicDirectory` 本身（用户可能还有别的用途），
 *    也不碰用户自己选的原始音乐文件（那些文件从未被删过，`add-tracks` 是 copy 进来的）。
 *
 * 表结构一律不动：迁移由 core 统一应用，卸载后迁移记录必须仍然一致。
 */

/** 从歌单路径里取应用托管的 uuid 目录名（不在 musicDirectory 下或形态不符则返回 null） */
function managedFolderDir(folderPath: string, musicDirectory: string): string | null {
  if (typeof folderPath !== 'string' || folderPath === '') return null
  const normalized = folderPath.replace(/\//g, '\\')
  const root = musicDirectory.replace(/\//g, '\\').replace(/\\+$/, '')
  if (!normalized.toLowerCase().startsWith(root.toLowerCase() + '\\')) return null
  const rest = normalized.slice(root.length + 1)
  // 只接受**一级**子目录（uuid），再深的路径不属于应用托管范围
  if (rest === '' || rest.includes('\\')) return null
  return `${root}\\${rest}`
}

export async function purgeMusicData(): Promise<void> {
  const musicDirectory = settingsStore.get('musicDirectory') as string | undefined

  // ① 先取出要清理的行（删行之后就查不到了）
  const folders = await withOrm('purgeMusicData.listFolders', async (db) =>
    db
      .select({ id: music_folders.id, path: music_folders.path, image_id: music_folders.image_id })
      .from(music_folders)
  )

  // ② 删行：曲目 → 歌单 → 仅被本插件引用的封面
  await withOrm('purgeMusicData.deleteRows', async (db) => {
    await db.transaction(async (tx) => {
      const imageIds = new Set<string>()
      const trackImages = await tx
        .select({ image_id: music_tracks.image_id })
        .from(music_tracks)
        .where(isNotNull(music_tracks.image_id))
      for (const row of trackImages) if (row.image_id) imageIds.add(row.image_id)
      for (const row of folders) if (row.image_id) imageIds.add(row.image_id)

      await tx.delete(music_tracks)
      await tx.delete(music_folders)
      if (imageIds.size > 0) {
        await tx.delete(images).where(inArray(images.id, [...imageIds]))
      }
    })
  })

  // ③ 删应用托管的歌单目录（只删 uuid 那一层；没有 musicDirectory 就跳过）
  let removedDirs = 0
  if (musicDirectory) {
    for (const folder of folders) {
      const dir = managedFolderDir(folder.path, musicDirectory)
      if (!dir) continue
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true })
          removedDirs += 1
        }
      } catch (err) {
        // 目录被占用/权限不足：只告警，不阻塞卸载（行已经删干净了）
        logger.warn(`[music] 清理歌单目录失败: ${dir}`, err)
      }
    }
  }

  logger.info(
    `[music] 已清除插件数据：歌单 ${folders.length} 个、托管目录 ${removedDirs} 个` +
      `（musicDirectory 本身与用户原始音乐文件未动）`
  )
}
