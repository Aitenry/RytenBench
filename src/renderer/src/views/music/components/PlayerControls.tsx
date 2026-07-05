import React, { useState, useRef, useEffect } from 'react'
import { theme, Slider, Tooltip } from 'antd'
import {
  RiPlayFill,
  RiPauseFill,
  RiSkipLeftLine,
  RiSkipRightLine,
  RiShuffleLine,
  RiRepeatLine,
  RiRepeatOneLine,
  RiVolumeUpLine,
  RiVolumeMuteLine,
  RiHeartLine,
  RiHeartFill,
  RiPlayListLine,
  RiMoreLine,
  RiMusic2Line
} from '@remixicon/react'
import { useAudioProgress } from '../../../contexts/AudioContext'
import { formatTime } from '../../../utils/formatTime'
import { REPEAT_STRATEGIES } from '../../../types/music'
import type { RepeatMode, Track } from '../../../types/music'

interface Props {
  currentTrack: Track | null
  duration: number
  volume: number
  isPlaying: boolean
  repeatMode: RepeatMode
  liked: boolean
  onSeek: (v: number) => void
  onVolumeChange: (v: number) => void
  onToggleRepeat: () => void
  onPrev: () => void
  onNext: () => void
  onPlayPause: () => void
  onToggleLike: () => void
  onTogglePlaylist: () => void
}

const MODE_ICON: Record<RepeatMode, React.ReactNode> = {
  all: <RiRepeatLine size={20} />,
  one: <RiRepeatOneLine size={20} />,
  shuffle: <RiShuffleLine size={20} />
}

const MODE_LABEL: Record<RepeatMode, string> = {
  all: REPEAT_STRATEGIES.all.label,
  one: REPEAT_STRATEGIES.one.label,
  shuffle: REPEAT_STRATEGIES.shuffle.label
}

