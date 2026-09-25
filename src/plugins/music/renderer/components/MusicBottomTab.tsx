import React from 'react'
import { theme } from 'antd'
import { RiMusicLine } from '@remixicon/react'
import { useTranslation } from '@renderer/i18n'
import { formatTime } from '@renderer/utils/formatTime'
import { useAudioProgress, useAudioState } from '../audio/context'

/**
 * 底栏（外壳插槽 `bottomBar`）里音乐条目的标题行。
 *
 * 由 music 插件经 `ctx.use('bottomBar').register({ Tab: MusicBottomTab, ... })` 注册；
 * 外壳只负责在轮播到该条目时渲染它，不知道音乐的任何状态。
 */
const MusicBottomTab: React.FC = () => {
  const { currentTrack } = useAudioState()
  const { progress } = useAudioProgress()
  const { t } = useTranslation()
  const {
    token: { colorTextSecondary }
  } = theme.useToken()

  return (
    <span className="flex items-center gap-1.5">
      <RiMusicLine size={14} />
      {currentTrack?.title || t('shell.bottomBar.music')}
      {currentTrack && <span style={{ color: colorTextSecondary }}>{formatTime(progress)}</span>}
    </span>
  )
}

export default MusicBottomTab
