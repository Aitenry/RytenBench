import React, { useState, useEffect, useCallback } from 'react'
import {
  theme,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Tag,
  Popconfirm,
  Space,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  OpenAIFilled,
  DeepSeekFilled,
  OllamaFilled,
  MistralFilled,
  AnthropicFilled,
  GeminiFilled
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { LlmProviderConfig, LlmProviderInput } from '@renderer/types/provider'

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', color: '#10a37f' },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    color: '#4d6bfe'
  },
  { value: 'ollama', label: 'Ollama', baseURL: 'http://localhost:11434', color: '#000000' },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    color: '#6366f1'
  },
  { value: 'mistral', label: 'Mistral AI', baseURL: 'https://api.mistral.ai/v1', color: '#f90' },
  { value: 'xai', label: 'xAI (Grok)', baseURL: 'https://api.x.ai/v1', color: '#1d9bf0' },
  {
    value: 'anthropic',
    label: 'Anthropic',
    baseURL: 'https://api.anthropic.com',
    color: '#d97757'
  },
  {
    value: 'google-genai',
    label: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com',
    color: '#4285f4'
  },
  { value: 'google-vertexai', label: 'Google Vertex AI', baseURL: '' },
  { value: 'aws-bedrock', label: 'AWS Bedrock', baseURL: '' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI', baseURL: '' },
  { value: 'custom', label: '自定义', baseURL: '' }
]

const getProviderConfig = (provider: string): (typeof PROVIDER_TYPES)[number] | undefined =>
  PROVIDER_TYPES.find((t) => t.value === provider)

// provider → @ant-design/icons 映射，无对应图标则为 null（降级为文字首字母）
const providerIconMap: Record<string, React.ComponentType<{ style?: React.CSSProperties }> | null> =
  {
    openai: OpenAIFilled,
    deepseek: DeepSeekFilled,
    ollama: OllamaFilled,
    mistral: MistralFilled,
    anthropic: AnthropicFilled,
    'google-genai': GeminiFilled
  }

const ProviderLogo: React.FC<{ provider: string; size?: number }> = ({ provider, size = 20 }) => {
  const Icon = providerIconMap[provider]
  if (Icon) {
    return <Icon style={{ fontSize: size }} />
  }
  // 没有 logo 的降级为文字首字母
  const cfg = getProviderConfig(provider)
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: cfg?.color || '#999',
        color: '#fff',
        fontSize: size * 0.55
      }}
    >
      {(cfg?.label || provider).charAt(0)}
    </span>
  )
}

const MODEL_TAGS = [
  { value: 'embedding', label: 'Embedding', color: 'purple' },
  { value: 'vision', label: 'Vision', color: 'cyan' },
  { value: 'tools', label: 'Tools', color: 'green' },
  { value: 'thinking', label: 'Thinking', color: 'orange' }
]

const ModelSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [providers, setProviders] = useState<LlmProviderConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LlmProviderConfig | null>(null)
  const [form] = Form.useForm()

  const watchedTags: string[] = (Form.useWatch('tags', form) as string[]) || []

  const loadProviders = useCallback(async () => {
    const msgKey = 'providers-load'
    try {
      setLoading(true)
      const result = await (window as unknown as Window).api.providers.getAll()
      setProviders(result)
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [viewMessage])

  useEffect(() => {
    loadProviders().then()
  }, [loadProviders])

  const openCreateModal = (): void => {
    setEditingProvider(null)
    form.resetFields()
    form.setFieldsValue({
      provider: 'deepseek',
      temperature: 0.7,
      tags: [],
      is_enabled: true,
      is_default: false,
      sort_order: 0
    })
    setModalOpen(true)
  }

  const openEditModal = (record: LlmProviderConfig): void => {
    setEditingProvider(record)
    form.setFieldsValue({
      name: record.name,
      provider: record.provider,
      base_url: record.base_url,
      api_key: record.api_key || '',
      model: record.model,
      temperature: record.temperature,
      max_tokens: record.max_tokens,
      tags: record.tags || [],
      is_enabled: record.is_enabled,
      is_default: record.is_default,
      sort_order: record.sort_order
    })
    setModalOpen(true)
  }

  const handleProviderTypeChange = (providerType: string): void => {
    const config = PROVIDER_TYPES.find((t) => t.value === providerType)
    if (config && config.baseURL && !form.getFieldValue('base_url')) {
      form.setFieldsValue({ base_url: config.baseURL })
    }
  }

  const handleSubmit = async (): Promise<void> => {
    const msgKey = 'provider-save'
    try {
      const values = await form.validateFields()

      const input: LlmProviderInput = {
        name: values.name as string,
        provider: values.provider as string,
        base_url: (values.base_url as string) || undefined,
        model: values.model as string,
        temperature: values.temperature as number | undefined,
        max_tokens: values.max_tokens as number | null | undefined,
        tags: (values.tags as string[]) ?? [],
        is_enabled: values.is_enabled as boolean | undefined,
        is_default: values.is_default as boolean | undefined,
        sort_order: values.sort_order as number | undefined
      }

      if (editingProvider) {
        if (values.api_key) {
          input.api_key = values.api_key as string
        }
        viewMessage(msgKey, 'loading', '正在更新供应商...')
        await (window as unknown as Window).api.providers.update(editingProvider.id, input)
        viewMessage(msgKey, 'success', '供应商已更新', 2)
      } else {
        input.api_key = (values.api_key as string) || null
        viewMessage(msgKey, 'loading', '正在创建供应商...')
        await (window as unknown as Window).api.providers.create(input)
        viewMessage(msgKey, 'success', '供应商已创建', 2)
      }

      setModalOpen(false)
      form.resetFields()
      setEditingProvider(null)
      await loadProviders()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      viewMessage(msgKey, 'error', `操作失败: ${error}`)
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    const msgKey = 'provider-delete'
    try {
      viewMessage(msgKey, 'loading', '正在删除...')
      await (window as unknown as Window).api.providers.delete(id)
      viewMessage(msgKey, 'success', '已删除', 2)
      await loadProviders()
    } catch (error) {
      viewMessage(msgKey, 'error', `删除失败: ${error}`)
    }
  }

  const handleSetDefault = async (id: number): Promise<void> => {
    const msgKey = 'provider-default'
    try {
      viewMessage(msgKey, 'loading', '正在设置默认供应商...')
      await (window as unknown as Window).api.providers.setDefault(id)
      viewMessage(msgKey, 'success', '默认供应商已更新', 2)
      await loadProviders()
    } catch (error) {
      viewMessage(msgKey, 'error', `设置失败: ${error}`)
    }
  }

  const columns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: LlmProviderConfig) => (
        <Space>
          <ProviderLogo provider={record.provider} />
          <span>{text}</span>
          {record.is_default && (
            <Tag color="gold" style={{ margin: 0 }}>
              默认
            </Tag>
          )}
        </Space>
      )
    },
    {
      title: '服务商',
      dataIndex: 'provider',
      key: 'provider',
      width: 120,
      render: (type: string) => getProviderConfig(type)?.label || type
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      align: 'center' as const,
      render: (_: unknown, record: LlmProviderConfig) => (
        <Space size={4}>
          {record.is_default ? (
            <Tooltip title="当前已是默认">
              <Button type="text" size="small" icon={<StarFilled style={{ color: '#faad14' }} />} />
            </Tooltip>
          ) : (
            <Popconfirm
              title="设为默认供应商？"
              description="对话框和知识图谱将使用此供应商"
              onConfirm={() => handleSetDefault(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Tooltip title="设为默认">
                <Button type="text" size="small" icon={<StarOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          {!record.is_default && (
            <Popconfirm
              title="确定删除此供应商？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
            大模型供应商
          </h3>
          <p className="text-sm mt-1" style={{ color: colorTextSecondary }}>
            管理 AI 聊天和知识图谱使用的模型供应商配置
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          添加模型
        </Button>
      </div>

      <Table
        dataSource={providers}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        locale={{ emptyText: '暂无供应商，点击上方按钮添加' }}
      />

      <Modal
        title={editingProvider ? `编辑供应商 — ${editingProvider.name}` : '添加供应商'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          form.resetFields()
          setEditingProvider(null)
        }}
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnHidden
        styles={{ body: { maxHeight: 420, padding: 12, overflowY: 'auto' } }}
        classNames={{ body: 'custom-scrollbar' }}
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
          initialValues={{
            provider: 'deepseek',
            temperature: 0.7,
            tags: [],
            is_enabled: true,
            is_default: false,
            sort_order: 0
          }}
        >
          <Form.Item
            name="name"
            label="模型名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="例如：DeepSeek、本地 Ollama" />
          </Form.Item>

          <Form.Item
            name="provider"
            label="接口协议"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select
              options={PROVIDER_TYPES}
              onChange={handleProviderTypeChange}
              placeholder="选择供应商类型"
              showSearch={{
                filterOption: (input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }}
            />
          </Form.Item>

          <Form.Item
            name="model"
            label="模型ID"
            rules={[{ required: true, message: '请输入模型ID' }]}
          >
            <Input placeholder="例如：gpt-4o、deepseek-v4-flash、llama3.1" />
          </Form.Item>

          <Form.Item
            name="tags"
            label="模型标签"
            tooltip="Embedding 模型只能选择 Embedding 标签，其他标签互不影响"
          >
            <Select
              mode="multiple"
              placeholder="选择模型能力标签"
              options={MODEL_TAGS.map((t) => {
                const hasEmbedding = watchedTags.includes('embedding')
                const hasOther = watchedTags.some((tag) => tag !== 'embedding')
                return {
                  value: t.value,
                  label: t.label,
                  disabled:
                    (t.value === 'embedding' && hasOther) ||
                    (t.value !== 'embedding' && hasEmbedding)
                }
              })}
            />
          </Form.Item>

          <Form.Item
            name="base_url"
            label="API 地址"
            tooltip="OpenAI 兼容的 API 端点，选类型后自动填充"
          >
            <Input placeholder="https://api.deepseek.com/v1" />
          </Form.Item>

          <Form.Item
            name="api_key"
            label="API Key"
            tooltip={editingProvider ? '留空则保持原有密钥不变' : '密钥将使用本机唯一私钥加密存储'}
          >
            <Input.Password
              placeholder={editingProvider ? '留空保持原密钥' : 'sk-xxxxxxxx'}
              allowClear
            />
          </Form.Item>

          <Space size="middle" className="w-full">
            <Form.Item name="temperature" label="温度" style={{ width: 140 }}>
              <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item name="max_tokens" label="最大 Token">
              <InputNumber min={1} placeholder="不限制" style={{ width: 130 }} />
            </Form.Item>

            <Form.Item name="sort_order" label="排序">
              <InputNumber min={0} style={{ width: 80 }} />
            </Form.Item>
          </Space>

          <Space size="large">
            <Form.Item name="is_enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item
              name="is_default"
              label="设为默认"
              valuePropName="checked"
              tooltip="只能有一个默认供应商"
            >
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  )
}

export default ModelSettings
