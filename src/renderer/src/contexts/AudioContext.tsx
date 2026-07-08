import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo
} from 'react'
import type { Track, RepeatMode } from '../types/music'
import { REPEAT_STRATEGIES } from '../types/music'

// ---- Split context: fast-changing progress vs everything else ----

interface AudioState {
  currentTrack: Track | null
  currentIndex: number
  playlist: Track[]
  isPlaying: boolean
  isBuffering: boolean
  duration: number
  volume: number
  repeatMode: RepeatMode
  selectedFolderId: string | null
}

interface AudioActions {
  play: (index: number) => void
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
  toggleRepeat: () => void
  setSelectedFolderId: (id: string | null) => void
  setPlaylist: (tracks: Track[], startIndex?: number) => void
  updatePlaylist: (tracks: Track[], folderId?: string) => void
  addToPlaylist: (tracks: Track[]) => void
  removeFromPlaylist: (index: number) => void
  clearPlaylist: () => void
  playTrack: (track: Track) => void
}

interface AudioProgress {
  progress: number
  duration: number
  isBuffering: boolean
}

const AudioStateContext = createContext<(AudioState & AudioActions) | null>(null)
const AudioProgressContext = createContext<AudioProgress | null>(null)

export const useAudioState = (): AudioState & AudioActions => {
  const ctx = useContext(AudioStateContext)
  if (!ctx) throw new Error('useAudioState must be used within AudioProvider')
  return ctx
}

export const useAudioProgress = (): AudioProgress => {
  const ctx = useContext(AudioProgressContext)
  if (!ctx) throw new Error('useAudioProgress must be used within AudioProvider')
  return ctx
}

/** Convenience hook — only use when you need BOTH state and progress */
export const useAudio = (): AudioState & AudioActions & AudioProgress => {
  return { ...useAudioState(), ...useAudioProgress() }
}

