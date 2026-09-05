import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  theme,
  App,
  Tree,
  Spin,
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
  Checkbox,
  Collapse,
  type TreeDataNode
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
  GeminiFilled,
  CheckSquareOutlined,
  MinusSquareOutlined
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
import { SettingsPageHeader, SettingsSection } from './SettingsUI'
import ProviderMark from '@renderer/components/provider/provider-mark'

// 预置供应商（value/label/baseURL）；品牌色统一在 providerMeta.PROVIDER_BRAND_COLORS，避免两处漂移
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
  { value: 'minimax', label: 'MiniMax', baseURL: 'https://api.minimax.io/v1' },
  { value: 'moonshot', label: 'Moonshot Kimi', baseURL: 'https://api.moonshot.cn/v1' },
  {
    value: 'zhipu',
    label: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4'
  },
  {
    value: 'aliyun',
    label: '阿里云百炼',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  { value: 'qianfan', label: '百度千帆', baseURL: 'https://qianfan.baidubce.com/v2' },
  {
    value: 'volcengine',
    label: '火山方舟',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3'
  },
  {
    value: 'tencent',
    label: '腾讯混元',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1'
  },
  { value: 'siliconflow', label: '硅基流动', baseURL: 'https://api.siliconflow.cn/v1' },
  { value: 'groq', label: 'Groq', baseURL: 'https://api.groq.com/openai/v1' },
  { value: 'perplexity', label: 'Perplexity', baseURL: 'https://api.perplexity.ai' },
  { value: 'together', label: 'Together AI', baseURL: 'https://api.together.xyz/v1' },
  { value: 'lmstudio', label: 'LM Studio', baseURL: 'http://localhost:1234/v1' },
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
  // 没有 logo 的降级为「印字号」徽章：等宽 monogram + 发丝边框（品牌色由 providerMeta 统一供给）
  return <ProviderMark providerType={provider} size={size} />
}

/** 判断是否为向量/嵌入模型：由元数据（type/supports_embeddings）或名称/模型名兜底 */
const isEmbeddingModel = (p: LlmProviderConfig): boolean => isEmbeddingProvider(p)

/** 模型元数据简述（树行/拉取列表复用，不展示模型名称）；maxBadges 限制能力徽章数量防止挤行 */
const MetaSummary: React.FC<{ metadata: ModelMetadata | null; maxBadges?: number }> = ({
  metadata,
  maxBadges
}) => {
  const {
    token: { colorTextTertiary }
  } = theme.useToken()
  if (!metadata) {
    return <span style={{ color: colorTextTertiary, fontSize: 12 }}>未填写</span>
  }
  const caps = getCapabilities(metadata)
  const typeLabel = metadata.type ? (MODEL_TYPE_LABELS[metadata.type] ?? metadata.type) : null
  const badges = CAPABILITY_BADGES.filter((b) => caps[b.key] === true)
  const shown = maxBadges != null && badges.length > maxBadges ? badges.slice(0, maxBadges) : badges
  const hidden = badges.length - shown.length
  return (
    <Space size={4} wrap>
      {typeLabel ? <Tag style={{ margin: 0, fontSize: 11 }}>{typeLabel}</Tag> : null}
      {shown.map((b) => (
        <Tag key={b.key} style={{ margin: 0, fontSize: 11 }} color="blue">
          {b.label}
        </Tag>
      ))}
      {hidden > 0 ? (
        <Tag style={{ margin: 0, fontSize: 11 }} color="blue">
          +{hidden}
        </Tag>
      ) : null}
    </Space>
  )
}

