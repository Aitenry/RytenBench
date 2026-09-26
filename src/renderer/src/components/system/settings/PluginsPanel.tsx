import React, { useEffect, useState, useCallback } from 'react'
import { App, Button, Checkbox, Modal, Switch, Tag, theme } from 'antd'
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
 * - 「同时删除该插件的全部数据」勾上 → 调 `plugin.purge` 清数据 + 删目录 + 记 `uninstalled`；
 * - 不勾 → **什么都不做**（= 保留数据 = 不卸载），面板不会发出任何请求，确认按钮保持禁用。
 *
 * 实时 fiber 状态来自宿主描述符；启停经 `api.plugin.setEnabled` 持久化并广播，
 * 渲染层 host 即时装载/卸载（路由/菜单/设置页/Provider 立即反应）。
 */
const PluginsPanel: React.FC = () => {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const descriptors = usePlugins()
  const [entries, setEntries] = useState<PluginListEntry[]>([])
  /** 卸载确认框的目标（null = 未打开） */
  const [pending, setPending] = useState<PluginListEntry | null>(null)
  /** 确认框里的「是否同时删除数据」勾选态；每次打开都重置为未勾选 */
  const [purgeData, setPurgeData] = useState(false)

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

  /** 打开卸载确认框（不勾「同时删除数据」时确认按钮保持禁用 = 不卸载） */
  const uninstall = useCallback((entry: PluginListEntry): void => {
    setPurgeData(false)
    setPending(entry)
  }, [])

  const confirmUninstall = useCallback(async (): Promise<void> => {
    const target = pending
    if (!target || !purgeData) return
    try {
      setEntries(await window.api.plugin.uninstall(target.id, true))
      message.success(t('settings.plugins.uninstallDone'))
      setPending(null)
    } catch (err) {
      message.error(t('settings.plugins.uninstallFail'))
      console.error('[plugins] 卸载失败:', err)
    }
  }, [pending, purgeData, message, t])

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
          {/* 已安装就能物理卸载：磁盘包（内置或第三方）都在 userData/plugins/<id>/ 下，
              卸载 = 问数据 → 清数据 → 删目录 → 记账。P5 前「还没迁到磁盘包的内置插件」
              只有开关没有卸载按钮，那种条目已随静态注册表一起消失。 */}
          <Button size="small" danger type="text" onClick={() => uninstall(entry)}>
            {t('settings.plugins.uninstall')}
          </Button>
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

      {/* 卸载确认框：数据取舍是一个**勾选项**（不是塞进按钮文案），
          不勾 = 保留数据 = 不卸载，确认按钮保持禁用 */}
      <Modal
        open={pending !== null}
        title={t('settings.plugins.uninstallTitle', { name: pending?.name ?? '' })}
        okText={t('settings.plugins.uninstallConfirm')}
        cancelText={t('common.action.cancel')}
        okButtonProps={{ danger: true, disabled: !purgeData }}
        onOk={() => void confirmUninstall()}
        onCancel={() => setPending(null)}
        width={430}
        destroyOnHidden
      >
        <div style={{ fontSize: 12.5, color: token.colorTextSecondary, lineHeight: 1.7 }}>
          {t('settings.plugins.uninstallBody')}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Checkbox
            checked={purgeData}
            onChange={(e) => setPurgeData(e.target.checked)}
            style={{ marginTop: 1 }}
          />
          <div style={{ cursor: 'pointer' }} onClick={() => setPurgeData((v) => !v)}>
            <div style={{ fontSize: 13, color: token.colorText }}>
              {t('settings.plugins.purgeCheckbox')}
            </div>
            <div
              style={{
                fontSize: 12,
                color: token.colorTextTertiary,
                lineHeight: 1.6,
                marginTop: 2
              }}
            >
              {pending?.purgeLabel
                ? t('settings.plugins.purgeDetail', { label: pending.purgeLabel })
                : t('settings.plugins.purgeDetailFallback')}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: token.colorTextTertiary,
            lineHeight: 1.6,
            marginTop: 12
          }}
        >
          {t('settings.plugins.purgeHint')}
        </div>
      </Modal>
    </div>
  )
}

export default PluginsPanel
