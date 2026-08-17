import React, { useState, useEffect, useCallback } from 'react'
import { theme, InputNumber, Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'
import { SettingsPageHeader, SettingsSection, SettingRow } from './settings-ui'

/**
 * 对话设置（原聊天页「通用设置」，已并入系统设置）
 */
const AssistantSettings: React.FC = () => {
  const {
    token: { colorTextTertiary }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)

  const loadSettings = useCallback(async () => {
    const msgKey = 'assistant-settings-load'
    try {
      const result = await (window as unknown as Window).api.systemSettings.getAll()
      setSettings(result)
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  const updateSettings = async (updates: Partial<SystemSettings>): Promise<void> => {
    const msgKey = 'assistant-settings-save'
    try {
      viewMessage(msgKey, 'loading', '正在保存...')
      await (window as unknown as Window).api.systemSettings.update(updates)
      viewMessage(msgKey, 'success', '保存成功', 2)
      await loadSettings()
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    }
  }

  const handleChatChange = (field: keyof ChatSettings, value: number): void => {
    if (!settings) return
    updateSettings({ chat: { ...settings.chat, [field]: value } }).then()
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin
          indicator={<LoadingOutlined spin style={{ fontSize: 24, color: colorTextTertiary }} />}
        />
      </div>
    )
  }

  return (
    <div>
      <SettingsPageHeader title="对话设置" description="配置 AI 对话的全局参数" />

      <SettingsSection title="对话参数">
        <SettingRow
          title="工具调用最大轮次"
          description="AI 对话中模型调用工具的最大次数，防止无限循环"
          control={
            <InputNumber
              min={1}
              max={20}
              value={settings.chat.maxIterations}
              onChange={(v) => v !== null && handleChatChange('maxIterations', v)}
              style={{ width: 120 }}
            />
          }
        />
        <SettingRow
          title="历史上下文窗口（轮次）"
          description="每次对话携带的历史对话轮次数，0 表示不限制。值越大消耗的 token 越多"
          control={
            <InputNumber
              min={0}
              max={50}
              value={settings.chat.historyWindowSize}
              onChange={(v) => v !== null && handleChatChange('historyWindowSize', v)}
              style={{ width: 120 }}
            />
          }
        />
      </SettingsSection>
    </div>
  )
}

export default AssistantSettings
