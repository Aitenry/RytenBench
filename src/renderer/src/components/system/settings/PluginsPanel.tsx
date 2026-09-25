import React, { useEffect, useState, useCallback } from 'react'
import { App, Button, Switch, Tag, theme } from 'antd'
import { useTranslation } from '@renderer/i18n'
import { usePlugins } from '@renderer/plugin-host/PluginHostContext'
import type { PluginListEntry, PluginState } from '@shared/plugin/types'
import { SettingsPageHeader, SettingsSection } from './SettingsUI'

/**
 * 插件管理面板（设置 → 插件）。
 * 列表数据来自主进程 plugins-list（合并内置目录 + 外部扫描 + 启用态）；
 * 实时 fiber 状态来自宿主描述符；切换经 api.plugin.setEnabled 持久化并广播，
 * 渲染层 host 即时装载/卸载（路由/菜单/设置页/Provider 立即反应）。
 * 外部插件支持安装（选目录复制）/卸载（删除目录，启用中先停用）。
 */
const PluginsPanel: React.FC = () => {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const { token } = theme.useToken()
  const descriptors = usePlugins()
  const [entries, setEntries] = useState<PluginListEntry[]>([])

  const refresh = useCallback((): void => {
    window.api.plugin
      .list()
      .then(setEntries)
      .catch((err) => console.error('[plugins] 列表加载失败:', err))
  }, [])

  useEffect(() => {
    refresh()
    // 启停/安装/卸载后主进程广播，面板实时刷新
    const unsub = window.api.plugin.onStateChanged(() => refresh())
    return unsub
  }, [refresh])

  const toggle = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      try {
        setEntries(await window.api.plugin.setEnabled(id, enabled))
      } catch (err) {
        message.error(t('settings.plugins.switchFail'))
        console.error('[plugins] 切换失败:', err)
      }
    },
    [message, t]
  )

  const install = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.plugin.install()
      if (!result.ok) {
        message.error(result.error || t('settings.plugins.installFail'))
      } else {
        message.success(t('settings.plugins.install'))
      }
    } catch (err) {
      message.error(t('settings.plugins.installFail'))
      console.error('[plugins] 安装失败:', err)
    }
  }, [message, t])

  const uninstall = useCallback(
    (entry: PluginListEntry): void => {
      modal.confirm({
        title: t('settings.plugins.uninstallConfirmTitle'),
        content: t('settings.plugins.uninstallConfirmContent'),
        okText: t('common.action.delete'),
        cancelText: t('common.action.cancel'),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            setEntries(await window.api.plugin.uninstall(entry.id))
          } catch (err) {
            message.error(t('settings.plugins.switchFail'))
            console.error('[plugins] 卸载失败:', err)
          }
        }
      })
    },
    [modal, message, t]
  )

  const runtimeState = useCallback(
    (id: string): PluginState | undefined => descriptors.find((d) => d.manifest.id === id)?.state,
    [descriptors]
  )

  return (
    <div>
      <SettingsPageHeader
        title={t('settings.plugins.pageTitle')}
        description={t('settings.plugins.pageDescription')}
        extra={
          <Button size="small" onClick={() => void install()}>
            {t('settings.plugins.install')}
          </Button>
        }
      />
      <SettingsSection
        title={t('settings.plugins.listTitle')}
        description={t('settings.plugins.listDescription')}
      >
        {entries.map((entry) => {
          const state = runtimeState(entry.id)
          const failed = state === 'error'
          return (
            <div
              key={entry.id}
              className="sui-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '10px 16px'
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: token.colorText }}>
                    {entry.name}
                  </span>
                  <Tag
                    bordered={false}
                    color={entry.builtin ? 'default' : 'geekblue'}
                    style={{
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 6px',
                      marginInlineEnd: 0
                    }}
                  >
                    {t(
                      entry.builtin
                        ? 'settings.plugins.builtinBadge'
                        : 'settings.plugins.externalBadge'
                    )}
                  </Tag>
                  <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
                    v{entry.version}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: token.colorTextSecondary,
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {entry.description}
                  {failed && (
                    <span style={{ color: token.colorError, marginLeft: 8 }}>（加载失败）</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                {!entry.builtin && (
                  <Button size="small" danger type="text" onClick={() => uninstall(entry)}>
                    {t('settings.plugins.uninstall')}
                  </Button>
                )}
                <Switch
                  checked={entry.enabled}
                  onChange={(checked) => {
                    void toggle(entry.id, checked)
                  }}
                />
              </div>
            </div>
          )
        })}
      </SettingsSection>
    </div>
  )
}

export default PluginsPanel
