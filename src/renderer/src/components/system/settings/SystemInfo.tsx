import React, { useState, useEffect, useCallback } from 'react'
import { theme, Descriptions } from 'antd'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings } from '@renderer/types/settings'

const SystemInfo: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorTextTertiary, colorFillAlter }
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

  return (
    <div>
      <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
        系统信息
      </h3>
      <p className="text-sm mt-1 mb-4" style={{ color: colorTextSecondary }}>
        当前系统运行环境信息
      </p>

      <div className="p-4 rounded-lg" style={{ background: colorFillAlter }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="本机 IP">
            {(settings?.ip?.query as string) || (
              <span style={{ color: colorTextTertiary }}>未获取</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="本机位置">
            {settings?.ip?.city ? (
              `${settings.ip.country as string} ${settings.ip.regionName as string} ${settings.ip.city as string}`
            ) : (
              <span style={{ color: colorTextTertiary }}>未获取</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="运营商">
            {(settings?.ip?.isp as string) || (
              <span style={{ color: colorTextTertiary }}>未获取</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="API Key 加密">
            <span className="text-green-600">AES-256-GCM（机器唯一密钥）</span>
          </Descriptions.Item>
        </Descriptions>
      </div>
    </div>
  )
}

export default SystemInfo
