import React from 'react'
import { theme } from 'antd'
import { RiMusic2Line, RiHistoryLine, RiHeartLine } from '@remixicon/react'
import type { NowPlayingProps } from '@renderer/types/components'

const RECENTLY_PLAYED_ID = '__recent__'
const LIKED_TRACKS_ID = '__liked__'

const NowPlaying: React.FC<NowPlayingProps> = ({ folder }) => {
  const {
    token: {
      colorFillAlter,
      colorText,
      colorTextSecondary,
      colorTextTertiary,
      colorBorderSecondary
    }
  } = theme.useToken()

  const iconStyle = { color: colorTextTertiary }

  const SPECIAL_ICONS: Record<string, React.ReactNode> = {
    [RECENTLY_PLAYED_ID]: <RiHistoryLine size={40} style={iconStyle} />,
    [LIKED_TRACKS_ID]: <RiHeartLine size={40} style={iconStyle} />
  }

  const defaultIcon =
    folder && SPECIAL_ICONS[folder.id] ? (
      SPECIAL_ICONS[folder.id]
    ) : (
      <RiMusic2Line size={40} style={iconStyle} />
    )

  return (
    <div
      className="flex items-center gap-4 px-6 py-4 border-b"
      style={{ borderColor: colorBorderSecondary }}
    >
      <div
        className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center shadow-md"
        style={{ background: colorFillAlter }}
      >
        {folder?.coverDataUrl ? (
          <img src={folder.coverDataUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          defaultIcon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold truncate" style={{ color: colorText }}>
          {folder?.name || '未选择歌单'}
        </h2>
        <p className="text-sm truncate" style={{ color: colorTextSecondary }}>
          {folder?.description || '暂无描述'}
        </p>
        {folder && (
          <p className="text-xs mt-1" style={{ color: colorTextTertiary }}>
            {folder.track_count} 首
          </p>
        )}
      </div>
    </div>
  )
}

export default NowPlaying
