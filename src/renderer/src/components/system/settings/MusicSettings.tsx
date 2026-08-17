import React, { useState, useEffect, useCallback } from 'react'
import { Input, Button, Space } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings } from '@renderer/types/settings'
import { SettingsPageHeader, SettingsSection } from './settings-ui'

const MusicSettings: React.FC = () => {
  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [musicDir, setMusicDir] = useState('')
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    const msgKey = 'music-settings-load'
    try {
      const result = await (window as unknown as Window).api.systemSettings.getAll()
      setSettings(result)
      setMusicDir(result.musicDirectory || '')
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  const handleBrowseDirectory = async (): Promise<void> => {
    try {
      const dir = await (window as unknown as Window).api.music.selectDirectory()
      if (dir) {
        setMusicDir(dir)
      }
    } catch (error) {
      viewMessage('music-dir', 'error', `选择目录失败: ${error}`)
    }
  }

  const handleSaveDirectory = async (): Promise<void> => {
    const msgKey = 'music-dir'
    try {
      setSaving(true)
      const trimmed = musicDir.trim()
      await (window as unknown as Window).api.systemSettings.update({
        musicDirectory: trimmed || undefined
      })
      setSettings((prev) => (prev ? { ...prev, musicDirectory: trimmed } : prev))
      viewMessage(msgKey, 'success', trimmed ? '音乐目录已保存' : '已清空音乐目录', 2)
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SettingsPageHeader
        title="音乐设置"
        description="设置音乐文件根目录，子文件夹将作为歌单加载"
      />

      <SettingsSection
        title="音乐存储目录"
        icon={<FolderOutlined size={14} />}
        description="设置后子文件夹将自动作为歌单识别"
        bodyPadding={16}
      >
        <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
          <Input
            value={musicDir}
            onChange={(e) => setMusicDir(e.target.value)}
            placeholder="未设置"
            allowClear
          />
          <Button onClick={handleBrowseDirectory}>浏览…</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={musicDir.trim() === (settings?.musicDirectory || '')}
            onClick={handleSaveDirectory}
          >
            保存
          </Button>
        </Space.Compact>
        {settings?.musicDirectory && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12,
              color: 'inherit',
              opacity: 0.65,
              wordBreak: 'break-all'
            }}
          >
            当前已生效：{settings.musicDirectory}
          </p>
        )}
      </SettingsSection>
    </div>
  )
}

export default MusicSettings