const PlayerControls: React.FC<Props> = ({
  currentTrack,
  duration: durationProp,
  volume,
  isPlaying,
  repeatMode,
  liked,
  onSeek,
  onVolumeChange,
  onToggleRepeat,
  onPrev,
  onNext,
  onPlayPause,
  onToggleLike,
  onTogglePlaylist
}) => {
  const { progress, duration, isBuffering } = useAudioProgress()
  const displayDuration = durationProp || duration

  const {
    token: {
      colorBgContainer,
      colorText,
      colorTextSecondary,
      colorTextTertiary,
      colorFillAlter,
      colorBorder,
      colorBorderSecondary
    }
  } = theme.useToken()

  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const sliderValue = isSeeking ? seekValue : progress

  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const volumeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false)
      }
    }
    if (showVolumeSlider) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showVolumeSlider])

  return (
    <div className="flex-shrink-0 border-t" style={{ borderColor: colorBorderSecondary }}>
      {/* 进度条 */}
      <div className="flex items-center gap-3 px-4 pt-2">
        <span
          className="text-xs w-9 text-right tabular-nums select-none"
          style={{ color: colorTextTertiary }}
        >
          {isBuffering ? (
            <span className="inline-block w-3 h-3 border-2 border-[#1677ff] border-t-transparent rounded-full animate-spin align-middle" />
          ) : (
            formatTime(progress)
          )}
        </span>
        <Slider
          className="flex-1"
          value={sliderValue}
          max={displayDuration || 1}
          onChange={(v) => {
            setIsSeeking(true)
            setSeekValue(v as number)
          }}
          onChangeComplete={(v) => {
            setIsSeeking(false)
            onSeek(v as number)
          }}
          tooltip={{ formatter: (v) => formatTime(v || 0) }}
          step={0.1}
          styles={{
            track: { background: isBuffering ? '#91caff' : '#1677ff' },
            rail: { background: colorBorderSecondary }
          }}
        />
        <span className="text-xs w-9 tabular-nums select-none" style={{ color: colorTextTertiary }}>
          {formatTime(displayDuration)}
        </span>
      </div>

      {/* 三段式主体 */}
      <div className="flex items-center justify-between px-4 py-2">
        {/* ===== 左侧 - 歌曲信息 ===== */}
        <div className="flex items-center gap-3 w-[280px] min-w-0">
          {/* 圆形封面 */}
          <div
            className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ background: colorFillAlter, border: `1px solid ${colorBorderSecondary}` }}
          >
            {currentTrack?.coverDataUrl ? (
              <img src={currentTrack.coverDataUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <RiMusic2Line size={20} style={{ color: colorTextTertiary }} />
            )}
          </div>
          {/* 歌曲信息 */}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate" style={{ color: colorText }}>
              {currentTrack?.title || '未播放'}
            </div>
            <div className="text-xs truncate" style={{ color: colorTextTertiary }}>
              {currentTrack?.artist || '--'}
            </div>
          </div>
          {/* 心形喜欢 */}
          <button onClick={onToggleLike} className="flex-shrink-0 transition-colors">
            {liked ? (
              <RiHeartFill size={18} style={{ color: '#1677ff' }} />
            ) : (
              <RiHeartLine size={18} style={{ color: colorTextSecondary }} />
            )}
          </button>
        </div>

        {/* ===== 中间 - 播放控制 ===== */}
        <div className="flex items-center gap-1">
          <ActionBtn
            onClick={onToggleRepeat}
            icon={MODE_ICON[repeatMode]}
            tooltip={MODE_LABEL[repeatMode]}
            colorDefault={colorTextSecondary}
            colorHover={colorText}
          />
          <ActionBtn
            onClick={onPrev}
            icon={<RiSkipLeftLine size={22} />}
            tooltip="上一曲"
            colorDefault={colorTextSecondary}
            colorHover={colorText}
          />
          {/* 蓝色圆形播放/暂停主按钮 */}
          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-10 h-10 rounded-full mx-1 transition-transform hover:scale-105 active:scale-95"
            style={{ background: '#1677ff' }}
          >
            {isPlaying ? (
              <RiPauseFill size={20} className="text-white" />
            ) : (
              <RiPlayFill size={20} className="text-white ml-0.5" />
            )}
          </button>
          <ActionBtn
            onClick={onNext}
            icon={<RiSkipRightLine size={22} />}
            tooltip="下一曲"
            colorDefault={colorTextSecondary}
            colorHover={colorText}
          />
          <ActionBtn
            onClick={onTogglePlaylist}
            icon={<RiPlayListLine size={20} />}
            tooltip="播放列表"
            colorDefault={colorTextSecondary}
            colorHover={colorText}
          />
        </div>

        {/* ===== 右侧 - 功能扩展 ===== */}
        <div className="flex items-center gap-2 w-[280px] justify-end">
          {/* 无损标识 */}
          <span className="text-[10px] text-[#1677ff] border border-[#1677ff]/20 rounded px-1.5 py-0.5 select-none leading-none">
            无损
          </span>
          <ActionBtn
            onClick={() => {}}
            icon={
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            }
            tooltip="添加到歌单"
            colorDefault={colorTextSecondary}
            colorHover={colorText}
          />
          {/* 歌词 */}
          <button
            onClick={() => {}}
            className="flex items-center justify-center w-9 h-9 rounded-full text-sm transition-colors select-none"
            style={{ color: colorTextSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colorText)}
            onMouseLeave={(e) => (e.currentTarget.style.color = colorTextSecondary)}
          >
            词
          </button>
          {/* 音量 */}
          <div ref={volumeRef} className="relative flex items-center">
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              className="flex items-center justify-center w-9 h-9 rounded-full transition-colors"
              style={{ color: colorTextSecondary }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colorText)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colorTextSecondary)}
            >
              {volume === 0 ? <RiVolumeMuteLine size={20} /> : <RiVolumeUpLine size={20} />}
            </button>
            {showVolumeSlider && (
              <div
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 rounded-lg p-3 shadow-xl"
                style={{ background: colorBgContainer, border: `1px solid ${colorBorder}` }}
              >
                <Slider
                  vertical
                  value={volume * 100}
                  onChange={(v) => onVolumeChange((v as number) / 100)}
                  tooltip={{ formatter: (v) => `${v}%` }}
                  step={1}
                  style={{ height: 100 }}
                  styles={{
                    track: { background: '#1677ff' },
                    rail: { background: colorBorderSecondary }
                  }}
                />
              </div>
            )}
          </div>
          {/* 更多 */}
          <ActionBtn
            onClick={() => {}}
            icon={<RiMoreLine size={20} />}
            tooltip="更多"
            colorDefault={colorTextSecondary}
            colorHover={colorText}
          />
        </div>
      </div>
    </div>
  )
}

/** Round action button */
const ActionBtn: React.FC<{
  onClick: () => void
  icon: React.ReactNode
  tooltip?: string
  active?: boolean
  className?: string
  colorDefault?: string
  colorHover?: string
}> = ({ onClick, icon, tooltip, active, className = '', colorDefault, colorHover }) => {
  const defaultColor = colorDefault ?? 'inherit'
  const hoverColor = colorHover ?? 'inherit'

  const btn = (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${className}`}
      style={{ color: active ? '#1677ff' : defaultColor }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = hoverColor
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = defaultColor
      }}
    >
      {icon}
    </button>
  )
  return tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn
}

export default PlayerControls
