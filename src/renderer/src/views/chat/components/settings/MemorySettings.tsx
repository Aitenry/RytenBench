import React, { useState, useEffect, useCallback } from 'react'
import { Button, Input } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'
import {
  SettingsPageHeader,
  SettingsSection,
  SettingBlock
} from '../../../../components/system/settings/settings-ui'

const MemorySettings: React.FC = () => {
  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [memoryPath, setMemoryPath] = useState('')
  const [savingPath, setSavingPath] = useState(false)

  const loadSettings = useCallback(async () => {
    const msgKey = 'memory-settings-load'
    try {
      const result = await (window as unknown as Window).api.systemSettings.getAll()
      setSettings(result)
      setMemoryPath(result.chat?.memoryPath ?? '')
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  const handleBrowsePath = async (): Promise<void> => {
    try {
      const path = await (window as unknown as Window).api.chat.selectMemoryDirectory()
      if (path) setMemoryPath(path)
    } catch (error) {
      viewMessage('memory-path', 'error', `选择目录失败: ${error}`)
    }
  }

  const handleSavePath = async (): Promise<void> => {
    const msgKey = 'memory-path'
    try {
      setSavingPath(true)
      const trimmed = memoryPath.trim()
      const nextChat: ChatSettings = {
        ...(settings?.chat ?? {
          maxIterations: 5,
          historyWindowSize: 10
        }),
        memoryPath: trimmed || undefined
      }
      await (window as unknown as Window).api.systemSettings.update({ chat: nextChat })
      setSettings((prev) => (prev ? { ...prev, chat: nextChat } : prev))
      setMemoryPath(trimmed)
      viewMessage(msgKey, 'success', trimmed ? '记忆目录已保存' : '已清空记忆目录', 2)
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    } finally {
      setSavingPath(false)
    }
  }

  return (
    <div>
      <SettingsPageHeader
        title="记忆（Memory）"
        description="配置全局记忆存储根目录，所有工作区的记忆都将集中存放于此。留空则不启用记忆功能。"
      />

      {/* 目录选择 */}
      <SettingsSection title="记忆存储根目录" icon={<FolderOutlined size={14} />} bodyPadding={16}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 560 }}>
          <Input
            value={memoryPath}
            onChange={(e) => setMemoryPath(e.target.value)}
            placeholder="例如：D:\memory（留空不启用）"
            allowClear
            style={{ flex: 1 }}
          />
          <Button onClick={handleBrowsePath}>浏览…</Button>
          <Button
            type="primary"
            loading={savingPath}
            disabled={memoryPath.trim() === (settings?.chat?.memoryPath ?? '')}
            onClick={handleSavePath}
          >
            保存
          </Button>
        </div>
        {settings?.chat?.memoryPath && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12,
              opacity: 0.65,
              wordBreak: 'break-all'
            }}
          >
            当前已生效：{settings.chat.memoryPath}
          </p>
        )}
      </SettingsSection>

      {/* 结构说明 */}
      <SettingsSection title="记忆目录结构说明" bodyPadding={16}>
        <SettingBlock>
          <div style={{ fontFamily: 'monospace', lineHeight: '20px' }}>
            <div>memoryPath/</div>
            <div className="ml-4">├── _global/ ← 全局记忆（所有工作区共享）</div>
            <div className="ml-8">├── memories/ ← Memory</div>
            <div className="ml-8">├── peers/ ← 交互对象间隔离的上下文数据</div>
            <div className="ml-8">├── privacy/ ← 敏感配置存储</div>
            <div className="ml-8">├── resources/ ← 知识</div>
            <div className="ml-8">├── sessions/ ← 会话</div>
            <div className="ml-8">└── skills/ ← Agent 自生成的技能</div>
            <div className="ml-4">├── workspace-{'{id}'}/ ← 工作区记忆</div>
            <div className="ml-8">├── main-agent/ ← DeepAgent</div>
            <div className="ml-12">├── memories/</div>
            <div className="ml-12">├── peers/</div>
            <div className="ml-12">├── privacy/</div>
            <div className="ml-12">├── resources/</div>
            <div className="ml-12">├── sessions/</div>
            <div className="ml-12">└── skills/</div>
            <div className="ml-8">└── sub-agents/ ← 子 Agent</div>
            <div className="ml-12">└── {'{agent-name}'}/</div>
            <div className="ml-16">├── memories/</div>
            <div className="ml-16">├── peers/</div>
            <div className="ml-16">├── privacy/</div>
            <div className="ml-16">├── resources/</div>
            <div className="ml-16">├── sessions/</div>
            <div className="ml-16">└── skills/</div>
          </div>
        </SettingBlock>
      </SettingsSection>
    </div>
  )
}

export default MemorySettings
