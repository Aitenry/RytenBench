import React, { useState, useEffect, useCallback } from 'react'
import {
  theme,
  App,
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
  Tooltip,
  Checkbox
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  DownloadOutlined,
  OpenAIFilled,
  DeepSeekFilled,
  OllamaFilled,
  MistralFilled,
  AnthropicFilled,
  GeminiFilled
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import {
  type LlmProviderConfig,
  type LlmProviderInput,
  type ModelMetadata,
  type FetchedModel
} from '@renderer/types/provider'
import {
  CAPABILITY_OPTIONS,
  CAPABILITY_BADGES,
  MODEL_TYPE_LABELS,
  getCapabilities,
  getProviderDisplayName,
  isEmbeddingProvider
} from '@renderer/utils/providerMeta'
import { SettingsPageHeader, SettingsSection } from './settings-ui'

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

/** 判断是否为向量/嵌入模型：由元数据（type/supports_embeddings）或名称/模型名兜底 */
const isEmbeddingModel = (p: LlmProviderConfig): boolean => isEmbeddingProvider(p)

/** 模型元数据简述（表格列 / 拉取列表复用，不展示模型名称） */
const MetaSummary: React.FC<{ metadata: ModelMetadata | null }> = ({ metadata }) => {
  const {
    token: { colorTextTertiary }
  } = theme.useToken()
  if (!metadata) {
    return <span style={{ color: colorTextTertiary, fontSize: 12 }}>未填写</span>
  }
  const caps = getCapabilities(metadata)
  const typeLabel = metadata.type ? (MODEL_TYPE_LABELS[metadata.type] ?? metadata.type) : null
  const badges = CAPABILITY_BADGES.filter((b) => caps[b.key] === true)
  return (
    <Space size={4} wrap>
      {typeLabel ? <Tag style={{ margin: 0, fontSize: 11 }}>{typeLabel}</Tag> : null}
      {badges.map((b) => (
        <Tag key={b.key} style={{ margin: 0, fontSize: 11 }} color="blue">
          {b.label}
        </Tag>
      ))}
    </Space>
  )
}

const ModelSettings: React.FC = () => {
  const {
    token: { colorTextSecondary }
  } = theme.useToken()

  const { modal } = App.useApp()
  const { viewMessage } = useMessage()

  const [providers, setProviders] = useState<LlmProviderConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LlmProviderConfig | null>(null)
  const [form] = Form.useForm()

  // 拉取模型模态框
  const [fetchModalOpen, setFetchModalOpen] = useState(false)
  const [fetchProviderType, setFetchProviderType] = useState('ollama')
  const [fetchBaseUrl, setFetchBaseUrl] = useState('http://localhost:11434')
  const [fetchApiKey, setFetchApiKey] = useState('')
  const [fetchModels, setFetchModels] = useState<FetchedModel[]>([])
  const [fetchLoading, setFetchLoading] = useState(false)
  const [checkedModels, setCheckedModels] = useState<string[]>([])
  const [addingModels, setAddingModels] = useState(false)

  const watchedCaps: string[] = (Form.useWatch('metadata_capabilities', form) as string[]) || []
  const watchedType: string | undefined = Form.useWatch('metadata_type', form)
  // 表单中是否将模型配置为嵌入模型（用于禁用“设为默认”）
  const isEmbeddingInForm =
    watchedType === 'embedding' || watchedCaps.includes('supports_embeddings')

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
      metadata_display_name: '',
      metadata_vendor: '',
      metadata_type: undefined,
      metadata_capabilities: [],
      metadata_context_window: null,
      metadata_max_output_tokens: null,
      is_enabled: true,
      is_default: false,
      sort_order: 0
    })
    setModalOpen(true)
  }

  const openEditModal = (record: LlmProviderConfig): void => {
    setEditingProvider(record)
    const meta = record.metadata ?? {}
    const caps = getCapabilities(record.metadata)
    form.setFieldsValue({
      name: getProviderDisplayName(record),
      provider: record.provider,
      base_url: record.base_url,
      api_key: record.api_key || '',
      model: record.model,
      temperature: record.temperature,
      max_tokens: record.max_tokens,
      metadata_display_name: typeof meta.display_name === 'string' ? meta.display_name : '',
      metadata_vendor: typeof meta.vendor === 'string' ? meta.vendor : '',
      metadata_type: typeof meta.type === 'string' ? meta.type : undefined,
      metadata_capabilities: CAPABILITY_OPTIONS.filter((o) => caps[o.key]).map((o) => o.key),
      metadata_context_window: typeof meta.context_window === 'number' ? meta.context_window : null,
      metadata_max_output_tokens:
        typeof meta.max_output_tokens === 'number' ? meta.max_output_tokens : null,
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

  /** 由表单字段组装元数据对象：保留已有档案字段，覆盖用户编辑项；全空时返回 null */
  const buildMetadata = (
    values: Record<string, unknown>,
    existing: ModelMetadata | null
  ): ModelMetadata | null => {
    const base = existing ? { ...existing } : {}
    const currentCaps: Record<string, boolean> = {
      ...(existing?.capabilities && typeof existing.capabilities === 'object'
        ? (existing.capabilities as Record<string, boolean>)
        : {})
    }
    const selectedCaps = ((values.metadata_capabilities as string[]) ?? []).filter(Boolean)
    for (const opt of CAPABILITY_OPTIONS) {
      const key = opt.key as string
      currentCaps[key] = selectedCaps.includes(key)
    }

    const displayName =
      typeof values.metadata_display_name === 'string' ? values.metadata_display_name.trim() : ''
    const vendor = typeof values.metadata_vendor === 'string' ? values.metadata_vendor.trim() : ''
    const type = typeof values.metadata_type === 'string' ? values.metadata_type.trim() : ''
    const ctx = values.metadata_context_window as number | null | undefined
    const maxOut = values.metadata_max_output_tokens as number | null | undefined

    const metadata: ModelMetadata = { ...base, capabilities: currentCaps }
    if (displayName) metadata.display_name = displayName
    else delete metadata.display_name
    if (vendor) metadata.vendor = vendor
    else delete metadata.vendor
    if (type) metadata.type = type
    else delete metadata.type
    if (ctx != null && ctx > 0) metadata.context_window = ctx
    else delete metadata.context_window
    if (maxOut != null && maxOut > 0) metadata.max_output_tokens = maxOut
    else delete metadata.max_output_tokens

    const meaningful =
      displayName.length > 0 ||
      vendor.length > 0 ||
      type.length > 0 ||
      (ctx != null && ctx > 0) ||
      (maxOut != null && maxOut > 0) ||
      CAPABILITY_OPTIONS.some((o) => currentCaps[o.key])
    return meaningful ? metadata : null
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
        metadata: buildMetadata(values, editingProvider?.metadata ?? null),
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
      const provider = providers.find((p) => p.id === id)
      if (provider && isEmbeddingModel(provider)) {
        viewMessage(msgKey, 'error', '向量（Embedding）模型不能设为默认聊天模型')
        return
      }
      viewMessage(msgKey, 'loading', '正在设置默认供应商...')
      await (window as unknown as Window).api.providers.setDefault(id)
      viewMessage(msgKey, 'success', '默认供应商已更新', 2)
      await loadProviders()
    } catch (error) {
      viewMessage(msgKey, 'error', `设置失败: ${error}`)
    }
  }

  // 拉取模型
  const handleFetchModels = async (): Promise<void> => {
    setFetchLoading(true)
    setFetchModels([])
    setCheckedModels([])
    try {
      const result = (await (window as unknown as Window).api.providers.fetchModels(
        fetchProviderType,
        fetchBaseUrl || undefined,
        fetchApiKey || undefined
      )) as FetchedModel[]
      // 过滤掉已存在的模型
      const existingIds = new Set(providers.map((p) => p.model))
      const newModels = result.filter((m) => !existingIds.has(m.id))
      setFetchModels(newModels)
      // 默认勾选档案中为文本生成（或档案缺失）的模型，跳过图像生成等非对话模型；
      // 无档案的模型也可添加，之后由用户在编辑表单中自行填写元数据
      setCheckedModels(
        newModels
          .filter((m) => !m.metadata || m.metadata.type === 'text-generation')
          .map((m) => m.id)
      )
    } catch (error) {
      viewMessage('fetch-models', 'error', `拉取失败: ${error}`)
    } finally {
      setFetchLoading(false)
    }
  }

  const handleProviderTypeChangeForFetch = (type: string): void => {
    setFetchProviderType(type)
    const config = PROVIDER_TYPES.find((t) => t.value === type)
    if (config?.baseURL) {
      setFetchBaseUrl(config.baseURL)
      setFetchApiKey('')
    } else {
      setFetchBaseUrl('')
    }
  }

  // 一键添加选中的模型（携带拉取时推导出的能力标签）
  const handleBatchAdd = async (): Promise<void> => {
    const msgKey = 'batch-add'
    if (checkedModels.length === 0) {
      viewMessage(msgKey, 'warning', '请至少选择一个模型')
      return
    }
    const metaMap = new Map(fetchModels.map((m) => [m.id, m.metadata]))
    setAddingModels(true)
    try {
      let added = 0
      for (const modelId of checkedModels) {
        try {
          await (window as unknown as Window).api.providers.create({
            name: modelId,
            provider: fetchProviderType,
            base_url: fetchBaseUrl || undefined,
            api_key: fetchApiKey || undefined,
            model: modelId,
            metadata: metaMap.get(modelId) ?? null,
            is_enabled: true,
            is_default: false
          })
          added++
        } catch (err) {
          console.error(`Failed to add model ${modelId}:`, err)
        }
      }
      viewMessage(msgKey, 'success', `成功添加 ${added} 个模型`, 3)
      setFetchModalOpen(false)
      await loadProviders()
    } catch (error) {
      viewMessage(msgKey, 'error', `批量添加失败: ${error}`)
    } finally {
      setAddingModels(false)
    }
  }

  const columns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (_text: string, record: LlmProviderConfig) => (
        <Space>
          <ProviderLogo provider={record.provider} />
          <span>{getProviderDisplayName(record)}</span>
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
      title: '元数据',
      dataIndex: 'metadata',
      key: 'metadata',
      width: 220,
      render: (metadata: ModelMetadata | null) => <MetaSummary metadata={metadata} />
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
          ) : isEmbeddingModel(record) ? null : (
            <Popconfirm
              title="设为默认模型？"
              description="对话框将默认选中该模型进行问答"
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
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  modal.confirm({
                    title: '确定删除此供应商？',
                    content: `删除后「${record.name}」将不再可用，此操作不可撤销。`,
                    okText: '删除',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () => handleDelete(record.id)
                  })
                }}
              />
            </Tooltip>
          )}
        </Space>
      )
    }
  ]

  return (
    <div>
      <SettingsPageHeader
        title="大模型供应商"
        description="管理 AI 聊天和知识图谱使用的模型供应商配置"
        extra={
          <div className="flex items-center" style={{ gap: 8 }}>
            <Button icon={<DownloadOutlined />} onClick={() => setFetchModalOpen(true)}>
              拉取模型
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              添加模型
            </Button>
          </div>
        }
      />

      <SettingsSection bodyPadding={0}>
        <Table
          dataSource={providers}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: '暂无供应商，点击右上角按钮添加' }}
          style={{ borderRadius: 12 }}
        />
      </SettingsSection>

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
            metadata_capabilities: [],
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
            name="metadata_display_name"
            label="显示名称"
            tooltip="模型档案中的展示名称，未填写时使用模型名称"
          >
            <Input placeholder="例如：GPT-5.6 Sol" />
          </Form.Item>

          <Space size="middle" className="w-full">
            <Form.Item name="metadata_vendor" label="厂商" style={{ width: 160 }}>
              <Input placeholder="例如：OpenAI" />
            </Form.Item>
            <Form.Item name="metadata_type" label="模型类型" style={{ width: 150 }}>
              <Select
                allowClear
                placeholder="选择类型"
                options={Object.entries(MODEL_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
              />
            </Form.Item>
          </Space>

          <Space size="middle" className="w-full">
            <Form.Item
              name="metadata_context_window"
              label="上下文 (tokens)"
              style={{ width: 160 }}
            >
              <InputNumber min={0} step={1000} style={{ width: '100%' }} placeholder="未知" />
            </Form.Item>
            <Form.Item
              name="metadata_max_output_tokens"
              label="最大输出 (tokens)"
              style={{ width: 160 }}
            >
              <InputNumber min={1} style={{ width: '100%' }} placeholder="未知" />
            </Form.Item>
          </Space>

          <Form.Item
            name="metadata_capabilities"
            label="能力"
            tooltip="能力来自 models-profile.json 档案；未收录的模型可在此自行勾选。嵌入能力勾选后不能设为默认聊天模型"
          >
            <Select
              mode="multiple"
              placeholder="选择模型能力"
              options={CAPABILITY_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              optionFilterProp="label"
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
              tooltip={isEmbeddingInForm ? '向量模型不能设为默认聊天模型' : '只能有一个默认供应商'}
            >
              <Switch disabled={isEmbeddingInForm} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 拉取模型模态框 */}
      <Modal
        title="拉取模型列表"
        open={fetchModalOpen}
        onCancel={() => setFetchModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setFetchModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="add"
            type="primary"
            loading={addingModels}
            disabled={checkedModels.length === 0}
            onClick={handleBatchAdd}
          >
            一键添加 ({checkedModels.length})
          </Button>
        ]}
        width={520}
        destroyOnHidden
        styles={{ body: { maxHeight: 480, padding: 12, overflowY: 'auto' } }}
        classNames={{ body: 'custom-scrollbar' }}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            <Select
              value={fetchProviderType}
              options={PROVIDER_TYPES}
              onChange={handleProviderTypeChangeForFetch}
              style={{ width: 180 }}
              placeholder="选择供应商类型"
            />
            <Input
              placeholder="API 地址"
              value={fetchBaseUrl}
              onChange={(e) => setFetchBaseUrl(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
          </Space>

          {fetchProviderType !== 'ollama' && (
            <Input.Password
              placeholder="API Key（可选）"
              value={fetchApiKey}
              onChange={(e) => setFetchApiKey(e.target.value)}
              allowClear
            />
          )}

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={fetchLoading}
            onClick={handleFetchModels}
            block
          >
            获取模型列表
          </Button>

          {fetchModels.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span style={{ color: colorTextSecondary, fontSize: 13 }}>
                  共 {fetchModels.length} 个模型
                </span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setCheckedModels(fetchModels.map((m) => m.id))}
                >
                  全选
                </Button>
              </div>
              <Checkbox.Group
                value={checkedModels}
                onChange={(vals) => setCheckedModels(vals as string[])}
                style={{ width: '100%' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {fetchModels.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: '4px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                    >
                      <Checkbox value={m.id} style={{ minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ wordBreak: 'break-all' }}>{m.id}</span>
                      </Checkbox>
                      <span
                        style={{
                          flexShrink: 0,
                          display: 'flex',
                          gap: 4,
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                          maxWidth: 260
                        }}
                      >
                        {m.metadata ? (
                          <MetaSummary metadata={m.metadata} />
                        ) : (
                          <span style={{ color: colorTextSecondary, fontSize: 12 }}>
                            暂无元数据（添加后可编辑填写）
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </Checkbox.Group>
            </div>
          )}

          {!fetchLoading && fetchModels.length === 0 && (
            <div className="text-center py-6" style={{ color: colorTextSecondary }}>
              暂无新模型（已存在的模型自动跳过）
            </div>
          )}
        </Space>
      </Modal>
    </div>
  )
}

export default ModelSettings
