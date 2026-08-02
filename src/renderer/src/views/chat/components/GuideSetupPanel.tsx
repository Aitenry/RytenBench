import React from 'react'
import { RiArrowRightLine } from '@remixicon/react'

interface GuideSetupPanelProps {
  guideWorkspaceDone: boolean
  hasModels: boolean
  colorFillAlter: string
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  onWorkspaceSetup: () => void
  onModelSetup: () => void
}

const GuideSetupPanel: React.FC<GuideSetupPanelProps> = ({
  guideWorkspaceDone,
  hasModels,
  colorFillAlter,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  onWorkspaceSetup,
  onModelSetup
}) => {
  const itemBaseClass =
    'flex items-center justify-between p-4 rounded-lg mb-3 cursor-pointer hover:opacity-80 transition-opacity'

  return (
    <div className="flex-1 flex items-center justify-center">
      <div
        className="p-12 rounded-2xl text-center"
        style={{ maxWidth: 480, background: colorFillAlter }}
      >
        <h2 className="text-xl font-semibold m-0 mb-2" style={{ color: colorText }}>
          开始对话前，请先完成以下配置
        </h2>
        <p className="text-sm m-0 mb-8" style={{ color: colorTextSecondary }}>
          配置完成后即可开始使用 AI 对话功能
        </p>

        {/* 工作区 */}
        <div
          className={itemBaseClass}
          style={{
            background: guideWorkspaceDone ? 'rgba(82,196,26,0.08)' : 'rgba(255,77,79,0.08)',
            border: `1px solid ${
              guideWorkspaceDone ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'
            }`,
            cursor: guideWorkspaceDone ? 'default' : 'pointer'
          }}
          onClick={guideWorkspaceDone ? undefined : onWorkspaceSetup}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 32,
                height: 32,
                background: guideWorkspaceDone ? '#52c41a' : '#ff4d4f',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {guideWorkspaceDone ? '\u2713' : '1'}
            </span>
            <div className="text-left">
              <div className="text-sm font-medium" style={{ color: colorText }}>
                配置工作区
              </div>
              <div className="text-xs mt-0.5" style={{ color: colorTextTertiary }}>
                {guideWorkspaceDone ? '已配置' : '选择项目目录以创建新的工作区'}
              </div>
            </div>
          </div>
          {guideWorkspaceDone ? (
            <span
              className="flex-shrink-0 text-xs px-2 py-0.5 rounded"
              style={{ background: '#52c41a', color: '#fff' }}
            >
              已完成
            </span>
          ) : (
            <RiArrowRightLine
              size={18}
              className="flex-shrink-0"
              style={{ color: colorTextTertiary }}
            />
          )}
        </div>

        {/* 模型 */}
        <div
          className={itemBaseClass}
          style={{
            background: hasModels ? 'rgba(82,196,26,0.08)' : 'rgba(255,77,79,0.08)',
            border: `1px solid ${hasModels ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)'}`,
            cursor: hasModels ? 'default' : 'pointer'
          }}
          onClick={hasModels ? undefined : onModelSetup}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 32,
                height: 32,
                background: hasModels ? '#52c41a' : '#ff4d4f',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {hasModels ? '\u2713' : '2'}
            </span>
            <div className="text-left">
              <div className="text-sm font-medium" style={{ color: colorText }}>
                配置模型
              </div>
              <div className="text-xs mt-0.5" style={{ color: colorTextTertiary }}>
                {hasModels ? '已配置' : '添加并启用至少一个模型供应商'}
              </div>
            </div>
          </div>
          {hasModels ? (
            <span
              className="flex-shrink-0 text-xs px-2 py-0.5 rounded"
              style={{ background: '#52c41a', color: '#fff' }}
            >
              已完成
            </span>
          ) : (
            <RiArrowRightLine
              size={18}
              className="flex-shrink-0"
              style={{ color: colorTextTertiary }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default GuideSetupPanel
