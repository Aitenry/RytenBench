import React, { useState, useEffect, useCallback } from 'react'
import { theme } from 'antd'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings } from '@renderer/types/settings'
import { SettingsPageHeader, SettingsSection, SettingRow } from './settings-ui'

const SystemInfo: React.FC = () => {
  const {
    token: { colorTextTertiary }
  } = theme.useToken()

  const { viewMessage } = useMessage()
  const [settings, setSettings] = useState<SystemSettings | null>(null)

  const loadSettings = useCallback(async () => {
    const msgKey = 'system-info-load'
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

  const ipValue = (value: string | undefined): React.ReactNode =>
    value ? <span>{value}</span> : <span style={{ color: colorTextTertiary }}>未获取</span>

  return (
    <div>
      <SettingsPageHeader title="系统信息" description="当前系统运行环境信息" />

      <SettingsSection title="运行环境">
        <SettingRow title="本机 IP" control={ipValue(settings?.ip?.query as string | undefined)} />
        <SettingRow
          title="本机位置"
          control={
            settings?.ip?.city ? (
              `${settings.ip.country as string} ${settings.ip.regionName as string} ${settings.ip.city as string}`
            ) : (
              <span style={{ color: colorTextTertiary }}>未获取</span>
            )
          }
        />
        <SettingRow title="运营商" control={ipValue(settings?.ip?.isp as string | undefined)} />
        <SettingRow
          title="API Key 加密"
          control={<span style={{ color: '#52c41a' }}>AES-256-GCM（机器唯一密钥）</span>}
        />
      </SettingsSection>
    </div>
  )
}

export default SystemInfo