const ModelSettings: React.FC = () => {
  const {
    token: { colorTextSecondary, colorTextTertiary, colorSplit }
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
  // 自定义拉取：供应商 ID（全英文小写，仅可包含数字与 -）
  const [fetchCustomProviderId, setFetchCustomProviderId] = useState('')

  // 树形目录：分组展开与勾选状态（勾选用于批量删除）
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [checkedKeys, setCheckedKeys] = useState<React.Key[]>([])
  const [deletingBatch, setDeletingBatch] = useState(false)

  const watchedCaps: string[] = (Form.useWatch('metadata_capabilities', form) as string[]) || []
  const watchedType: string | undefined = Form.useWatch('metadata_type', form)
  const watchedProviderType: string | undefined = Form.useWatch('provider', form)
  const watchedModel: string | undefined = Form.useWatch('model', form)
  // 表单中是否将模型配置为嵌入模型（用于禁用“设为默认”）
  const isEmbeddingInForm =
    watchedType === 'embedding' || watchedCaps.includes('supports_embeddings')

  // 接口协议：单选 Select + 输入任意协议标识。
  // 输入内容不匹配任何预置平台时，实时注入「自定义协议」选项供提交（未知协议按 OpenAI 兼容调用）。
  const [protocolSearch, setProtocolSearch] = useState('')
  const protocolOptions = useMemo(() => {
    const raw = protocolSearch.trim()
    const search = raw.toLowerCase()
    const presets = PROVIDER_TYPES.map((t) => ({
      value: t.value,
      label: `${t.label} (${t.value})`
    }))
    const matchesPreset = presets.some((o) => o.label.toLowerCase().includes(search))
    return raw && !matchesPreset
      ? [{ value: raw, label: `${raw}（自定义协议）` }, ...presets]
      : presets
  }, [protocolSearch])

  // ── 模型档案自动填充（仅「新增」流程）：输入模型 ID 命中 models-profile 即自动补齐元数据 ──
  // 命中状态：idle 未查询 / matched 已命中 / missing 已查询未收录
  const [profileStatus, setProfileStatus] = useState<'idle' | 'matched' | 'missing'>('idle')
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoFillRef = useRef<{ modelId: string; keys: string[] } | null>(null)

  /** 清空自动填充痕迹：仅清除「由自动填充写入、且用户未手改过」的字段 */
  const resetProfileAutofill = useCallback((): void => {
    if (profileTimer.current) {
      clearTimeout(profileTimer.current)
      profileTimer.current = null
    }
    const prev = autoFillRef.current
    autoFillRef.current = null
    setProfileStatus('idle')
    if (!prev || prev.keys.length === 0) return
    const empty: Record<string, unknown> = {}
    for (const key of prev.keys) {
      if (form.isFieldTouched(key)) continue
      if (key === 'name' || key === 'metadata_vendor') empty[key] = ''
      else if (key === 'metadata_type') empty[key] = undefined
      else if (key === 'metadata_capabilities') empty[key] = []
      else empty[key] = null
    }
    form.setFieldsValue(empty)
  }, [form])

  /** 新增：查询官方档案，仅补齐「当前仍为空」的字段（用户已填内容一律不覆盖） */
  const applyProfileAutofill = useCallback(
    async (modelId: string): Promise<void> => {
      try {
        const profile = (await (window as unknown as Window).api.providers.lookupProfile(
          modelId
        )) as ModelMetadata | null
        if (!profile) {
          setProfileStatus('missing')
          return
        }
        // 查询期间用户已继续输入：旧结果作废，等新模型 ID 的下一次查询
        if (form.getFieldValue('model') !== modelId) return
        const cur = form.getFieldsValue()
        const patch: Record<string, unknown> = {}
        const fillIfEmpty = (key: string, value: string | number): void => {
          const now = cur[key]
          const empty = now == null || now === '' || now === 0
          if (empty) patch[key] = value
        }
        if (typeof profile.display_name === 'string' && profile.display_name.trim()) {
          fillIfEmpty('name', profile.display_name.trim())
        }
        if (typeof profile.vendor === 'string' && profile.vendor.trim()) {
          fillIfEmpty('metadata_vendor', profile.vendor.trim())
        }
        if (typeof profile.type === 'string' && profile.type.trim()) {
          fillIfEmpty('metadata_type', profile.type.trim())
        }
        const caps = Array.isArray(cur.metadata_capabilities)
          ? (cur.metadata_capabilities as string[])
          : []
        if (caps.length === 0) {
          const pc = (profile.capabilities ?? {}) as Record<string, boolean | undefined>
          const capKeys = CAPABILITY_OPTIONS.filter((o) => pc[o.key] === true).map((o) => o.key)
          if (capKeys.length > 0) patch.metadata_capabilities = capKeys
        }
        if (typeof profile.context_window === 'number' && profile.context_window > 0) {
          fillIfEmpty('metadata_context_window', profile.context_window)
        }
        if (typeof profile.max_output_tokens === 'number' && profile.max_output_tokens > 0) {
          fillIfEmpty('metadata_max_output_tokens', profile.max_output_tokens)
        }
        autoFillRef.current = { modelId, keys: Object.keys(patch) }
        setProfileStatus('matched')
        if (Object.keys(patch).length > 0) form.setFieldsValue(patch)
      } catch {
        // 档案查询失败保持静默：不阻塞手动填写
      }
    },
    [form]
  )

  /** 模型 ID 输入防抖调度（编辑流程不触发，避免覆盖已有档案） */
  const scheduleProfileAutofill = useCallback(
    (modelId: string): void => {
      if (profileTimer.current) {
        clearTimeout(profileTimer.current)
        profileTimer.current = null
      }
      if (!modelId) {
        resetProfileAutofill()
        return
      }
      const prev = autoFillRef.current
      if (prev && prev.modelId !== modelId) resetProfileAutofill()
      else setProfileStatus('idle')
      if (editingProvider) return
      profileTimer.current = setTimeout(() => {
        profileTimer.current = null
        void applyProfileAutofill(modelId)
      }, 350)
    },
    [editingProvider, applyProfileAutofill, resetProfileAutofill]
  )

  /** Form 值变化入口：仅响应模型 ID 变化（setFieldsValue 不会触发，无自循环） */
  const handleFormValuesChange = (changedValues: Record<string, unknown>): void => {
    if (!('model' in changedValues)) return
    scheduleProfileAutofill(String(changedValues.model ?? '').trim())
  }

  /** 关闭编辑/新增弹窗的统一收尾（取消、保存成功共用） */
  const closeModal = useCallback((): void => {
    resetProfileAutofill()
    setModalOpen(false)
    form.resetFields()
    setEditingProvider(null)
    setProtocolSearch('')
  }, [form, resetProfileAutofill])

  // 卸载时清理档案查询定时器
  useEffect(() => {
    return () => {
      if (profileTimer.current) {
        clearTimeout(profileTimer.current)
        profileTimer.current = null
      }
    }
  }, [])

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
    resetProfileAutofill()
    setEditingProvider(null)
    setProtocolSearch('')
    form.resetFields()
    form.setFieldsValue({
      provider: 'deepseek',
      temperature: 0.7,
      api_format: 'openai',
      metadata_capabilities: [],
      is_enabled: true,
      sort_order: 0
    })
    setModalOpen(true)
  }

  const openEditModal = (record: LlmProviderConfig): void => {
    resetProfileAutofill()
    setEditingProvider(record)
    setProtocolSearch('')
    const meta = record.metadata ?? {}
    const caps = getCapabilities(record.metadata)
    form.setFieldsValue({
      // 名称即展示名（含历史档案 display_name 的展示结果）；保存后统一收敛到 name
      name: getProviderDisplayName(record),
      provider: record.provider,
      base_url: record.base_url,
      // 密钥永不发送到渲染进程：编辑时恒为空，留空保持原密钥，重新输入才替换
      api_key: '',
      model: record.model,
      temperature: record.temperature,
      max_tokens: record.max_tokens,
      api_format:
        record.extra_config && typeof record.extra_config.api_format === 'string'
          ? record.extra_config.api_format
          : 'openai',
      metadata_vendor: typeof meta.vendor === 'string' ? meta.vendor : '',
      metadata_type: typeof meta.type === 'string' ? meta.type : undefined,
      metadata_capabilities: CAPABILITY_OPTIONS.filter((o) => caps[o.key]).map((o) => o.key),
      metadata_context_window: typeof meta.context_window === 'number' ? meta.context_window : null,
      metadata_max_output_tokens:
        typeof meta.max_output_tokens === 'number' ? meta.max_output_tokens : null,
      is_enabled: record.is_enabled,
      sort_order: record.sort_order
    })
    setModalOpen(true)
  }

  const handleProviderTypeChange = (providerType: string): void => {
    const config = getProviderConfig(providerType)
    if (config) {
      // 预置协议自动跟随其默认端点；自定义类型清空由用户填写（API 地址仅在自定义时展示）
      form.setFieldsValue({ base_url: config.value === 'custom' ? '' : config.baseURL || '' })
    }
    setProtocolSearch('')
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

    const vendor = typeof values.metadata_vendor === 'string' ? values.metadata_vendor.trim() : ''
    const type = typeof values.metadata_type === 'string' ? values.metadata_type.trim() : ''
    const ctx = values.metadata_context_window as number | null | undefined
    const maxOut = values.metadata_max_output_tokens as number | null | undefined

    const metadata: ModelMetadata = { ...base, capabilities: currentCaps }
    // 展示名统一收敛到表单 name 字段：历史档案遗留的 display_name 随编辑保存归一到 name
    delete metadata.display_name
    if (vendor) metadata.vendor = vendor
    else delete metadata.vendor
    if (type) metadata.type = type
    else delete metadata.type
    if (ctx != null && ctx > 0) metadata.context_window = ctx
    else delete metadata.context_window
    if (maxOut != null && maxOut > 0) metadata.max_output_tokens = maxOut
    else delete metadata.max_output_tokens

    const meaningful =
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

      // API 地址：仅「自定义」类型可输入；非自定义使用所选服务商的默认地址
      const cfg = getProviderConfig(values.provider as string)
      const rawBaseUrl =
        typeof values.base_url === 'string'
          ? values.base_url.trim()
          : typeof form.getFieldValue('base_url') === 'string'
            ? String(form.getFieldValue('base_url')).trim()
            : ''
      const defaultBaseUrl = cfg?.baseURL || undefined
      const modelId = String(values.model ?? '').trim()
      // 名称留空默认使用模型 ID（与「拉取模型」批量添加一致；name 即展示名）
      const rawName = typeof values.name === 'string' ? values.name.trim() : ''
      const name = rawName || modelId

      const embeddingInForm =
        values.metadata_type === 'embedding' ||
        ((values.metadata_capabilities as string[] | undefined) ?? []).includes(
          'supports_embeddings'
        )
      if (values.is_default === true && embeddingInForm) {
        viewMessage(msgKey, 'warning', '嵌入（Embedding）模型不能设为默认聊天模型')
        return
      }

      const input: LlmProviderInput = {
        name,
        provider: values.provider as string,
        base_url: rawBaseUrl || defaultBaseUrl,
        model: modelId,
        temperature: values.temperature as number | undefined,
        max_tokens: values.max_tokens as number | null | undefined,
        // 兼容协议仅对「自定义」类型生效，存入 extra_config.api_format；其余类型保留原 extra_config
        extra_config:
          (values.provider as string) === 'custom'
            ? {
                ...(editingProvider?.extra_config ?? {}),
                api_format: (values.api_format as string) || 'openai'
              }
            : editingProvider
              ? editingProvider.extra_config
              : undefined,
        metadata: buildMetadata(values, editingProvider?.metadata ?? null),
        is_enabled: values.is_enabled as boolean | undefined,
        is_default: values.is_default as boolean | undefined,
        sort_order: values.sort_order as number | undefined
      }

      if (editingProvider) {
        if (values.api_key) {
          input.api_key = values.api_key as string
        }
        viewMessage(msgKey, 'loading', '正在更新模型...')
        await (window as unknown as Window).api.providers.update(editingProvider.id, input)
        viewMessage(msgKey, 'success', '模型已更新', 2)
      } else {
        input.api_key = (values.api_key as string) || null
        viewMessage(msgKey, 'loading', '正在创建模型...')
        await (window as unknown as Window).api.providers.create(input)
        viewMessage(msgKey, 'success', '模型已创建', 2)
      }

      closeModal()
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
      viewMessage(msgKey, 'loading', '正在设置默认模型...')
      await (window as unknown as Window).api.providers.setDefault(id)
      viewMessage(msgKey, 'success', '默认模型已更新', 2)
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
      // 默认全选新拉取到的模型，用户可在列表中取消勾选后再一键添加
      setCheckedModels(newModels.map((m) => m.id))
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

  // 一键添加选中的模型（携带拉取时推导出的能力标签）。
  // 走 provider-create-batch：主进程单事务插入 + 只广播一次变更，
  // 避免逐个 create 触发渲染进程 29 次全量刷新导致程序卡死。
  const handleBatchAdd = async (): Promise<void> => {
    const msgKey = 'batch-add'
    if (checkedModels.length === 0) {
      viewMessage(msgKey, 'warning', '请至少选择一个模型')
      return
    }
    // 自定义类型必须填写供应商 ID（全英文小写，仅可包含数字与 -）
    if (fetchProviderType === 'custom') {
      const pid = fetchCustomProviderId.trim()
      if (!/^[a-z0-9-]+$/.test(pid)) {
        viewMessage(msgKey, 'warning', '请填写有效的供应商 ID：全英文小写，仅可包含数字与 -')
        return
      }
    }
    const addProvider =
      fetchProviderType === 'custom' ? fetchCustomProviderId.trim() : fetchProviderType
    const metaMap = new Map(fetchModels.map((m) => [m.id, m.metadata]))
    setAddingModels(true)
    try {
      const inputs: LlmProviderInput[] = checkedModels.map((modelId) => ({
        name: modelId,
        provider: addProvider,
        base_url: fetchBaseUrl || undefined,
        api_key: fetchApiKey || undefined,
        model: modelId,
        metadata: metaMap.get(modelId) ?? null,
        is_enabled: true,
        is_default: false
      }))
      const result = await (window as unknown as Window).api.providers.createBatch(inputs)
      viewMessage(
        msgKey,
        'success',
        result.skipped > 0
          ? `成功添加 ${result.created} 个模型（跳过 ${result.skipped} 个已存在或无效）`
          : `成功添加 ${result.created} 个模型`,
        3
      )
      setFetchModalOpen(false)
      await loadProviders()
    } catch (error) {
      viewMessage(msgKey, 'error', `批量添加失败: ${error}`)
    } finally {
      setAddingModels(false)
    }
  }

  // --- 树形目录（按模型供应商 / 接口协议分组） ---

  /** 分组归属：按模型供应商（接口协议）分组，如 OpenAI / DeepSeek / 智谱 GLM / 自定义 */
  const groupOf = (p: LlmProviderConfig): { key: string; label: string } => {
    const cfg = getProviderConfig(p.provider)
    return { key: `provider:${p.provider}`, label: cfg?.label ?? p.provider }
  }

  interface ProviderTreeNode extends TreeDataNode {
    record?: LlmProviderConfig
    children?: ProviderTreeNode[]
  }

  const treeData = useMemo<ProviderTreeNode[]>(() => {
    const groups = new Map<string, { label: string; items: LlmProviderConfig[] }>()
    for (const p of providers) {
      const g = groupOf(p)
      let entry = groups.get(g.key)
      if (!entry) {
        entry = { label: g.label, items: [] }
        groups.set(g.key, entry)
      }
      entry.items.push(p)
    }
    return [...groups.entries()].map(([key, entry]) => ({
      key,
      title: entry.label,
      children: entry.items.map((p) => ({
        key: String(p.id),
        record: p,
        // 默认模型不可勾选（与单行删除一致：默认模型不能删）
        disableCheckbox: p.is_default
      }))
    }))
  }, [providers])

  /** 当前勾选中的模型 id（模型节点 key 为纯数字 id；分组节点 key 含冒号前缀） */
  const selectedIds = useMemo(
    () => checkedKeys.filter((k) => !String(k).includes(':')).map((k) => Number(k)),
    [checkedKeys]
  )

  // 数据加载 / 刷新后默认展开「新增」分组（修复：此前无条件把所有分组加回展开,
  // 用户手动折叠过的分组每次刷新都被强制重新展开）
  useEffect(() => {
    setExpandedKeys((prev) => {
      const known = new Set<React.Key>(prev)
      const next = new Set<React.Key>(prev)
      let changed = false
      for (const node of treeData) {
        if (!known.has(node.key)) {
          next.add(node.key)
          changed = true
        }
      }
      return changed ? [...next] : prev
    })
  }, [treeData])

  /** 树节点渲染：分组行 / 模型行（模型行自带操作按钮） */
  const renderTreeNodeTitle = (node: ProviderTreeNode): React.ReactNode => {
    const record = node.record
    if (!record) {
      // 分组节点
      const count = node.children?.length ?? 0
      return (
        <span className="inline-flex items-center" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600 }}>{String(node.title)}</span>
          <span style={{ color: colorTextTertiary, fontSize: 12, fontFamily: 'monospace' }}>
            {count} 个模型
          </span>
        </span>
      )
    }
    // 模型节点
    return (
      <span
        className="inline-flex items-center w-full"
        style={{ gap: 6, minWidth: 0, paddingRight: 8 }}
      >
        <ProviderLogo provider={record.provider} size={16} />
        <span style={{ whiteSpace: 'nowrap' }}>{getProviderDisplayName(record)}</span>
        {record.is_default && (
          <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
            默认
          </Tag>
        )}
        {record.provider === 'custom' && (
          <span
            style={{
              color: colorTextTertiary,
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 260,
              minWidth: 0
            }}
          >
            {record.base_url || '（未填地址）'} (
            {record.extra_config && record.extra_config.api_format === 'anthropic'
              ? 'Anthropic'
              : 'OpenAI'}
            )
          </span>
        )}
        <MetaSummary metadata={record.metadata} maxBadges={2} />
        <span className="flex-1" />
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          {record.is_default ? (
            <Tooltip title="当前已是默认">
              <StarFilled style={{ color: '#faad14', fontSize: 14, padding: '0 6px' }} />
            </Tooltip>
          ) : isEmbeddingModel(record) ? null : (
            <Tooltip title="设为默认">
              <Popconfirm
                title="设为默认模型？"
                description="对话框将默认选中该模型进行问答"
                onConfirm={() => handleSetDefault(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="text" size="small" icon={<StarOutlined />} />
              </Popconfirm>
            </Tooltip>
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
                    title: '确定删除此模型？',
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
      </span>
    )
  }

  /** 批量删除勾选的模型（单事务 + 单广播，避免逐个删除触发刷新风暴） */
  const handleBatchDelete = async (): Promise<void> => {
    const msgKey = 'provider-delete-batch'
    if (selectedIds.length === 0) return
    const targets = providers.filter((p) => selectedIds.includes(p.id))
    const names = targets.map((p) => getProviderDisplayName(p))
    modal.confirm({
      title: `确定删除选中的 ${targets.length} 个模型？`,
      content:
        targets.length > 3
          ? `将删除：${names.slice(0, 3).join('、')} 等 ${targets.length} 个，此操作不可撤销。`
          : `将删除：${names.join('、')}，此操作不可撤销。`,
      okText: '批量删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingBatch(true)
        try {
          const count = await (window as unknown as Window).api.providers.deleteBatch(selectedIds)
          viewMessage(msgKey, 'success', `已删除 ${count} 个模型`, 2)
          setCheckedKeys([])
          await loadProviders()
        } catch (error) {
          viewMessage(msgKey, 'error', `批量删除失败: ${error}`)
        } finally {
          setDeletingBatch(false)
        }
      }
    })
  }

  // 拉取列表中是否已全选（checkedModels 恒为 fetchModels 的子集，数量相等即全选）
  const fetchAllChecked = fetchModels.length > 0 && checkedModels.length === fetchModels.length

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
        {/* 目录头：统计 + 批量删除操作条 */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: `1px solid ${colorSplit}` }}
        >
          <span style={{ color: colorTextSecondary, fontSize: 12, fontFamily: 'monospace' }}>
            共 {providers.length} 个模型
          </span>
          {selectedIds.length > 0 && (
            <Space size={8}>
              <span style={{ color: colorTextSecondary, fontSize: 12, fontFamily: 'monospace' }}>
                已选 {selectedIds.length} 个
              </span>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                loading={deletingBatch}
                onClick={handleBatchDelete}
              >
                批量删除
              </Button>
              <Button type="text" size="small" onClick={() => setCheckedKeys([])}>
                取消选择
              </Button>
            </Space>
          )}
        </div>
        <Spin spinning={loading}>
          {providers.length === 0 ? (
            <div className="py-12 text-center" style={{ color: colorTextSecondary }}>
              暂无模型，点击右上角按钮添加
            </div>
          ) : (
            <Tree
              checkable
              selectable={false}
              blockNode
              showLine={{ showLeafIcon: false }}
              treeData={treeData}
              checkedKeys={checkedKeys}
              onCheck={(keys) => setCheckedKeys(Array.isArray(keys) ? keys : keys.checked)}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              titleRender={(node) => renderTreeNodeTitle(node as ProviderTreeNode)}
              className="provider-directory-tree"
              style={{ padding: '8px 8px 12px 4px' }}
            />
          )}
        </Spin>
      </SettingsSection>

      <Modal
        title={editingProvider ? `编辑模型 — ${getProviderDisplayName(editingProvider)}` : '添加模型'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
        width={520}
        styles={{ body: { maxHeight: 560, padding: 12, overflowY: 'auto' } }}
        classNames={{ body: 'custom-scrollbar' }}
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
          initialValues={{
            provider: 'deepseek',
            temperature: 0.7,
            api_format: 'openai',
            metadata_capabilities: [],
            is_enabled: true,
            sort_order: 0
          }}
          onValuesChange={handleFormValuesChange}
        >
          {/* ── 基础连接：只保留每次真正要填的项；模型档案与参数收进下方折叠区 ── */}
          <Form.Item
            name="provider"
            label="接口协议"
            rules={[{ required: true, message: '请输入接口协议' }]}
            tooltip="可下拉选择常用平台，也可输入任意协议标识（如 openai、zhipu、xproxy）后从「自定义协议」项提交；未知协议按 OpenAI 兼容方式调用"
          >
            <Select
              showSearch
              allowClear
              placeholder="选择或输入接口协议"
              optionFilterProp="label"
              options={protocolOptions}
              onChange={handleProviderTypeChange}
              onSearch={setProtocolSearch}
            />
          </Form.Item>

          {watchedProviderType === 'custom' && (
            <Space size="middle" className="w-full">
              <Form.Item
                name="base_url"
                label="API 地址"
                style={{ width: 270 }}
                tooltip="自定义服务商必须填写 OpenAI 兼容或 Anthropic 兼容的 API 端点"
              >
                <Input placeholder="https://api.example.com/v1" allowClear />
              </Form.Item>
              <Form.Item
                name="api_format"
                label="兼容协议"
                style={{ width: 180 }}
                tooltip="自定义端点的调用协议：OpenAI 兼容或 Anthropic 兼容"
              >
                <Select
                  options={[
                    { value: 'openai', label: 'OpenAI 兼容' },
                    { value: 'anthropic', label: 'Anthropic 兼容' }
                  ]}
                />
              </Form.Item>
            </Space>
          )}

          <Form.Item
            name="api_key"
            label="API Key"
            rules={editingProvider ? undefined : [{ required: true, message: '请输入 API Key' }]}
            tooltip={editingProvider ? '留空则保持原有密钥不变' : '密钥将使用本机唯一私钥加密存储'}
          >
            <Input.Password
              placeholder={editingProvider ? '留空保持原密钥' : 'sk-xxxxxxxx'}
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="model"
            label="模型ID"
            rules={[{ required: true, whitespace: true, message: '请输入模型ID' }]}
            tooltip="必填。输入后自动匹配 models-profile 官方档案，命中则自动填充下方「模型档案」（未收录的模型可自行补充）"
          >
            <Input placeholder="例如：gpt-4o、deepseek-v4-flash、llama3.1" allowClear />
          </Form.Item>

          <Form.Item
            name="name"
            label="名称"
            tooltip="目录与选择器中展示的名称；留空默认使用模型 ID。官方档案收录的模型会自动填入官方名称，可修改"
          >
            <Input placeholder="留空默认使用模型 ID" allowClear />
          </Form.Item>

          {!editingProvider && !providers.some((p) => p.is_default) && (
            <Form.Item
              name="is_default"
              label="设为默认"
              valuePropName="checked"
              tooltip={
                isEmbeddingInForm
                  ? '嵌入（Embedding）模型不能设为默认聊天模型'
                  : '当前还没有默认模型，勾选后新模型即默认聊天模型'
              }
            >
              <Switch disabled={isEmbeddingInForm} />
            </Form.Item>
          )}

          <Collapse
            size="small"
            className="mt-2"
            defaultActiveKey={[]}
            items={[
              {
                key: 'archive',
                forceRender: true,
                label: (
                  <span className="inline-flex items-center" style={{ gap: 6 }}>
                    <span>模型档案</span>
                    {profileStatus === 'matched' && (
                      <Tag style={{ margin: 0, fontSize: 11 }} color="blue">
                        已自动填充官方档案
                      </Tag>
                    )}
                  </span>
                ),
                children: (
                  <div>
                    {profileStatus === 'matched' && (
                      <div style={{ color: colorTextTertiary, fontSize: 12, marginBottom: 8 }}>
                        已匹配 models-profile 官方档案并填充，可按需修改
                      </div>
                    )}
                    {profileStatus === 'missing' &&
                      !editingProvider &&
                      Boolean(watchedModel?.trim()) && (
                        <div style={{ color: colorTextTertiary, fontSize: 12, marginBottom: 8 }}>
                          models-profile 未收录「{String(watchedModel).trim()}」，可手动补充；能力用于工具调用
                          / 视觉等判断与嵌入模型识别
                        </div>
                      )}
                    <Space size="middle" className="w-full">
                      <Form.Item name="metadata_vendor" label="厂商" style={{ width: 200 }}>
                        <Input placeholder="例如：OpenAI" allowClear />
                      </Form.Item>
                      <Form.Item name="metadata_type" label="模型类型" style={{ width: 200 }}>
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
                        style={{ width: 200 }}
                        tooltip="档案展示用：模型最大上下文窗口"
                      >
                        <InputNumber
                          min={0}
                          step={1000}
                          style={{ width: '100%' }}
                          placeholder="未知"
                        />
                      </Form.Item>
                      <Form.Item
                        name="metadata_max_output_tokens"
                        label="最大输出 (tokens)"
                        style={{ width: 200 }}
                        tooltip="档案展示用：模型单次最大输出能力；与「高级参数」里的最大 Token（请求上限）是不同维度"
                      >
                        <InputNumber min={1} style={{ width: '100%' }} placeholder="未知" />
                      </Form.Item>
                    </Space>
                    <Form.Item
                      name="metadata_capabilities"
                      label="能力"
                      tooltip="来自 models-profile 档案；未收录的模型可自行勾选。标记「嵌入能力」的模型不能设为默认聊天模型"
                    >
                      <Select
                        mode="multiple"
                        placeholder="选择模型能力"
                        options={CAPABILITY_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
                        optionFilterProp="label"
                      />
                    </Form.Item>
                  </div>
                )
              },
              {
                key: 'advanced',
                forceRender: true,
                label: '高级参数',
                children: (
                  <div>
                    <Space size="middle" className="w-full">
                      <Form.Item name="temperature" label="温度" style={{ width: 140 }}>
                        <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name="max_tokens"
                        label="最大 Token"
                        style={{ width: 180 }}
                        tooltip="单次请求的生成上限（不含思考过程），留空不限制"
                      >
                        <InputNumber min={1} placeholder="不限制" style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>
                    <Space size="middle" className="w-full" align="start">
                      <Form.Item
                        name="sort_order"
                        label="排序"
                        style={{ width: 140 }}
                        tooltip="目录中数值越小越靠前"
                      >
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name="is_enabled"
                        label="启用"
                        valuePropName="checked"
                        tooltip="关闭后该模型不会出现在可选列表中"
                        style={{ width: 200, marginBottom: 0 }}
                      >
                        <Switch />
                      </Form.Item>
                    </Space>
                  </div>
                )
              }
            ]}
          />
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
          <div className="flex w-full" style={{ gap: 8 }}>
            <Select
              value={fetchProviderType}
              options={PROVIDER_TYPES}
              onChange={handleProviderTypeChangeForFetch}
              style={{ flex: '1 1 0%', minWidth: 80 }}
              placeholder="选择供应商类型"
            />
            {(fetchProviderType === 'custom' || fetchProviderType === 'ollama') && (
              <Input
                placeholder={
                  fetchProviderType === 'custom' ? '自定义 API 地址（必填）' : 'Ollama API 地址'
                }
                value={fetchBaseUrl}
                onChange={(e) => setFetchBaseUrl(e.target.value)}
                allowClear
                style={{ flex: '5 1 0%', minWidth: 100 }}
              />
            )}
          </div>
          {fetchProviderType !== 'ollama' && (
            <Input.Password
              placeholder="API Key"
              value={fetchApiKey}
              onChange={(e) => setFetchApiKey(e.target.value)}
              allowClear
            />
          )}
          {fetchProviderType === 'custom' && (
            <>
              <Input
                placeholder="供应商 ID（必填，如 opencode）"
                value={fetchCustomProviderId}
                onChange={(e) => setFetchCustomProviderId(e.target.value.toLowerCase())}
                status={
                  fetchCustomProviderId && !/^[a-z0-9-]+$/.test(fetchCustomProviderId)
                    ? 'error'
                    : undefined
                }
                allowClear
              />
              <div style={{ color: colorTextSecondary, fontSize: 12 }}>
                供应商 ID 全英文小写，仅可包含数字与 - ｜ 列表拉取仅支持 OpenAI 兼容端点（GET
                /v1/models）
              </div>
            </>
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
                <Tooltip title={fetchAllChecked ? '不全选' : '全选'}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={fetchAllChecked ? '不全选' : '全选'}
                    icon={fetchAllChecked ? <MinusSquareOutlined /> : <CheckSquareOutlined />}
                    onClick={() =>
                      setCheckedModels(fetchAllChecked ? [] : fetchModels.map((m) => m.id))
                    }
                  />
                </Tooltip>
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
