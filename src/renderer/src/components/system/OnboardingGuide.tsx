import React, { useState } from 'react'
import { theme, Button } from 'antd'
import { RiArrowRightLine, RiCheckLine, RiFolderOpenLine, RiRobot2Line } from '@remixicon/react'
import { useMessage } from '@renderer/hooks/useMessage'
import type { Window } from '../../../resource/types/window'

interface OnboardingGuideProps {
  workspaceDone: boolean
  modelsDone: boolean
  onModelSetup: () => void
}

/**
 * 全局首次启动引导：应用打开后检查工作区与模型配置，
 * 任一缺失时整页展示引导，配置完成后才放行进入各功能。
 */
const OnboardingGuide: React.FC<OnboardingGuideProps> = ({
  workspaceDone,
  modelsDone,
  onModelSetup
}) => {
  const { token } = theme.useToken()
  const { viewMessage } = useMessage()
  const [creating, setCreating] = useState(false)

  /* 选择文件夹 → 以目录名创建工作区并激活 */
  const handleWorkspaceSetup = async (): Promise<void> => {
    try {
      const win = window as unknown as Window
      const dir = await win.api.chat.selectWorkspace()
      if (!dir) return
      const name =
        dir
          .replace(/[/\\]$/, '')
          .split(/[/\\]/)
          .pop() || dir
      setCreating(true)
      const id = await win.api.chat.createWorkspace(name, dir)
      await win.api.systemSettings.update({
        chat: {
          workspacePath: dir,
          activeWorkspaceId: id
        } as Parameters<typeof win.api.systemSettings.update>[0]['chat']
      })
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }))
      viewMessage('onboarding-ws-done', 'success', `工作区「${name}」已创建`)
    } catch (err) {
      console.error('Failed to setup workspace:', err)
      viewMessage('onboarding-ws-error', 'error', '创建工作区失败，请重试')
    } finally {
      setCreating(false)
    }
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 12,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorBgContainer
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: token.colorBgLayout,
        overflowY: 'auto'
      }}
      className="custom-scrollbar"
    >
      <div style={{ width: 460, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 14px',
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: token.colorPrimaryBg,
              color: token.colorPrimary,
              fontSize: 26
            }}
          >
            <RiRobot2Line size={26} />
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: token.colorText }}>
            欢迎使用 RytenBench
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: token.colorTextSecondary }}>
            开始使用前，请完成以下两项配置
          </p>
        </div>

        {/* ① 工作区 */}
        <div style={{ ...itemStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                background: workspaceDone ? token.colorSuccess : token.colorError,
                color: '#fff'
              }}
            >
              {workspaceDone ? <RiCheckLine size={16} /> : '1'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: token.colorText }}>
                配置工作区
              </div>
              <div style={{ fontSize: 12, marginTop: 2, color: token.colorTextTertiary }}>
                {workspaceDone
                  ? '工作区已就绪，所有内容按工作区隔离'
                  : '选择一个文件夹作为工作区，文档、待办、聊天等内容都归属于它'}
              </div>
            </div>
          </div>
          {workspaceDone ? (
            <span
              style={{
                flexShrink: 0,
                fontSize: 12,
                padding: '2px 10px',
                borderRadius: 10,
                background: token.colorSuccessBg,
                color: token.colorSuccess,
                border: `1px solid ${token.colorSuccessBorder}`
              }}
            >
              已完成
            </span>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<RiFolderOpenLine size={14} />}
              loading={creating}
              onClick={handleWorkspaceSetup}
            >
              选择文件夹
            </Button>
          )}
        </div>

        {/* ② 模型配置 */}
        <div style={itemStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 600,
                background: modelsDone ? token.colorSuccess : token.colorError,
                color: '#fff'
              }}
            >
              {modelsDone ? <RiCheckLine size={16} /> : '2'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: token.colorText }}>配置模型</div>
              <div style={{ fontSize: 12, marginTop: 2, color: token.colorTextTertiary }}>
                {modelsDone
                  ? '至少一个模型供应商可用'
                  : '添加并启用至少一个模型供应商，AI 对话依赖它'}
              </div>
            </div>
          </div>
          {modelsDone ? (
            <span
              style={{
                flexShrink: 0,
                fontSize: 12,
                padding: '2px 10px',
                borderRadius: 10,
                background: token.colorSuccessBg,
                color: token.colorSuccess,
                border: `1px solid ${token.colorSuccessBorder}`
              }}
            >
              已完成
            </span>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<RiArrowRightLine size={14} />}
              onClick={onModelSetup}
            >
              去配置
            </Button>
          )}
        </div>

        <div
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 12,
            color: token.colorTextTertiary
          }}
        >
          全部完成后自动进入应用
        </div>
      </div>
    </div>
  )
}

export default OnboardingGuide
