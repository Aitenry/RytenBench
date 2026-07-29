import React, { useState, useEffect, useCallback } from 'react'
import { theme, Form, InputNumber, Select, Spin, Input, Button, Space } from 'antd'
import { LoadingOutlined, FolderOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'
import type { ProviderOption } from '@renderer/types/components'

const GeneralSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorTextTertiary, colorFillAlter }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [workspacePath, setWorkspacePath] = useState('')
  const [workspaceSaving, setWorkspaceSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    const msgKey = 'general-settings-load'
    try {
      const [result, providerList] = await Promise.all([
        (window as unknown as Window).api.systemSettings.getAll(),
        (window as unknown as Window).api.providers.getEnabled()
      ])
      setSettings(result)
      setProviders((providerList as ProviderOption[]).filter((p) => !p.tags?.includes('embedding')))
      setWorkspacePath(result.chat.workspacePath || '')
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

  const handleDefaultModelChange = (value: number): void => {
    updateSettings({ defaultModelId: value }).then()
  }

  const handleBrowseWorkspace = async (): Promise<void> => {
    try {
      const dir = await (window as unknown as Window).api.chat.selectWorkspace()
      if (dir) {
        setWorkspacePath(dir)
      }
    } catch (error) {
      viewMessage('workspace-path', 'error', `选择目录失败: ${error}`)
    }
  }

  const handleSaveWorkspace = async (): Promise<void> => {
    const msgKey = 'workspace-path'
    try {
      setWorkspaceSaving(true)
      const trimmed = workspacePath.trim()
      await (window as unknown as Window).api.systemSettings.update({
        chat: { ...settings!.chat, workspacePath: trimmed || undefined }
      })
      setSettings((prev) =>
        prev ? { ...prev, chat: { ...prev.chat, workspacePath: trimmed || undefined } } : prev
      )
      viewMessage(msgKey, 'success', trimmed ? 'AI 工作区已保存' : '已清空 AI 工作区', 2)
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    } finally {
      setWorkspaceSaving(false)
    }
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
      <h3 className="text-base font-semibold m-0 mb-0.5" style={{ color: colorText }}>
        通用设置
      </h3>
      <p className="text-sm m-0 mb-3" style={{ color: colorTextSecondary }}>
        管理对话的全局配置
      </p>

      <div className="p-3 rounded-lg" style={{ background: colorFillAlter }}>
        <Form size="small" style={{ marginBottom: -8 }}>
          <Form.Item
            label="工具调用最大轮次"
            tooltip="AI 对话中模型调用工具的最大次数，防止无限循环"
          >
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
          <Form.Item
            label="默认聊天模型"
            tooltip="对话时默认使用的 AI 模型，仅显示非 Embedding 模型"
          >
            <Select
              placeholder="使用供应商默认设置"
              value={settings.defaultModelId}
              onChange={handleDefaultModelChange}
              allowClear
              options={providers.map((p) => ({
                value: p.id,
                label: `${p.provider.toUpperCase()}: ${p.model}`
              }))}
              style={{ width: '100%', maxWidth: 400 }}
            />
          </Form.Item>
        </Form>
      </div>

      <div className="p-3 rounded-lg mt-3" style={{ background: colorFillAlter }}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOutlined style={{ color: colorTextSecondary }} />
          <span className="font-medium" style={{ color: colorText }}>
            AI 工作区目录
          </span>
        </div>
        <p className="text-xs m-0 mb-3" style={{ color: colorTextSecondary }}>
          挂载为 AI 的虚拟根目录（/），AI 可通过 ls / read / write 等工具操作此目录下的文件
        </p>
        <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
          <Input
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            placeholder="未设置（回退到技能目录）"
            allowClear
          />
          <Button onClick={handleBrowseWorkspace}>浏览…</Button>
          <Button
            type="primary"
            loading={workspaceSaving}
            disabled={workspacePath.trim() === (settings.chat.workspacePath || '')}
            onClick={handleSaveWorkspace}
          >
            保存
          </Button>
        </Space.Compact>
      </div>
    </div>
  )
}

export default GeneralSettings
