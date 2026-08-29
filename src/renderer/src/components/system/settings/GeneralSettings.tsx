import React, { useState, useEffect, useCallback } from 'react'
import { Switch, Button, Segmented, Modal, Form, Input } from 'antd'
import { LockOutlined, BgColorsOutlined, NotificationOutlined } from '@ant-design/icons'
import CryptoJS from 'crypto-js'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTheme } from '@renderer/contexts/useTheme'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings, ThemeMode } from '@renderer/types/settings'
import { SettingsPageHeader, SettingsSection, SettingRow } from './settings-ui'

const GeneralSettings: React.FC = () => {
  const { viewMessage } = useMessage()
  const { themeMode, setThemeMode } = useTheme()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm] = Form.useForm()

  const loadSettings = useCallback(async () => {
    const msgKey = 'general-settings-load'
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

  const handleThemeChange = (value: string | number): void => {
    setThemeMode(value as ThemeMode).then()
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
        viewMessage('password-error', 'error', '原密码错误')
        return
      }

      const newHash = CryptoJS.MD5(values.newPassword).toString()
      await updateSettings({ lock: { ...settings!.lock, code: newHash } })
      setPasswordModalOpen(false)
      passwordForm.resetFields()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      viewMessage('password-error', 'error', `修改失败: ${error}`)
    }
  }

  return (
    <div>
      <SettingsPageHeader title="通用设置" description="管理应用的主题与安全配置" />

      {/* 主题设置 */}
      <SettingsSection
        title="主题模式"
        icon={<BgColorsOutlined size={14} />}
        description="自动模式下，6:00 ~ 18:00 为亮色主题，其余时间为暗色主题"
      >
        <SettingRow
          title="外观"
          description="亮色 / 暗色 / 跟随时间段自动切换"
          control={
            <Segmented
              value={themeMode}
              onChange={handleThemeChange}
              options={[
                { label: '亮色', value: 'light' },
                { label: '暗色', value: 'dark' },
                { label: '自动', value: 'auto' }
              ]}
            />
          }
        />
      </SettingsSection>

      {/* 系统托盘设置 */}
      <SettingsSection
        title="系统托盘"
        icon={<NotificationOutlined size={14} />}
        description="关闭窗口时的后台驻留行为"
      >
        <SettingRow
          title="关闭到系统托盘"
          description="开启后关闭窗口将隐藏到系统托盘继续运行，可随时从托盘图标恢复或退出；关闭后关闭窗口将直接退出应用"
          control={
            <Switch
              checked={settings?.tray?.closeToTray ?? true}
              onChange={(checked) => updateSettings({ tray: { closeToTray: checked } })}
            />
          }
        />
      </SettingsSection>

      {/* 锁屏设置 */}
      <SettingsSection title="锁屏设置" icon={<LockOutlined size={14} />}>
        <SettingRow
          title="启用锁屏"
          description="关闭后锁屏功能将失效"
          control={<Switch checked={settings?.lock.view} onChange={handleLockViewChange} />}
        />
        <SettingRow
          title="锁屏密码"
          description="6 位纯数字密码，修改后旧密码将失效"
          control={
            <Button size="small" onClick={() => setPasswordModalOpen(true)}>
              修改密码
            </Button>
          }
        />
      </SettingsSection>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改锁屏密码"
        open={passwordModalOpen}
        onCancel={() => {
          setPasswordModalOpen(false)
          passwordForm.resetFields()
        }}
        onOk={handleChangePassword}
        okText="确定"
        cancelText="取消"
      >
        <Form form={passwordForm} layout="vertical" className="mt-4">
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[
              { required: true, message: '请输入原密码' },
              { pattern: /^\d{6}$/, message: '密码必须为6位纯数字' }
            ]}
          >
            <Input.OTP length={6} formatter={(str) => str.replace(/\D/g, '')} inputMode="numeric" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { pattern: /^\d{6}$/, message: '密码必须为6位纯数字' }
            ]}
          >
            <Input.OTP length={6} formatter={(str) => str.replace(/\D/g, '')} inputMode="numeric" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
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
