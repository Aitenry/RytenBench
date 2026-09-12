import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  index,
  foreignKey,
  unique
} from 'drizzle-orm/pg-core'
import { images } from './common'

/** 音乐文件夹（歌单）表：主键为业务 id（非自增） */
export const music_folders = pgTable(
  'music_folders',
  {
    id: text().primaryKey().notNull(),
    path: text().notNull(),
    name: text().notNull(),
    description: text(),
    track_count: integer().default(0),
    image_id: text(),
    created_at: timestamp({ mode: 'string' }).defaultNow(),
    updated_at: timestamp({ mode: 'string' }).defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.image_id],
      foreignColumns: [images.id],
      name: 'music_folders_image_id_fkey'
    }),
    unique('music_folders_path_key').on(table.path)
  ]
)

/** 音乐曲目表：同一歌单内 file_hash 唯一，删除歌单时级联删除 */
export const music_tracks = pgTable(
  'music_tracks',
  {
    id: serial().primaryKey().notNull(),
    file_path: text().notNull(),
    file_hash: text().notNull(),
    folder_id: text().notNull(),
    title: text().notNull(),
    artist: text(),
    album: text(),
    duration: real(),
    liked: boolean().default(false),
    last_played_at: timestamp({ mode: 'string' }),
    image_id: text(),
    created_at: timestamp({ mode: 'string' }).defaultNow()
  },
  (table) => [
    index('idx_music_tracks_file_hash').using(
      'btree',
      table.file_hash.asc().nullsLast().op('text_ops')
    ),
    index('idx_music_tracks_folder').using(
      'btree',
      table.folder_id.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.image_id],
      foreignColumns: [images.id],
      name: 'music_tracks_image_id_fkey'
    }),
    foreignKey({
      columns: [table.folder_id],
      foreignColumns: [music_folders.id],
      name: 'music_tracks_folder_id_fkey'
    }).onDelete('cascade'),
    unique('music_tracks_folder_id_file_hash_key').on(table.folder_id, table.file_hash)
  ]
)
