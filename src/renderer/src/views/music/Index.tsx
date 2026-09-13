import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { theme, App } from 'antd'
import { useTranslation, Trans } from '@renderer/i18n'
import { useAudioState } from '../../contexts/AudioContext'
import type { MusicFolder, Track } from '../../types/music'
import MusicSidebar from './components/MusicSidebar'
import NowPlaying from './components/NowPlaying'
import PlaylistTable from './components/PlaylistTable'
import PlayerControls from './components/PlayerControls'
import CreatePlaylistModal from './components/CreatePlaylistModal'
import EditPlaylistModal from './components/EditPlaylistModal'

const RECENTLY_PLAYED_ID = '__recent__'
const LIKED_TRACKS_ID = '__liked__'

const MONO_FONT = "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace"

/** 内置歌单的行内文案（模块级只存词条键，渲染时在组件内 t() 求值） */
const T_RECENTLY_PLAYED_NAME = 'music.playlist.recentlyPlayedName' as const
const T_RECENTLY_PLAYED_DESC = 'music.playlist.recentlyPlayedDescription' as const
const T_LIKED_NAME = 'music.playlist.likedName' as const
const T_LIKED_DESC = 'music.playlist.likedDescription' as const

const Index: React.FC = () => {
  const { message, modal } = App.useApp()
  const { t } = useTranslation()
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const {
    currentTrack,
    currentIndex,
    playlist,
    isPlaying,
    duration,
    volume,
    repeatMode,
    selectedFolderId,
    play,
    pause,
    resume,
    next,
    prev,
    seek,
    setVolume,
    toggleRepeat,
    setSelectedFolderId,
    updatePlaylist,
    removeFromPlaylist,
    clearPlaylist
  } = useAudioState()

  const [folders, setFolders] = useState<MusicFolder[]>([])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  /** 当前选中歌单的实时引用（异步响应守卫用） */
  const selectedFolderIdRef = useRef(selectedFolderId)
  selectedFolderIdRef.current = selectedFolderId
  const [editingFolder, setEditingFolder] = useState<MusicFolder | null>(null)

  const specialFolders: MusicFolder[] = useMemo(
    () => [
      {
        id: RECENTLY_PLAYED_ID,
        path: '',
        name: t(T_RECENTLY_PLAYED_NAME),
        description: t(T_RECENTLY_PLAYED_DESC),
        track_count: 0,
        coverDataUrl: null,
        created_at: '',
        updated_at: ''
      },
      {
        id: LIKED_TRACKS_ID,
        path: '',
        name: t(T_LIKED_NAME),
        description: t(T_LIKED_DESC),
        track_count: 0,
        coverDataUrl: null,
        created_at: '',
        updated_at: ''
      }
    ],
    [t]
  )

  useEffect(() => {
    window.api.music.getFolders().then(setFolders).catch(console.error)
  }, [])

  const handleSelectFolder = useCallback(
    async (folder: MusicFolder) => {
      // 已选中的歌单不重复加载
      if (folder.id === selectedFolderId) return
      setSelectedFolderId(folder.id)
      try {
        let tracks: Track[] = []
        if (folder.id === RECENTLY_PLAYED_ID) {
          tracks = await window.api.music.getRecentlyPlayed()
        } else if (folder.id === LIKED_TRACKS_ID) {
          tracks = await window.api.music.getLikedTracks()
        } else {
          tracks = await window.api.music.getTracks(folder.id)
        }
        // 修复：快速连续切换歌单时,旧请求晚到会把旧列表写进当前 state
        //（列表与侧栏高亮不一致,且同 id 重复点击被提前 return 无法靠再点纠正）
        if (folder.id !== selectedFolderIdRef.current) return
        // 只更新列表数据，不中断当前播放信息
        updatePlaylist(tracks, folder.id)
      } catch {
        message.error(t('music.playlist.loadTracksFailed'))
      }
    },
    [selectedFolderId, updatePlaylist, setSelectedFolderId, message, t]
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      // 内置歌单不能删除
      if (folderId === RECENTLY_PLAYED_ID || folderId === LIKED_TRACKS_ID) return
      modal.confirm({
        title: t('music.playlist.deleteTitle'),
        content: t('music.playlist.deleteConfirm'),
        okText: t('common.action.delete'),
        cancelText: t('common.action.cancel'),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await window.api.music.deleteFolder(folderId)
            setFolders((prev) => prev.filter((f) => f.id !== folderId))
            if (selectedFolderId === folderId) {
              setSelectedFolderId(null)
              clearPlaylist()
            }
            message.success(t('common.action.deleteSuccess'))
          } catch {
            message.error(t('common.action.deleteFailed'))
          }
        }
      })
    },
    [selectedFolderId, clearPlaylist, setSelectedFolderId, modal, message, t]
  )

  /** 切换收藏状态 */
  const handleToggleLike = useCallback(
    async (trackId: string) => {
      const trackIdNum = Number(trackId)
      if (isNaN(trackIdNum)) return
      try {
        const newLiked = await window.api.music.toggleLike(trackIdNum)
        // 更新当前播放列表中的 track（不改变播放状态）
        const updated = playlist.map((t: Track) =>
          t.id === trackId ? { ...t, liked: newLiked } : t
        )
        updatePlaylist(updated)
        // 如果正在查看「我喜欢」歌单且取消收藏了，刷新列表
        if (selectedFolderId === LIKED_TRACKS_ID && !newLiked) {
          const tracks = await window.api.music.getLikedTracks()
          updatePlaylist(tracks, LIKED_TRACKS_ID)
        }
      } catch {
        message.error(t('common.message.operationFailed'))
      }
    },
    [selectedFolderId, playlist, updatePlaylist, message, t]
  )

  const handleAddTracks = useCallback(
    async (folderId: string) => {
      // 内置歌单不支持添加歌曲
      if (folderId === RECENTLY_PLAYED_ID || folderId === LIKED_TRACKS_ID) return
      try {
        const result = await window.api.music.addTracks(folderId)
        if (result) {
          const tracks = await window.api.music.getTracks(folderId)
          const updatedFolders = await window.api.music.getFolders()
          setFolders(updatedFolders)
          // 仅更新列表不中断播放
          updatePlaylist(tracks, folderId)
          setSelectedFolderId(folderId)
          let msg: React.ReactNode = (
            <Trans
              i18nKey="music.playlist.addedCount"
              count={result.added.length}
              components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
            />
          )
          if (result.skipped.length > 0) {
            msg = (
              <>
                {msg}
                <Trans
                  i18nKey="music.playlist.skippedCount"
                  count={result.skipped.length}
                  components={{ mono: <span style={{ fontFamily: MONO_FONT }} /> }}
                />
              </>
            )
          }
          message.success(msg)
        }
      } catch (err: unknown) {
        // 后端错误信息原样透传（不翻译），无信息时回退到通用文案
        const msg = err instanceof Error ? err.message : t('common.action.createFailed')
        message.error(msg)
      }
    },
    [updatePlaylist, setSelectedFolderId, message, t]
  )

  const handleCreateFolder = useCallback(
    async (data: { name: string; description: string; coverDataUrl: string | null }) => {
      const folder = await window.api.music.createFolder(data.name, data.description || undefined)
      if (data.coverDataUrl) {
        await window.api.music.saveFolderCover(folder.id, data.coverDataUrl)
      }
      const updated = await window.api.music.getFolders()
      setFolders(updated)
      message.success(t('music.playlist.created'))
    },
    [message, t]
  )

  const handleEditFolder = useCallback((folder: MusicFolder) => {
    setEditingFolder(folder)
  }, [])

  const handleEditSaved = useCallback(async () => {
    const updated = await window.api.music.getFolders()
    setFolders(updated)
    message.success(t('music.playlist.updated'))
  }, [message, t])

  const selectedFolder: MusicFolder | undefined =
    selectedFolderId === RECENTLY_PLAYED_ID
      ? {
          id: RECENTLY_PLAYED_ID,
          path: '',
          name: t(T_RECENTLY_PLAYED_NAME),
          description: t(T_RECENTLY_PLAYED_DESC),
          track_count: playlist.length,
          coverDataUrl: null,
          created_at: '',
          updated_at: ''
        }
      : selectedFolderId === LIKED_TRACKS_ID
        ? {
            id: LIKED_TRACKS_ID,
            path: '',
            name: t(T_LIKED_NAME),
            description: t('music.playlist.likedDescriptionSelected'),
            track_count: playlist.length,
            coverDataUrl: null,
            created_at: '',
            updated_at: ''
          }
        : folders.find((f) => f.id === selectedFolderId)

  /** 删除歌曲：从磁盘删除文件并从数据库删除记录 */
  const handleRemoveTrack = useCallback(
    async (index: number) => {
      const track = playlist[index]
      if (!track) return

      // 内置歌单的歌曲不能从磁盘删除（不是真实歌单）
      if (selectedFolderId === LIKED_TRACKS_ID) {
        // 「我喜欢」移除 = 取消收藏并落库（修复：此前仅 splice 内存列表,
        // 切走再切回/重启即原样复现）
        await window.api.music.toggleLike(Number(track.id))
        removeFromPlaylist(index)
        message.success(t('music.track.unliked'))
        return
      }
      if (selectedFolderId === RECENTLY_PLAYED_ID) {
        removeFromPlaylist(index)
        return
      }

      try {
        await window.api.music.deleteTrack(Number(track.id))
        removeFromPlaylist(index)
        // 刷新侧边栏歌单计数
        const updatedFolders = await window.api.music.getFolders()
        setFolders(updatedFolders)
        message.success(t('common.action.deleteSuccess'))
      } catch {
        message.error(t('common.action.deleteFailed'))
      }
    },
    [playlist, selectedFolderId, removeFromPlaylist, message, t]
  )

  /** 重新加载当前歌单数据（手动刷新） */
  const reloadCurrentPlaylist = useCallback(async (): Promise<void> => {
    if (!selectedFolderId) return
    let tracks: Track[] = []
    if (selectedFolderId === RECENTLY_PLAYED_ID) {
      tracks = await window.api.music.getRecentlyPlayed()
    } else if (selectedFolderId === LIKED_TRACKS_ID) {
      tracks = await window.api.music.getLikedTracks()
    } else {
      tracks = await window.api.music.getTracks(selectedFolderId)
    }
    updatePlaylist(tracks, selectedFolderId)
  }, [selectedFolderId, updatePlaylist])

  const handleUpdateTrack = useCallback(async (): Promise<void> => {
    try {
      await reloadCurrentPlaylist()
    } catch {
      message.error(t('common.action.refreshFailed'))
    }
  }, [reloadCurrentPlaylist, message, t])

  return (
    <div className="h-full flex-1 flex flex-row gap-2.5">
      <MusicSidebar
        folders={folders}
        specialFolders={specialFolders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={handleSelectFolder}
        onAddTracks={handleAddTracks}
        onEditFolder={handleEditFolder}
        onDeleteFolder={handleDeleteFolder}
        onCreateClick={() => setCreateModalOpen(true)}
        colorBgContainer={colorBgContainer}
        borderRadiusLG={borderRadiusLG}
      />

      <main
        className="flex-1 flex flex-col rounded-lg overflow-hidden min-w-0"
        style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}
      >
        {playlist.length > 0 && <NowPlaying folder={selectedFolder ?? null} />}

        <PlaylistTable
          tracks={playlist}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          onPlay={play}
          onRemove={handleRemoveTrack}
          onUpdate={handleUpdateTrack}
          onToggleLike={handleToggleLike}
        />

        <PlayerControls
          currentTrack={currentTrack}
          duration={duration}
          volume={volume}
          isPlaying={isPlaying}
          repeatMode={repeatMode}
          liked={currentTrack?.liked ?? false}
          onSeek={seek}
          onVolumeChange={setVolume}
          onToggleRepeat={toggleRepeat}
          onPrev={prev}
          onNext={next}
          onPlayPause={() => (isPlaying ? pause() : currentTrack ? resume() : play(0))}
          onToggleLike={() => currentTrack && handleToggleLike(currentTrack.id)}
          onTogglePlaylist={() => {}}
        />
      </main>

      <CreatePlaylistModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreateFolder}
      />

      <EditPlaylistModal
        open={editingFolder !== null}
        folder={editingFolder}
        onClose={() => setEditingFolder(null)}
        onSaved={handleEditSaved}
      />
    </div>
  )
}

export default Index
