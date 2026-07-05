import React from 'react'
import { Button, Slider, Space, theme } from 'antd'
import { RiPlayLine, RiPauseLine, RiSkipLeftLine, RiSkipRightLine } from '@remixicon/react'
import { useAudioState, useAudioProgress } from '../contexts/AudioContext'
import { formatTime } from '../utils/formatTime'

const ProgressBar: React.FC = React.memo(function ProgressBar() {
  const { progress, duration } = useAudioProgress()
  const {
    token: { colorTextSecondary }
  } = theme.useToken()

  return (
    <div className="w-full mb-2">
      <Slider value={progress} max={duration || 1} tooltip={{ open: false }} />
      <div className="flex justify-between text-xs mt-1" style={{ color: colorTextSecondary }}>
        <span>{formatTime(progress)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
})

const MusicMiniPlayer: React.FC = () => {
  const { currentTrack, isPlaying, pause, resume, next, prev } = useAudioState()
  const {
    token: { colorTextSecondary }
  } = theme.useToken()

  return (
    <div className="flex flex-col items-center">
      <div className="text-sm1 truncate w-full text-center">
        {currentTrack?.title || '未在播放'}
      </div>
      <div
        className="text-xs mb-2 truncate w-full text-center"
        style={{ color: colorTextSecondary }}
      >
        {currentTrack?.artist || '--'}
      </div>
      <ProgressBar />
      <Space size={4}>
        <Button type="text" icon={<RiSkipLeftLine size={16} />} size="small" onClick={prev} />
        <Button
          type="text"
          icon={isPlaying ? <RiPauseLine size={16} /> : <RiPlayLine size={16} />}
          size="small"
          onClick={() => (isPlaying ? pause() : resume())}
        />
        <Button type="text" icon={<RiSkipRightLine size={16} />} size="small" onClick={next} />
      </Space>
    </div>
  )
}

export default React.memo(MusicMiniPlayer)
