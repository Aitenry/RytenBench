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
  KeyOutlined
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'

// 供应商类型与 @langchain 包名映射，直接复用 mapper 中的 CHECK 约束值
const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1' },
  { value: 'ollama', label: 'Ollama', baseURL: 'http://localhost:11434' },
  { value: 'openrouter', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1' },
  { value: 'mistral', label: 'Mistral AI', baseURL: 'https://api.mistral.ai/v1' },
  { value: 'xai', label: 'xAI (Grok)', baseURL: 'https://api.x.ai/v1' },
  { value: 'anthropic', label: 'Anthropic', baseURL: 'https://api.anthropic.com' },
  {
    value: 'google-genai',
    label: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com'
  },
  { value: 'google-vertexai', label: 'Google Vertex AI', baseURL: '' },
  { value: 'aws-bedrock', label: 'AWS Bedrock', baseURL: '' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI', baseURL: '' },
  { value: 'custom', label: '自定义', baseURL: '' }
]

// 模型标签定义
const MODEL_TAGS = [
  { value: 'embedding', label: 'Embedding', color: 'purple' },
  { value: 'vision', label: 'Vision', color: 'cyan' },
  { value: 'tools', label: 'Tools', color: 'green' },
  { value: 'thinking', label: 'Thinking', color: 'orange' }
]

const TAG_COLOR_MAP: Record<string, string> = Object.fromEntries(
  MODEL_TAGS.map((t) => [t.value, t.color])
)

interface LlmProviderConfig {
  id: number
  name: string
  provider: string
  base_url: string | null
  api_key: string | null
  model: string
  temperature: number
  max_tokens: number | null
  extra_config: Record<string, unknown> | null
  tags: string[] | null
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

interface LlmProviderInput {
  name: string
  provider: string
  base_url?: string | null
  api_key?: string | null
  model: string
  temperature?: number
  max_tokens?: number | null
  extra_config?: Record<string, unknown> | null
  tags?: string[] | null
  is_default?: boolean
  is_enabled?: boolean
  sort_order?: number
}

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [providers, setProviders] = useState<LlmProviderConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LlmProviderConfig | null>(null)
  const [form] = Form.useForm()

  // 监听 tags 字段变化，用于动态禁用选项
  const watchedTags: string[] = (Form.useWatch('tags', form) as string[]) || []

  // --- 数据加载 ---

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

  // --- 增/改 ---

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

      // 编辑时不传 api_key 意味着保持原密钥；新建时传 null
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

  // --- 删 ---

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

  // --- 设为默认 ---

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

  // --- Table 列定义 ---

  const providerTypeLabel = (type: string): string =>
    PROVIDER_TYPES.find((t) => t.value === type)?.label || type

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (text: string, record: LlmProviderConfig) => (
        <Space>
          {text}
          {record.is_default && (
            <Tag color="gold" style={{ margin: 0 }}>
              默认
            </Tag>
          )}
        </Space>
      )
    },
    {
      title: '类型',
      dataIndex: 'provider',
      key: 'provider',
      width: 130,
      render: (type: string) => <Tag color="blue">{providerTypeLabel(type)}</Tag>
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 180,
      ellipsis: true
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 160,
      render: (tags: string[] | null) =>
        tags && tags.length > 0 ? (
          <Space size={4} wrap>
            {tags.map((tag) => (
              <Tag key={tag} color={TAG_COLOR_MAP[tag] || 'default'}>
                {tag}
              </Tag>
            ))}
          </Space>
        ) : (
          <span className="text-gray-400">—</span>
        )
    },
    {
      title: 'API 地址',
      dataIndex: 'base_url',
      key: 'base_url',
      width: 240,
      ellipsis: true,
      render: (url: string | null) => url || <span className="text-gray-400">—</span>
    },
    {
      title: '温度',
      dataIndex: 'temperature',
      key: 'temperature',
      width: 70,
      align: 'center' as const
    },
    {
      title: 'API Key',
      dataIndex: 'api_key',
      key: 'api_key',
      width: 100,
      align: 'center' as const,
      render: (key: string | null) =>
        key ? (
          <Tooltip title="密钥已加密存储">
            <KeyOutlined className="text-green-500" />
          </Tooltip>
        ) : (
          <span className="text-gray-400">—</span>
        )
    },
    {
      title: '启用',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      width: 60,
      align: 'center' as const,
      render: (_: boolean, record: LlmProviderConfig) => (
        <Tooltip title={record.is_enabled ? '已启用' : '已禁用'}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${record.is_enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          />
        </Tooltip>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
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
    <div className="h-full flex-1 flex flex-row gap-2.5">
      <main
        className="w-full flex flex-col p-6"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold m-0">大模型供应商</h2>
            <p className="text-sm text-gray-500 mt-1">
              管理 AI 聊天和知识图谱使用的模型供应商配置，API Key 使用机器唯一密钥加密存储
            </p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            添加供应商
          </Button>
        </div>

        {/* 表格 */}
        <Table
          dataSource={providers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: '暂无供应商，点击上方按钮添加' }}
          scroll={{ x: 1100 }}
          className="flex-1"
        />

        {/* 新增/编辑弹窗 */}
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
          width={560}
          destroyOnClose
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
              label="供应商名称"
              rules={[{ required: true, message: '请输入名称' }]}
            >
              <Input placeholder="例如：DeepSeek、本地 Ollama" />
            </Form.Item>

            <Form.Item
              name="provider"
              label="供应商类型"
              rules={[{ required: true, message: '请选择类型' }]}
            >
              <Select
                options={PROVIDER_TYPES}
                onChange={handleProviderTypeChange}
                placeholder="选择供应商类型"
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>

            <Form.Item
              name="model"
              label="模型名称"
              rules={[{ required: true, message: '请输入模型名' }]}
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
              tooltip={
                editingProvider ? '留空则保持原有密钥不变' : '密钥将使用本机唯一私钥加密存储'
              }
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
      </main>
    </div>
  )
}

export default Index
