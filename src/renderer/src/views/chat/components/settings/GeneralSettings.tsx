import React, { useState, useEffect, useCallback } from 'react'
import { theme, Form, InputNumber, Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'

const GeneralSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorTextTertiary }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)

  const loadSettings = useCallback(async () => {
    const msgKey = 'general-settings-load'
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
    const msgKey = 'general-settings-save'
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
      <h3 className="text-base font-semibold m-0 mb-1" style={{ color: colorText }}>
        通用设置
      </h3>
      <p className="text-sm mt-1 mb-4" style={{ color: colorTextSecondary }}>
        管理对话的全局配置
      </p>

      <Form layout="vertical" size="small">
        <Form.Item label="工具调用最大轮次" tooltip="AI 对话中模型调用工具的最大次数，防止无限循环">
          <InputNumber
            min={1}
            max={20}
            value={settings.chat.maxIterations}
            onChange={(v) => v !== null && handleChatChange('maxIterations', v)}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item
          label="历史上下文窗口（轮次）"
          tooltip="每次对话携带的历史对话轮次数，0 表示不限制。值越大消耗的 token 越多"
        >
          <InputNumber
            min={0}
            max={50}
            value={settings.chat.historyWindowSize}
            onChange={(v) => v !== null && handleChatChange('historyWindowSize', v)}
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item
          label="工具调用上下文窗口（条数）"
          tooltip="历史对话中保留的工具调用结果条数，0 表示不限制。用于控制上下文中的工具调用数量"
        >
          <InputNumber
            min={0}
            max={100}
            value={settings.chat.toolCallWindowSize}
            onChange={(v) => v !== null && handleChatChange('toolCallWindowSize', v)}
            style={{ width: 120 }}
          />
        </Form.Item>
      </Form>
    </div>
  )
}

export default GeneralSettings
