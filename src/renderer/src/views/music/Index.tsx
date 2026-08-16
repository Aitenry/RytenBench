import React, { useState, useCallback, useEffect } from 'react'
import { theme, App } from 'antd'
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

const Index: React.FC = () => {
  const { message, modal } = App.useApp()
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
  const [editingFolder, setEditingFolder] = useState<MusicFolder | null>(null)

  const specialFolders: MusicFolder[] = [
    {
      id: RECENTLY_PLAYED_ID,
      path: '',
      name: '最近播放',
      description: '最近播放过的歌曲',
      track_count: 0,
      coverDataUrl: null,
      created_at: '',
      updated_at: ''
    },
    {
      id: LIKED_TRACKS_ID,
      path: '',
      name: '我喜欢',
      description: '收藏的歌曲',
      track_count: 0,
      coverDataUrl: null,
      created_at: '',
      updated_at: ''
    }
  ]

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
        // 只更新列表数据，不中断当前播放信息
        updatePlaylist(tracks, folder.id)
      } catch {
        message.error('加载曲目失败')
      }
    },
    [selectedFolderId, updatePlaylist, setSelectedFolderId]
  )

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      // 内置歌单不能删除
      if (folderId === RECENTLY_PLAYED_ID || folderId === LIKED_TRACKS_ID) return
      modal.confirm({
        title: '删除歌单',
        content: '确定要删除此歌单吗？',
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await window.api.music.deleteFolder(folderId)
            setFolders((prev) => prev.filter((f) => f.id !== folderId))
            if (selectedFolderId === folderId) {
              setSelectedFolderId(null)
              clearPlaylist()
            }
            message.success('歌单已删除')
          } catch {
            message.error('删除失败')
          }
        }
      })
    },
    [selectedFolderId, clearPlaylist, setSelectedFolderId, modal]
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
        message.error('操作失败')
      }
    },
    [selectedFolderId, playlist, updatePlaylist]
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
          let msg = `已添加 ${result.added.length} 首歌曲`
          if (result.skipped.length > 0) {
            msg += `，${result.skipped.length} 首已存在被跳过`
          }
          message.success(msg)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '添加失败'
        message.error(msg)
      }
    },
    [updatePlaylist, setSelectedFolderId]
  )

  const handleCreateFolder = useCallback(
    async (data: { name: string; description: string; coverDataUrl: string | null }) => {
      const folder = await window.api.music.createFolder(data.name, data.description || undefined)
      if (data.coverDataUrl) {
        await window.api.music.saveFolderCover(folder.id, data.coverDataUrl)
      }
      const updated = await window.api.music.getFolders()
      setFolders(updated)
      message.success('歌单已创建')
    },
    []
  )

  const handleEditFolder = useCallback((folder: MusicFolder) => {
    setEditingFolder(folder)
  }, [])

  const handleEditSaved = useCallback(async () => {
    const updated = await window.api.music.getFolders()
    setFolders(updated)
    message.success('歌单已更新')
  }, [])

  const selectedFolder: MusicFolder | undefined =
    selectedFolderId === RECENTLY_PLAYED_ID
      ? {
          id: RECENTLY_PLAYED_ID,
          path: '',
          name: '最近播放',
          description: '最近播放过的歌曲',
          track_count: playlist.length,
          coverDataUrl: null,
          created_at: '',
          updated_at: ''
        }
      : selectedFolderId === LIKED_TRACKS_ID
        ? {
            id: LIKED_TRACKS_ID,
            path: '',
            name: '我喜欢',
            description: '你收藏的歌曲',
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
      if (selectedFolderId === RECENTLY_PLAYED_ID || selectedFolderId === LIKED_TRACKS_ID) {
        removeFromPlaylist(index)
        return
      }

      try {
        await window.api.music.deleteTrack(Number(track.id))
        removeFromPlaylist(index)
        // 刷新侧边栏歌单计数
        const updatedFolders = await window.api.music.getFolders()
        setFolders(updatedFolders)
        message.success('已删除')
      } catch {
        message.error('删除失败')
      }
    },
    [playlist, selectedFolderId, removeFromPlaylist]
  )

  /** 重新加载当前歌单数据（手动刷新 / 工作区切换共用） */
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

  // 工作区切换：歌单列表与当前歌单内容均按新工作区重新加载
  useEffect(() => {
    const handleWorkspaceChanged = (): void => {
      window.api.music.getFolders().then(setFolders).catch(console.error)
      reloadCurrentPlaylist().catch(() => {
        // 原歌单在新工作区不存在时清空视图
        setSelectedFolderId(null)
        clearPlaylist()
      })
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [reloadCurrentPlaylist, clearPlaylist, setSelectedFolderId])

  const handleUpdateTrack = useCallback(async (): Promise<void> => {
    try {
      await reloadCurrentPlaylist()
    } catch {
      message.error('刷新曲目失败')
    }
  }, [reloadCurrentPlaylist])

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
