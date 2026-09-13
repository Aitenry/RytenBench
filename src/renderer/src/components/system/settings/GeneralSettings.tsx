import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Switch, Button, Segmented, Select, Modal, Form, Input } from 'antd'
import {
  LockOutlined,
  BgColorsOutlined,
  NotificationOutlined,
  TranslationOutlined
} from '@ant-design/icons'
import CryptoJS from 'crypto-js'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTheme } from '@renderer/contexts/useTheme'
import { useLanguage } from '@renderer/contexts/useLanguage'
import { useTranslation } from '@renderer/i18n'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings, ThemeMode, AppLanguage } from '@renderer/types/settings'
import { SettingsPageHeader, SettingsSection, SettingRow } from './SettingsUI'

const GeneralSettings: React.FC = () => {
  const { t } = useTranslation()
  const { viewMessage } = useMessage()
  const { themeMode, setThemeMode } = useTheme()
  const { language, setLanguage } = useLanguage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm] = Form.useForm()

  const loadSettings = useCallback(async () => {
    const msgKey = 'general-settings-load'
    try {
      const result = await (window as unknown as Window).api.systemSettings.getAll()
      setSettings(result)
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

  const updateSettings = async (updates: Partial<SystemSettings>): Promise<void> => {
    const msgKey = 'general-settings-save'
    try {
      viewMessage(msgKey, 'loading', t('common.action.saving'))
      await (window as unknown as Window).api.systemSettings.update(updates)
      viewMessage(msgKey, 'success', t('common.action.saveSuccess'), 2)
      await loadSettings()
    } catch (error) {
      viewMessage(
        msgKey,
        'error',
        t('common.message.saveFailedWithReason', { reason: String(error) })
      )
    }
  }

  const handleThemeChange = (value: string | number): void => {
    setThemeMode(value as ThemeMode).then()
  }

  const handleLanguageChange = (value: AppLanguage): void => {
    setLanguage(value).then()
  }

  const handleLockViewChange = (checked: boolean): void => {
    if (!settings) return
    updateSettings({ lock: { ...settings.lock, view: checked } }).then()
  }

  const handleChangePassword = async (): Promise<void> => {
    try {
      const values = await passwordForm.validateFields()
      const oldHash = CryptoJS.MD5(values.oldPassword).toString()

      if (oldHash !== settings?.lock.code) {
        viewMessage('password-error', 'error', t('settings.general.passwordModal.wrongOldPassword'))
        return
      }

      const newHash = CryptoJS.MD5(values.newPassword).toString()
      await updateSettings({ lock: { ...settings!.lock, code: newHash } })
      setPasswordModalOpen(false)
      passwordForm.resetFields()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      viewMessage(
        'password-error',
        'error',
        t('common.message.operationFailedWithReason', { reason: String(error) })
      )
    }
  }

  /** 语言下拉只有两项；语言名用各自母语书写，两种界面下都自解释 */
  const languageOptions = useMemo(
    () => [
      { value: 'zh-CN' as AppLanguage, label: t('common.language.zhCN') },
      { value: 'en-US' as AppLanguage, label: t('common.language.enUS') }
    ],
    [t]
  )

  return (
    <div>
      <SettingsPageHeader
        title={t('settings.general.pageTitle')}
        description={t('settings.general.pageDescription')}
      />

      {/* 界面语言 */}
      <SettingsSection
        title={t('settings.general.language.sectionTitle')}
        icon={<TranslationOutlined size={14} />}
        description={t('settings.general.language.sectionDescription')}
      >
        <SettingRow
          title={t('settings.general.language.rowTitle')}
          description={t('settings.general.language.rowDescription')}
          control={
            <Select
              value={language}
              onChange={handleLanguageChange}
              options={languageOptions}
              style={{ width: 160 }}
            />
          }
        />
      </SettingsSection>

      {/* 主题设置 */}
      <SettingsSection
        title={t('settings.general.theme.sectionTitle')}
        icon={<BgColorsOutlined size={14} />}
        description={t('settings.general.theme.sectionDescription')}
      >
        <SettingRow
          title={t('settings.general.theme.rowTitle')}
          description={t('settings.general.theme.rowDescription')}
          control={
            <Segmented
              value={themeMode}
              onChange={handleThemeChange}
              options={[
                { label: t('settings.general.theme.light'), value: 'light' },
                { label: t('settings.general.theme.dark'), value: 'dark' },
                { label: t('settings.general.theme.auto'), value: 'auto' }
              ]}
            />
          }
        />
      </SettingsSection>

      {/* 系统托盘设置 */}
      <SettingsSection
        title={t('settings.general.tray.sectionTitle')}
        icon={<NotificationOutlined size={14} />}
        description={t('settings.general.tray.sectionDescription')}
      >
        <SettingRow
          title={t('settings.general.tray.rowTitle')}
          description={t('settings.general.tray.rowDescription')}
          control={
            <Switch
              checked={settings?.tray?.closeToTray ?? true}
              onChange={(checked) => updateSettings({ tray: { closeToTray: checked } })}
            />
          }
        />
      </SettingsSection>

      {/* 锁屏设置 */}
      <SettingsSection
        title={t('settings.general.lock.sectionTitle')}
        icon={<LockOutlined size={14} />}
      >
        <SettingRow
          title={t('settings.general.lock.enableTitle')}
          description={t('settings.general.lock.enableDescription')}
          control={<Switch checked={settings?.lock.view} onChange={handleLockViewChange} />}
        />
        <SettingRow
          title={t('settings.general.lock.passwordTitle')}
          description={t('settings.general.lock.passwordDescription')}
          control={
            <Button size="small" onClick={() => setPasswordModalOpen(true)}>
              {t('settings.general.lock.changePassword')}
            </Button>
          }
        />
      </SettingsSection>

      {/* 修改密码弹窗 */}
      <Modal
        title={t('settings.general.passwordModal.title')}
        open={passwordModalOpen}
        onCancel={() => {
          setPasswordModalOpen(false)
          passwordForm.resetFields()
        }}
        onOk={handleChangePassword}
        okText={t('common.action.confirm')}
        cancelText={t('common.action.cancel')}
      >
        <Form form={passwordForm} layout="vertical" className="mt-4">
          <Form.Item
            name="oldPassword"
            label={t('settings.general.passwordModal.oldPassword')}
            rules={[
              { required: true, message: t('settings.general.passwordModal.oldPasswordRequired') },
              { pattern: /^\d{6}$/, message: t('settings.general.passwordModal.sixDigits') }
            ]}
          >
            <Input.OTP length={6} formatter={(str) => str.replace(/\D/g, '')} inputMode="numeric" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t('settings.general.passwordModal.newPassword')}
            rules={[
              { required: true, message: t('settings.general.passwordModal.newPasswordRequired') },
              { pattern: /^\d{6}$/, message: t('settings.general.passwordModal.sixDigits') }
            ]}
          >
            <Input.OTP length={6} formatter={(str) => str.replace(/\D/g, '')} inputMode="numeric" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('settings.general.passwordModal.confirmPassword')}
            dependencies={['newPassword']}
            rules={[
              {
                required: true,
                message: t('settings.general.passwordModal.confirmPasswordRequired')
              },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error(t('settings.general.passwordModal.mismatch')))
                }
              })
            ]}
          >
            <Input.OTP length={6} formatter={(str) => str.replace(/\D/g, '')} inputMode="numeric" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default GeneralSettings
