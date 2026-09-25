import React from 'react'
import { Button, Space, Tooltip, theme } from 'antd'
import { RiListCheck2, RiBarChartHorizontalLine, RiAddLine } from '@remixicon/react'
import { useTranslation } from '@renderer/i18n'

interface Props {
  viewMode: 'list' | 'gantt'
  onViewModeChange: (mode: 'list' | 'gantt') => void
  onAddTask: () => void
}

const Toolbar: React.FC<Props> = ({ viewMode, onViewModeChange, onAddTask }) => {
  const { t } = useTranslation()
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
      className="flex items-center px-2 shrink-0"
      style={{
        height: 36,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer
      }}
    >
      <Space size={0}>
        <Tooltip title={t('planner.toolbar.listView')}>
          <Button
            type={viewMode === 'list' ? 'primary' : 'text'}
            size="small"
            icon={<RiListCheck2 size={16} />}
            aria-label={t('planner.toolbar.listView')}
            style={btnStyle}
            onClick={() => onViewModeChange('list')}
          />
        </Tooltip>
        <Tooltip title={t('planner.toolbar.ganttView')}>
          <Button
            type={viewMode === 'gantt' ? 'primary' : 'text'}
            size="small"
            icon={<RiBarChartHorizontalLine size={16} />}
            aria-label={t('planner.toolbar.ganttView')}
            style={btnStyle}
            onClick={() => onViewModeChange('gantt')}
          />
        </Tooltip>
      </Space>

      <div className="flex-1" />

      <Tooltip title={t('planner.toolbar.newProject')}>
        <Button
          type="primary"
          size="small"
          icon={<RiAddLine size={16} />}
          aria-label={t('planner.toolbar.newProject')}
          style={btnStyle}
          onClick={onAddTask}
        />
      </Tooltip>
    </div>
  )
}

export default Toolbar
