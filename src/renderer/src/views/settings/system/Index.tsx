import React, { useState, useEffect, useCallback } from 'react'
import {
  theme,
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Modal,
  Space,
  Descriptions,
  Select,
  message as antMessage
} from 'antd'
import { LockOutlined, LoadingOutlined, ApiOutlined } from '@ant-design/icons'
import CryptoJS from 'crypto-js'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings, GraphSettings, ChatSettings } from '@renderer/types/settings'

interface ProviderOption {
  id: number
  name: string
  model: string
  tags: string[] | null
}

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const { viewMessage } = useMessage()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [embeddingProviders, setEmbeddingProviders] = useState<ProviderOption[]>([])

  // 锁屏密码修改相关
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordForm] = Form.useForm()

  // --- 加载设置 ---

  const loadSettings = useCallback(async () => {
    const msgKey = 'sys-settings-load'
    try {
      const [result, providerList] = await Promise.all([
        (window as unknown as Window).api.systemSettings.getAll(),
        (window as unknown as Window).api.providers.getEnabled()
      ])
      setSettings(result)
      const allProviders = providerList as ProviderOption[]
      // 图谱构建和对话不需要 Embedding 模型
      setProviders(allProviders.filter((p) => !p.tags?.includes('embedding')))
      // Embedding 模型独立列表
      setEmbeddingProviders(allProviders.filter((p) => p.tags?.includes('embedding')))
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  // --- 更新设置 ---

  const updateSettings = async (updates: Partial<SystemSettings>): Promise<void> => {
    const msgKey = 'sys-settings-save'
    try {
      viewMessage(msgKey, 'loading', '正在保存...')
      await (window as unknown as Window).api.systemSettings.update(updates)
      viewMessage(msgKey, 'success', '保存成功', 2)
      await loadSettings()
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    }
  }

  // --- 锁屏 ---

  const handleLockViewChange = (checked: boolean): void => {
    if (!settings) return
    updateSettings({ lock: { ...settings.lock, view: checked } }).then()
  }

  const handleChangePassword = async (): Promise<void> => {
    try {
      const values = await passwordForm.validateFields()
      const oldHash = CryptoJS.MD5(values.oldPassword).toString()

      if (oldHash !== settings?.lock.code) {
        antMessage.error('原密码错误')
        return
      }

      const newHash = CryptoJS.MD5(values.newPassword).toString()
      await updateSettings({ lock: { ...settings!.lock, code: newHash } })
      setPasswordModalOpen(false)
      passwordForm.resetFields()
      antMessage.success('密码已修改')
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      antMessage.error(`修改失败: ${error}`)
    }
  }

  // --- 默认模型 ---

  const handleDefaultModelChange = (value: number): void => {
    updateSettings({ defaultModelId: value }).then()
  }

  // --- 默认 Embedding 模型 ---

  const handleEmbeddingModelChange = (value: number): void => {
    updateSettings({ defaultEmbeddingModelId: value }).then()
  }

  // --- 图谱构建 ---

  const handleGraphChange = (field: keyof GraphSettings, value: unknown): void => {
    if (!settings) return
    updateSettings({ graph: { ...settings.graph, [field]: value } }).then()
  }

  // --- 对话 ---

  const handleChatChange = (field: keyof ChatSettings, value: unknown): void => {
    if (!settings) return
    updateSettings({ chat: { ...settings.chat, [field]: value } }).then()
  }

  if (!settings) {
    return (
      <div className="h-full flex-1 flex flex-row gap-2.5">
        <main
          className="w-full flex items-center justify-center"
          style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}
        >
          <LoadingOutlined spin className="text-2xl text-gray-400" />
        </main>
      </div>
    )
  }

  return (
    <div className="h-full flex-1 flex flex-row gap-2.5">
      <main
        className="w-full flex flex-col p-6 overflow-auto custom-scrollbar"
        style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold m-0">系统设置</h2>
          <p className="text-sm text-gray-500 mt-1">
            管理应用的全局配置，设置项保存在本地且跨会话持久化
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* 左列 */}
          <div className="flex flex-col gap-4">
            {/* ======== 锁屏设置 ======== */}
            <Card
              title={
                <Space>
                  <LockOutlined />
                  锁屏设置
                </Space>
              }
              size="small"
              variant="borderless"
              style={{ background: '#fafafa' }}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-medium">启用锁屏</div>
                    <div className="text-xs text-gray-500">关闭后锁屏功能将失效</div>
                  </div>
                  <Switch checked={settings.lock.view} onChange={handleLockViewChange} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">锁屏密码</div>
                    <div className="text-xs text-gray-500">6位纯数字密码，修改后旧密码将失效</div>
                  </div>
                  <Button size="small" onClick={() => setPasswordModalOpen(true)}>
                    修改密码
                  </Button>
                </div>
              </div>
            </Card>

            {/* ======== 默认 Embedding 模型 ======== */}
            <Card
              title={
                <Space>
                  <ApiOutlined />
                  默认 Embedding 模型
                </Space>
              }
              size="small"
              variant="borderless"
              style={{ background: '#fafafa' }}
            >
              <Form layout="vertical" size="small">
                <Form.Item
                  label="Embedding 模型"
                  tooltip="用于文本向量化嵌入的模型，仅显示标记为 Embedding 标签的供应商"
                >
                  <Select
                    placeholder="未设置 Embedding 模型"
                    value={settings.defaultEmbeddingModelId}
                    onChange={handleEmbeddingModelChange}
                    options={embeddingProviders.map((p) => ({
                      value: p.id,
                      label: `${p.name}: ${p.model}`
                    }))}
                    notFoundContent={
                      <span className="text-gray-400">
                        暂无 Embedding 模型，请先在供应商设置中添加
                      </span>
                    }
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Form>
            </Card>
            {/* ======== 对话设置 ======== */}
            <Card
              title="对话设置"
              size="small"
              variant="borderless"
              style={{ background: '#fafafa' }}
            >
              <Form layout="vertical" size="small">
                <Form.Item
                  label="工具调用最大轮次"
                  tooltip="AI 对话中模型调用工具的最大次数，防止无限循环"
                >
                  <InputNumber
                    min={1}
                    max={20}
                    value={settings.chat.maxIterations}
                    onChange={(v) => v !== null && handleChatChange('maxIterations', v)}
                    style={{ width: 120 }}
                  />
                </Form.Item>
              </Form>
            </Card>
            {/* ======== 系统信息 ======== */}
            <Card
              title="系统信息"
              size="small"
              variant="borderless"
              style={{ background: '#fafafa' }}
            >
              <Descriptions column={1} size="small">
                <Descriptions.Item label="本机 IP">
                  {(settings.ip?.query as string) || <span className="text-gray-400">未获取</span>}
                </Descriptions.Item>
                <Descriptions.Item label="本机位置">
                  {settings.ip?.city ? (
                    `${settings.ip.country as string} ${settings.ip.regionName as string} ${settings.ip.city as string}`
                  ) : (
                    <span className="text-gray-400">未获取</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="运营商">
                  {(settings.ip?.isp as string) || <span className="text-gray-400">未获取</span>}
                </Descriptions.Item>
                <Descriptions.Item label="API Key 加密">
                  <span className="text-green-600">AES-256-GCM（机器唯一密钥）</span>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </div>
          {/* 右列  */}
          <div className="flex flex-col gap-4">
            {/* ======== 图谱构建设置 ======== */}
            <Card
              title="图谱构建设置"
              size="small"
              variant="borderless"
              style={{ background: '#fafafa' }}
            >
              <Form layout="vertical" size="small">
                <Form.Item
                  label="最大并发 LLM 调用数"
                  tooltip="构建知识图谱时同时进行的 LLM 请求数量，值越大构建越快但对 API 压力也越大"
                >
                  <InputNumber
                    min={1}
                    max={32}
                    value={settings.graph.maxConcurrency}
                    onChange={(v) => v !== null && handleGraphChange('maxConcurrency', v)}
                    style={{ width: 120 }}
                  />
                </Form.Item>

                <Form.Item
                  label="Gleaning 二次扫描"
                  tooltip="实体抽取后再扫描一次，确保遗漏的实体也被发现（笔记数量 ≤ 阈值时执行）"
                >
                  <Space>
                    <Switch
                      checked={settings.graph.enableGleaning}
                      onChange={(v) => handleGraphChange('enableGleaning', v)}
                    />
                    <span className="text-xs text-gray-500">
                      {settings.graph.enableGleaning ? '已启用' : '已禁用'}
                    </span>
                  </Space>
                </Form.Item>

                <Form.Item
                  label="Gleaning 笔记数阈值"
                  tooltip="仅当知识库笔记总数不超过此阈值时才执行 Gleaning，超出则跳过以节省时间"
                >
                  <InputNumber
                    min={0}
                    max={500}
                    value={settings.graph.gleaningThreshold}
                    onChange={(v) => v !== null && handleGraphChange('gleaningThreshold', v)}
                    style={{ width: 120 }}
                    disabled={!settings.graph.enableGleaning}
                  />
                </Form.Item>

                <Form.Item
                  label="文本分块大小"
                  tooltip="Markdown 文本按标题层级分块时每块的最大字符数"
                >
                  <InputNumber
                    min={500}
                    max={10000}
                    step={100}
                    value={settings.graph.maxChunkSize}
                    onChange={(v) => v !== null && handleGraphChange('maxChunkSize', v)}
                    style={{ width: 140 }}
                  />
                </Form.Item>
              </Form>
              <Form layout="vertical" size="small">
                <Form.Item
                  label="图谱构建使用模型"
                  tooltip="构建知识图谱时默认使用的大模型，留空则使用供应商默认设置"
                >
                  <Select
                    placeholder="使用供应商默认设置"
                    value={settings.defaultModelId}
                    onChange={handleDefaultModelChange}
                    options={providers.map((p) => ({
                      value: p.id,
                      label: `${p.name}: ${p.model}`
                    }))}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Form>
            </Card>
          </div>
        </div>

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
          width={360}
          destroyOnClose
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
              <Input.OTP
                length={6}
                formatter={(str) => str.replace(/\D/g, '')}
                inputMode="numeric"
              />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { pattern: /^\d{6}$/, message: '密码必须为6位纯数字' }
              ]}
            >
              <Input.OTP
                length={6}
                formatter={(str) => str.replace(/\D/g, '')}
                inputMode="numeric"
              />
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
              <Input.OTP
                length={6}
                formatter={(str) => str.replace(/\D/g, '')}
                inputMode="numeric"
              />
            </Form.Item>
          </Form>
        </Modal>
      </main>
    </div>
  )
}

export default Index
