import React, { useState, useEffect, useCallback } from 'react'
import { Input, Button, Space } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings } from '@renderer/types/settings'
import { useTranslation } from '@renderer/i18n'
import { SettingsPageHeader, SettingsSection } from './SettingsUI'

const MusicSettings: React.FC = () => {
  const { viewMessage } = useMessage()
  const { t } = useTranslation()

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
      viewMessage(
        msgKey,
        'error',
        t('common.message.loadFailedWithReason', { reason: String(error) })
      )
    }
  }, [viewMessage, t])

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
      viewMessage('music-dir', 'error', t('musicSettings.selectFailed', { reason: String(error) }))
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
      viewMessage(
        msgKey,
        'success',
        trimmed ? t('musicSettings.saved') : t('musicSettings.cleared'),
        2
      )
    } catch (error) {
      viewMessage(
        msgKey,
        'error',
        t('common.message.saveFailedWithReason', { reason: String(error) })
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SettingsPageHeader
        title={t('musicSettings.pageTitle')}
        description={t('musicSettings.pageDescription')}
      />

      <SettingsSection
        title={t('musicSettings.sectionTitle')}
        icon={<FolderOutlined size={14} />}
        description={t('musicSettings.sectionDescription')}
        bodyPadding={16}
      >
        <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
          <Input
            value={musicDir}
            onChange={(e) => setMusicDir(e.target.value)}
            placeholder={t('musicSettings.placeholder')}
            allowClear
          />
          <Button onClick={handleBrowseDirectory}>{t('musicSettings.browse')}</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={musicDir.trim() === (settings?.musicDirectory || '')}
            onClick={handleSaveDirectory}
          >
            {t('common.action.save')}
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
            {t('musicSettings.current', { path: settings.musicDirectory })}
          </p>
        )}
      </SettingsSection>
    </div>
  )
}

export default MusicSettings