const MODE_ORDER: RepeatMode[] = ['all', 'one', 'shuffle']

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [playlist, setPlaylistState] = useState<Track[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  // Refs kept in sync with state for use in event handlers without stale closures
  const repeatModeRef = useRef(repeatMode)
  repeatModeRef.current = repeatMode
  const playlistRef = useRef(playlist)
  playlistRef.current = playlist
  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex
  const selectedFolderIdRef = useRef(selectedFolderId)
  selectedFolderIdRef.current = selectedFolderId
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const progressRef = useRef(progress)
  progressRef.current = progress
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  // 加载操作追踪：每次 loadAndPlay / src 变更递增，事件处理器仅响应最新一次加载
  const loadIdRef = useRef(0)
  // 标记：某个 loadId 对应的加载应当在 canplay 时自动播放
  // 0 表示没有待播放的加载
  const shouldPlayLoadIdRef = useRef(0)
  // 标记：上一次 play() 失败，需要在下次 canplay 时重试
  const pendingPlayRef = useRef(false)
  // 当前激活的 blob:// URL，用于切歌时释放上一条 URL 的内存
  const currentBlobUrlRef = useRef<string | null>(null)

  // 保留最后一次有效播放的曲目，切换歌单时播放栏信息不丢失
  const lastTrackRef = useRef<Track | null>(null)
  const lastFolderIdRef = useRef<string | null>(null)
  // 保留当前正在播放的曲目所属的歌单及索引，切换歌单后 onEnded 仍能正确切歌
  const lastPlaylistRef = useRef<Track[]>([])
  const lastIndexRef = useRef<number>(-1)

  const getMimeType = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const types: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      aac: 'audio/aac',
      m4a: 'audio/mp4',
      wma: 'audio/x-ms-wma',
      ape: 'audio/ape',
      wv: 'audio/wavpack'
    }
    return types[ext || ''] || 'audio/mpeg'
  }

  /** IPC 读取文件 → ArrayBuffer → Blob → blob:// URL */
  const fileToBlobUrl = useCallback(async (filePath: string): Promise<string | null> => {
    try {
      const buf = await window.api.music.readFile(filePath)
      const blob = new Blob([buf], { type: getMimeType(filePath) })
      return URL.createObjectURL(blob)
    } catch (err) {
      console.error('[AudioContext] Failed to load file:', err)
      return null
    }
  }, [])

  const currentTrack =
    currentIndex >= 0 && currentIndex < playlist.length ? playlist[currentIndex] : null
  const displayTrack =
    currentTrack?.id === lastTrackRef.current?.id ? currentTrack : lastTrackRef.current

  /**
   * 尝试播放。仅在 canplay 事件（数据已就绪）或 resume/seek 场景调用。
   * 失败时设置 pendingPlay 标记以便下次 canplay 重试。
   */
  const tryPlay = useCallback((loadId: number) => {
    const audio = audioRef.current
    if (!audio || !audio.src) return

    audio
      .play()
      .then(() => {
        if (loadIdRef.current === loadId) {
          setIsPlaying(true)
          setIsBuffering(false)
          pendingPlayRef.current = false
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          if (loadIdRef.current === loadId) {
            pendingPlayRef.current = true
          }
          return
        }
        console.error('[AudioContext] play() failed:', err)
        if (loadIdRef.current === loadId) {
          pendingPlayRef.current = true
        }
      })
  }, [])

  // ---- Audio element & event handlers (registered once) ----
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const onTimeUpdate = (): void => {
      setProgress(audio.currentTime)
    }

    const onLoadedMetadata = (): void => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }

    const onPlay = (): void => {
      setIsPlaying(true)
      setIsBuffering(false)
    }

    const onPause = (): void => {
      if (audio.seeking) return
      setIsPlaying(false)
    }

    /**
     * canplay: 浏览器已缓冲足够数据可以开始播放。
     * 这是启动播放的最佳时机 — 此时 play() 不会因数据不足而失败或秒停。
     * 但 seeking 期间不干预，由 seeked 事件专职处理播放恢复，
     * 否则 play() 会干扰 seek 操作导致 PIPELINE_ERROR_READ。
     */
    const onCanPlay = (): void => {
      setIsBuffering(false)

      // seeking 期间不干预，避免干扰浏览器内部 seek 流程
      if (audio.seeking) return

      // 优先级1: 有等待自动播放的加载（loadAndPlay / onEnded 设置的）
      const shouldPlayId = shouldPlayLoadIdRef.current
      if (shouldPlayId > 0 && shouldPlayId === loadIdRef.current) {
        shouldPlayLoadIdRef.current = 0
        tryPlay(loadIdRef.current)
        return
      }

      // 优先级2: 上次 play() 失败了，重试
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false
        tryPlay(loadIdRef.current)
        return
      }

      // 优先级3: 理应处于播放状态（大文件缓冲耗尽后浏览器可能未自动恢复）
      if (isPlayingRef.current) {
        tryPlay(loadIdRef.current)
      }
    }

    const onCanPlayThrough = (): void => {
      setIsBuffering(false)
    }

    const onWaiting = (): void => {
      if (!audio.seeking) {
        setIsBuffering(true)
      }
    }

    const onStalled = (): void => {
      console.warn('[AudioContext] Media stalled — waiting for data...')
      setIsBuffering(true)
    }

    const onSuspend = (): void => {
      // 浏览器暂停缓冲，通常会自行恢复
    }

    const onError = (): void => {
      const err = audio.error
      console.error('[AudioContext] Media error:', err?.code, err?.message)
      setIsPlaying(false)
      setIsBuffering(false)
      shouldPlayLoadIdRef.current = 0
      pendingPlayRef.current = false
    }

    /**
     * onEnded: 当前曲目播放完毕，自动切到下一首。
     * 异步加载文件 → blob:// URL，canplay 时触发播放。
     */
    const onEnded = (): void => {
      const mode = repeatModeRef.current
      let pl = playlistRef.current
      let idx = currentIndexRef.current
      let folderId = selectedFolderIdRef.current
      let isFallback = false

      // 如果当前播放的歌单与正在查看的歌单不同（用户在此期间切换了歌单），
      // 则使用原始歌单继续自动切歌，实现歌单隔离
      const lastTrack = lastTrackRef.current
      if (lastTrack && lastFolderIdRef.current !== selectedFolderIdRef.current) {
        const origPl = lastPlaylistRef.current
        if (origPl.length === 0) {
          audio.pause()
          setCurrentIndex(-1)
          setProgress(0)
          setIsPlaying(false)
          return
        }
        pl = origPl
        idx = lastIndexRef.current
        folderId = lastFolderIdRef.current
        isFallback = true
      }

      if (pl.length === 0) return

      const strategy = REPEAT_STRATEGIES[mode]
      const nextIdx = strategy.getNext(idx, pl.length)

      if (nextIdx >= 0 && nextIdx < pl.length) {
        const a = audioRef.current
        if (!a) return
        a.pause()
        const track = pl[nextIdx]
        lastTrackRef.current = track
        lastFolderIdRef.current = folderId
        lastPlaylistRef.current = [...pl]
        lastIndexRef.current = nextIdx

        const ldId = ++loadIdRef.current
        shouldPlayLoadIdRef.current = ldId
        // 使用后备歌单时，不更新 currentIndex（当前视图的歌单不匹配）
        if (!isFallback) setCurrentIndex(nextIdx)
        setProgress(0)
        setDuration(0)
        setIsBuffering(true)

        fileToBlobUrl(track.filePath).then((blobUrl) => {
          if (loadIdRef.current !== ldId) {
            if (blobUrl) URL.revokeObjectURL(blobUrl)
            return
          }
          if (!blobUrl) {
            setIsBuffering(false)
            shouldPlayLoadIdRef.current = 0
            return
          }
          const a = audioRef.current
          if (!a) return
          if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current)
          currentBlobUrlRef.current = blobUrl
          a.src = blobUrl
          a.volume = volumeRef.current
          // play() 延迟到 canplay 事件
        })
      } else {
        audio.pause()
        setCurrentIndex(-1)
        setProgress(0)
        setIsPlaying(false)
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('canplaythrough', onCanPlayThrough)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('suspend', onSuspend)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('canplaythrough', onCanPlayThrough)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('suspend', onSuspend)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.src = ''
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current)
        currentBlobUrlRef.current = null
      }
    }
  }, [tryPlay, fileToBlobUrl])

  /**
   * loadAndPlay: 异步读取文件 → blob:// URL → 设置 audio.src。
   * Blob URL 由 Chromium 原生管理，支持完美的 seek/Range/缓存，无需自定义协议。
   */
  const loadAndPlay = useCallback(
    async (index: number) => {
      const audio = audioRef.current
      const pl = playlistRef.current
      if (!audio || index < 0 || index >= pl.length) return

      const track = pl[index]
      lastTrackRef.current = track
      lastFolderIdRef.current = selectedFolderIdRef.current
      lastPlaylistRef.current = [...pl]
      lastIndexRef.current = index

      const ldId = ++loadIdRef.current
      shouldPlayLoadIdRef.current = ldId
      pendingPlayRef.current = false

      audio.pause()
      setCurrentIndex(index)
      setProgress(0)
      setDuration(0)
      setIsBuffering(true)

      const blobUrl = await fileToBlobUrl(track.filePath)
      // 如果加载期间切了其他歌，放弃本次结果
      if (loadIdRef.current !== ldId) {
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        return
      }

      if (!blobUrl) {
        setIsBuffering(false)
        shouldPlayLoadIdRef.current = 0
        return
      }

      // 记录播放时间
      const trackIdNum = Number(track.id)
      if (!isNaN(trackIdNum)) {
        window.api.music.updateLastPlayed(trackIdNum).catch(() => {})
      }

      // 释放旧的 blob URL
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current)
      }
      currentBlobUrlRef.current = blobUrl

      audio.src = blobUrl
      audio.volume = volumeRef.current
      // play() 延迟到 canplay 事件触发
    },
    [fileToBlobUrl]
  )

  // ---- Actions ----
  const play = useCallback(
    (index: number) => {
      if (index === currentIndex && audioRef.current && playlistRef.current[index]) {
        // 同一首歌：已播放则忽略，已暂停则直接恢复（src 未变，canplay 不会触发）
        if (isPlayingRef.current) return
        const ldId = ++loadIdRef.current
        shouldPlayLoadIdRef.current = 0
        pendingPlayRef.current = false
        tryPlay(ldId)
        return
      }
      loadAndPlay(index)
    },
    [currentIndex, loadAndPlay, tryPlay]
  )

  const pause = useCallback(() => {
    shouldPlayLoadIdRef.current = 0
    pendingPlayRef.current = false
    audioRef.current?.pause()
  }, [])

  const resume = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return
    const ldId = ++loadIdRef.current
    shouldPlayLoadIdRef.current = 0
    pendingPlayRef.current = false
    tryPlay(ldId)
  }, [tryPlay])

  const next = useCallback(() => {
    if (playlist.length === 0) return
    const strategy = REPEAT_STRATEGIES[repeatMode]
    const nextIdx = strategy.getNext(currentIndex, playlist.length)
    if (nextIdx >= 0) loadAndPlay(nextIdx)
  }, [playlist, repeatMode, currentIndex, loadAndPlay])

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current
      if (!audio) return

      const wasPlaying = isPlayingRef.current
      audio.currentTime = time
      setProgress(time)

      // seek 后若之前在播放，需确保继续播放
      if (wasPlaying) {
        const ldId = ++loadIdRef.current
        shouldPlayLoadIdRef.current = 0
        pendingPlayRef.current = false
        const onSeeked = (): void => {
          audio.removeEventListener('seeked', onSeeked)
          if (loadIdRef.current === ldId) {
            tryPlay(ldId)
          }
        }
        audio.addEventListener('seeked', onSeeked, { once: true })
      }
    },
    [tryPlay]
  )

  const prev = useCallback(() => {
    if (playlist.length === 0) return
    if (progressRef.current > 3 && audioRef.current) {
      seek(0)
      return
    }
    const prevIdx = currentIndex - 1
    loadAndPlay(prevIdx >= 0 ? prevIdx : playlist.length - 1)
  }, [playlist, currentIndex, loadAndPlay, seek])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    if (audioRef.current) audioRef.current.volume = v
  }, [])

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const idx = MODE_ORDER.indexOf(prev)
      return MODE_ORDER[(idx + 1) % MODE_ORDER.length]
    })
  }, [])

  const setPlaylist = useCallback(
    (tracks: Track[], startIndex?: number) => {
      setPlaylistState(tracks)
      if (startIndex !== undefined && startIndex >= 0 && startIndex < tracks.length) {
        loadAndPlay(startIndex)
      } else {
        setCurrentIndex(-1)
      }
    },
    [loadAndPlay]
  )

  const updatePlaylist = useCallback((tracks: Track[], folderId?: string) => {
    setPlaylistState(tracks)
    if (folderId !== undefined) {
      if (folderId === lastFolderIdRef.current && lastTrackRef.current) {
        const idx = tracks.findIndex((t) => t.id === lastTrackRef.current!.id)
        if (idx >= 0) setCurrentIndex(idx)
      } else {
        setCurrentIndex(-1)
      }
    }
  }, [])

  const addToPlaylist = useCallback((tracks: Track[]) => {
    setPlaylistState((prev) => [...prev, ...tracks])
  }, [])

  const removeFromPlaylist = useCallback(
    (index: number) => {
      setPlaylistState((prev) => {
        const next = [...prev]
        next.splice(index, 1)
        return next
      })
      if (index === currentIndex) {
        audioRef.current?.pause()
        shouldPlayLoadIdRef.current = 0
        pendingPlayRef.current = false
        setCurrentIndex(-1)
      } else if (index < currentIndex) {
        setCurrentIndex((prev) => prev - 1)
      }
    },
    [currentIndex]
  )

  const clearPlaylist = useCallback(() => {
    audioRef.current?.pause()
    shouldPlayLoadIdRef.current = 0
    pendingPlayRef.current = false
    setPlaylistState([])
    setCurrentIndex(-1)
    setProgress(0)
    setDuration(0)
    setIsBuffering(false)
  }, [])

  const playTrack = useCallback(
    (track: Track) => {
      const existingIdx = playlist.findIndex((t) => t.id === track.id)
      if (existingIdx >= 0) {
        play(existingIdx)
      } else {
        setPlaylistState((prev) => {
          const newList = [...prev, track]
          setTimeout(() => loadAndPlay(newList.length - 1), 0)
          return newList
        })
      }
    },
    [playlist, play, loadAndPlay]
  )

  // ---- Two separate context values ----
  const stateValue = useMemo<AudioState & AudioActions>(
    () => ({
      currentTrack: displayTrack,
      currentIndex,
      playlist,
      isPlaying,
      isBuffering,
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
      setPlaylist,
      updatePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      clearPlaylist,
      playTrack
    }),
    [
      displayTrack,
      currentIndex,
      playlist,
      isPlaying,
      isBuffering,
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
      setPlaylist,
      updatePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      clearPlaylist,
      playTrack
    ]
  )

  const progressValue = useMemo<AudioProgress>(
    () => ({ progress, duration, isBuffering }),
    [progress, duration, isBuffering]
  )

  return (
    <AudioStateContext.Provider value={stateValue}>
      <AudioProgressContext.Provider value={progressValue}>
        {children}
      </AudioProgressContext.Provider>
    </AudioStateContext.Provider>
  )
}
