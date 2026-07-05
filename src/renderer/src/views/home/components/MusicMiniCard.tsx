import React from 'react'
import { Card, Flex, Typography, Button, Slider, theme } from 'antd'
import {
  RiPlayCircleFill,
  RiPauseCircleFill,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiMusic2Line
} from '@remixicon/react'
import { useAudioState, useAudioProgress } from '../../../contexts/AudioContext'
import { formatTime } from '../../../utils/formatTime'

const { Title, Text } = Typography

/** Progress bar — isolated so only this tiny subtree re-renders on timeupdate */
const MusicProgressBar: React.FC = React.memo(function MusicProgressBar() {
  const { progress, duration } = useAudioProgress()
  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: '8px' }}>
        <Text style={{ fontSize: '12px' }}>{formatTime(progress)}</Text>
        <Text style={{ fontSize: '12px' }}>{formatTime(duration)}</Text>
      </Flex>
      <Slider
        value={progress}
        max={duration || 1}
        tooltip={{ formatter: null }}
        style={{ marginBottom: '12px' }}
        step={0.1}
      />
    </>
  )
})

const MusicMiniCard: React.FC = () => {
  const {
    token: { borderRadiusLG, colorFillAlter, colorTextTertiary }
  } = theme.useToken()

  const { currentTrack, isPlaying, play, pause, resume, next, prev } = useAudioState()

  return (
    <Card
      className="flex-1"
      style={{
        background: colorFillAlter,
        borderRadius: borderRadiusLG,
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '0'
      }}
    >
      <Flex align="center" gap="middle" style={{ marginBottom: '12px' }}>
        {currentTrack?.coverDataUrl ? (
          <img
            src={currentTrack.coverDataUrl}
            alt="Cover"
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '8px',
              objectFit: 'cover'
            }}
          />
        ) : (
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '8px',
              background: colorFillAlter,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <RiMusic2Line size={24} style={{ color: colorTextTertiary }} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <Title level={5} style={{ margin: 0 }} ellipsis>
            {currentTrack?.title || '未播放'}
          </Title>
          <Text type="secondary" style={{ fontSize: '12px' }} ellipsis>
            {currentTrack?.artist || '--'}
          </Text>
        </div>
      </Flex>
      <MusicProgressBar />
      <Flex justify="center" gap="large">
        <Button
          shape="circle"
          icon={<RiSkipBackFill size={15} />}
          size="small"
          type="text"
          onClick={prev}
        />
        <Button
          shape="circle"
          onClick={() => (isPlaying ? pause() : currentTrack ? resume() : play(0))}
          icon={isPlaying ? <RiPauseCircleFill size={15} /> : <RiPlayCircleFill size={15} />}
          size="small"
          type="text"
        />
        <Button
          shape="circle"
          icon={<RiSkipForwardFill size={15} />}
          size="small"
          type="text"
          onClick={next}
        />
      </Flex>
    </Card>
  )
}

export default React.memo(MusicMiniCard)
