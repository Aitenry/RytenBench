import type { AddTracksResult, MusicFolder, MusicPlayRequest, Track } from '../shared/types'

/**
 * music 插件主进程通道的薄封装。
 *
 * 原先散在 `src/preload/index.ts` 的 `api.music` 命名空间已删除；这里的方法
 * **同名、同参数、同返回类型**，实现改为走 preload 唯一暴露的通用桥
 * （`window.api.plugin.invoke` / `window.api.plugin.on`，通道名 `plugin:music:*`）。
 * 类型沿用 `shared/types.ts` 的 DTO 形状，未改语义。
 */
const invoke = window.api.plugin.invoke

export const musicApi = {
  selectDirectory: () => invoke('plugin:music:select-directory') as Promise<string | null>,
  getFolders: () => invoke('plugin:music:get-folders') as Promise<MusicFolder[]>,
  getTracks: (folderId: string) => invoke('plugin:music:get-tracks', folderId) as Promise<Track[]>,
  deleteFolder: (folderId: string) =>
    invoke('plugin:music:delete-folder', folderId) as Promise<void>,
  createFolder: (name: string, description?: string) =>
    invoke('plugin:music:create-folder', name, description) as Promise<MusicFolder>,
  updateFolderDescription: (folderId: string, description: string | null) =>
    invoke('plugin:music:update-folder-description', folderId, description) as Promise<void>,
  updateFolderCover: (folderId: string) =>
    invoke('plugin:music:update-folder-cover', folderId) as Promise<string | null>,
  saveFolderCover: (folderId: string, coverDataUrl: string | null) =>
    invoke('plugin:music:save-folder-cover', folderId, coverDataUrl) as Promise<void>,
  selectImage: () => invoke('plugin:music:select-image') as Promise<string | null>,
  updateFolder: (folderId: string, fields: { name?: string; description?: string | null }) =>
    invoke('plugin:music:update-folder', folderId, fields) as Promise<void>,
  addTracks: (folderId: string) =>
    invoke('plugin:music:add-tracks', folderId) as Promise<AddTracksResult | null>,
  updateTrack: (trackId: number, fields: { title?: string; artist?: string; album?: string }) =>
    invoke('plugin:music:update-track', trackId, fields) as Promise<void>,
  updateTrackCover: (trackId: number) =>
    invoke('plugin:music:update-track-cover', trackId) as Promise<string | null>,
  deleteTrack: (trackId: number) => invoke('plugin:music:delete-track', trackId) as Promise<void>,
  readFile: (filePath: string) =>
    invoke('plugin:music:read-file', filePath) as Promise<ArrayBuffer>,
  toggleLike: (trackId: number) => invoke('plugin:music:toggle-like', trackId) as Promise<boolean>,
  updateLastPlayed: (trackId: number) =>
    invoke('plugin:music:update-last-played', trackId) as Promise<void>,
  getLikedTracks: () => invoke('plugin:music:get-liked-tracks') as Promise<Track[]>,
  getRecentlyPlayed: () => invoke('plugin:music:get-recently-played') as Promise<Track[]>,
  /**
   * 监听来自 AI 对话的播放请求（主进程 → 渲染层事件通道），返回取消监听的函数。
   * 事件通道名经主进程 `ctx.registerEvent` 声明后才进 preload 白名单。
   */
  onMusicPlay: (callback: (data: MusicPlayRequest) => void): (() => void) =>
    window.api.plugin.on('plugin:music:play-track', (data) => callback(data as MusicPlayRequest))
}

export default musicApi
