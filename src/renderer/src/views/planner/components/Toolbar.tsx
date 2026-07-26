import React from 'react'
import { Button, Space, Tooltip, theme } from 'antd'
import { RiListCheck2, RiBarChartHorizontalLine, RiAddLine } from '@remixicon/react'

interface Props {
  viewMode: 'list' | 'gantt'
  onViewModeChange: (mode: 'list' | 'gantt') => void
  onAddTask: () => void
}

const Toolbar: React.FC<Props> = ({ viewMode, onViewModeChange, onAddTask }) => {
  const { token } = theme.useToken()
  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    padding: '4px 10px'
  }

  return (
    <div
      className="flex items-center px-3 shrink-0"
      style={{
        height: 36,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer
      }}
    >
      <Space size={0}>
        <Tooltip title="列表视图">
          <Button
            type={viewMode === 'list' ? 'primary' : 'text'}
            size="small"
            icon={<RiListCheck2 size={16} />}
            style={btnStyle}
            onClick={() => onViewModeChange('list')}
          />
        </Tooltip>
        <Tooltip title="甘特图视图">
          <Button
            type={viewMode === 'gantt' ? 'primary' : 'text'}
            size="small"
            icon={<RiBarChartHorizontalLine size={16} />}
            style={btnStyle}
            onClick={() => onViewModeChange('gantt')}
          />
        </Tooltip>
      </Space>

      <div className="flex-1" />

      <Tooltip title="新建项目">
        <Button
          type="primary"
          size="small"
          icon={<RiAddLine size={16} />}
          style={btnStyle}
          onClick={onAddTask}
        />
      </Tooltip>
    </div>
  )
}

export default Toolbar
