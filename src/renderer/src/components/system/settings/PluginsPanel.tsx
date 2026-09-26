import React, { useEffect, useState, useCallback } from 'react'
import { App, Button, Switch, Tag, theme } from 'antd'
import { useTranslation } from '@renderer/i18n'
import { usePlugins } from '@renderer/plugin-host/PluginHostContext'
import type { PluginListEntry, PluginState } from '@shared/plugin/types'
import { SettingsPageHeader, SettingsSection } from './SettingsUI'

/**
 * 插件管理面板（设置 → 插件）。
 *
 * 列表数据来自主进程 `plugins-list`，口径是「`userData/plugins/<id>/` 里装了什么」：
 * - **已安装**：名字 + 内置/第三方标签 + 版本 + 描述，右侧「卸载」+ 启用开关；
 * - **可安装的内置插件**（应用包里带着、但已被卸载）：列表末尾单独一区，行内「安装」。
 *
 * 卸载是**物理卸载**（删目录），因此必须先问数据（用户口径）：
 * - 「不保留数据并卸载」→ 调 `plugin.purge` 清数据 + 删目录 + 记 `uninstalled`；
 * - 「取消」→ **什么都不做**（= 保留数据 = 不卸载），面板不会发出任何请求。
 *
 * 实时 fiber 状态来自宿主描述符；启停经 `api.plugin.setEnabled` 持久化并广播，
 * 渲染层 host 即时装载/卸载（路由/菜单/设置页/Provider 立即反应）。
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

  /** 第三方插件：选目录安装（内置插件的「安装」走 reinstall） */
  const installExternal = useCallback(async (): Promise<void> => {
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

  /** 从应用包重装某个内置插件 */
  const reinstall = useCallback(
    async (id: string): Promise<void> => {
      try {
        const result = await window.api.plugin.install(id)
        if (!result.ok) {
          message.error(result.error || t('settings.plugins.installFail'))
        } else {
          message.success(t('settings.plugins.reinstallDone'))
        }
      } catch (err) {
        message.error(t('settings.plugins.installFail'))
        console.error('[plugins] 重装失败:', err)
      }
    },
    [message, t]
  )

  /**
   * 卸载（含数据询问）。取消按钮是「保留数据」——用户口径里那等于不卸载，
   * 因此 onOk 之外不发任何请求。
   */
  const uninstall = useCallback(
    (entry: PluginListEntry): void => {
      modal.confirm({
        title: t('settings.plugins.uninstallConfirmTitle', { name: entry.name }),
        content: t('settings.plugins.uninstallConfirmContent'),
        okText: t('settings.plugins.uninstallPurgeOk'),
        cancelText: t('common.action.cancel'),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            setEntries(await window.api.plugin.uninstall(entry.id, true))
            message.success(t('settings.plugins.uninstallDone'))
          } catch (err) {
            message.error(t('settings.plugins.uninstallFail'))
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

  const installed = entries.filter((e) => e.installed)
  const available = entries.filter((e) => !e.installed)

  const renderRow = (entry: PluginListEntry): React.ReactNode => {
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
                entry.builtin ? 'settings.plugins.builtinBadge' : 'settings.plugins.externalBadge'
              )}
            </Tag>
            <span style={{ fontSize: 11, color: token.colorTextTertiary }}>v{entry.version}</span>
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
            {failed && <span style={{ color: token.colorError, marginLeft: 8 }}>（加载失败）</span>}
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          {/* 「卸载」只对**能物理卸载**的插件出现：第三方插件、以及已迁到磁盘包的内置插件
              （bundled=true）。过渡期里还没搬走的内置插件没有包目录可删，只给开关。 */}
          {(entry.bundled || !entry.builtin) && (
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
  }

  return (
    <div>
      <SettingsPageHeader
        title={t('settings.plugins.pageTitle')}
        description={t('settings.plugins.pageDescription')}
        extra={
          <Button size="small" onClick={() => void installExternal()}>
            {t('settings.plugins.install')}
          </Button>
        }
      />
      <SettingsSection
        title={t('settings.plugins.listTitle')}
        description={t('settings.plugins.listDescription')}
      >
        {installed.map(renderRow)}
      </SettingsSection>
      {available.length > 0 && (
        <SettingsSection
          title={t('settings.plugins.availableTitle')}
          description={t('settings.plugins.availableDescription')}
        >
          {available.map((entry) => (
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
                    color="default"
                    style={{
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 6px',
                      marginInlineEnd: 0
                    }}
                  >
                    {t('settings.plugins.builtinBadge')}
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
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <Button size="small" onClick={() => void reinstall(entry.id)}>
                  {t('settings.plugins.reinstall')}
                </Button>
              </div>
            </div>
          ))}
        </SettingsSection>
      )}
    </div>
  )
}

export default PluginsPanel
