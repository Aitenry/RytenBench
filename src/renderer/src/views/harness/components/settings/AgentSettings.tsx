import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  theme,
  Button,
  Switch,
  Spin,
  Modal,
  Form,
  Input,
  Select,
  Pagination,
  Tag,
  Badge,
  App
} from 'antd'
import {
  LoadingOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ImportOutlined,
  RobotOutlined,
  TeamOutlined
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTranslation } from '@renderer/i18n'
import { Window } from '../../../../../resource/types/window'
import type { AgentConfigRow, AgentConfigInput } from '../../../../../../main/database/mapper/agent'
import type { ProviderOption } from '@renderer/types/components'
import type { ToolInfo } from '../../../../../resource/types/window'
import { toolIconMap } from '../HarnessConstants'
import { isEmbeddingProvider, getProviderDisplayName } from '@renderer/utils/providerMeta'
import {
  SettingsPageHeader,
  SettingsSection,
  SettingRow
} from '@renderer/components/system/settings/SettingsUI'

const { TextArea } = Input

const PAGE_SIZE = 5

const AgentSettings: React.FC = () => {
  const {
    token: { colorTextSecondary, colorTextTertiary, colorFillAlter }
  } = theme.useToken()

  const { viewMessage } = useMessage()
  const { modal } = App.useApp()
  const { t } = useTranslation()

  // 当前工作区 ID
  const [workspaceId, setWorkspaceId] = useState(0)

  // 子智能体列表
  const [agents, setAgents] = useState<AgentConfigRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // 主智能体
  const [mainAgent, setMainAgent] = useState<{
    tools: string[]
    skills: string[]
  }>({ tools: [], skills: [] })
  const [mainSaving, setMainSaving] = useState(false)

  // 编辑/创建弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AgentConfigRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  // 选项数据
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([])
  const [skills, setSkills] = useState<{ id: string; name: string; description: string }[]>([])

  // 导入 JSON
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importLoading, setImportLoading] = useState(false)

  const loadPage = useCallback(
    async (page: number, wsId: number) => {
      setLoading(true)
      try {
        const result = await (window as unknown as Window).api.agents.getPaginated(
          wsId,
          page - 1,
          PAGE_SIZE
        )
        setAgents(result.items)
        setTotal(result.total)
        setCurrentPage(page)
      } catch (error) {
        viewMessage(
          'agent-load',
          'error',
          t('common.message.loadFailedWithReason', { reason: String(error) })
        )
      } finally {
        setLoading(false)
      }
    },
    [viewMessage, t]
  )

  const loadOptions = useCallback(async () => {
    try {
      const [providerList, tools, skillList, main, settings] = await Promise.all([
        (window as unknown as Window).api.providers.getEnabled(),
        (window as unknown as Window).api.harness.getTools(),
        (window as unknown as Window).api.harness.listSkills(),
        (window as unknown as Window).api.mainAgent.get(),
        (window as unknown as Window).api.systemSettings.getAll()
      ])
      setProviders((providerList as ProviderOption[]).filter((p) => !isEmbeddingProvider(p)))
      setAvailableTools(tools)
      setSkills(skillList)
      setMainAgent({
        tools: ((main as Record<string, unknown>).tools as string[]) ?? [],
        skills: ((main as Record<string, unknown>).skills as string[]) ?? []
      })
      const wsId = (settings as unknown as Record<string, unknown>)?.harness
        ? ((((settings as unknown as Record<string, unknown>).harness as Record<string, unknown>)
            ?.activeWorkspaceId as number) ?? 0)
        : 0
      setWorkspaceId(wsId)
      return wsId
    } catch (error) {
      viewMessage(
        'agent-options',
        'error',
        t('common.message.loadFailedWithReason', { reason: String(error) })
      )
      return 0
    }
  }, [viewMessage, t])

  useEffect(() => {
    loadOptions().then((wsId) => {
      loadPage(1, wsId)
    })
  }, [loadPage, loadOptions])

  // 监听工作区切换
  useEffect(() => {
    const handleWorkspaceChanged = (): void => {
      loadOptions().then((wsId) => {
        loadPage(1, wsId)
      })
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [loadOptions, loadPage])

  // ===== 主智能体 =====

  const handleMainSave = async (): Promise<void> => {
    setMainSaving(true)
    try {
      await (window as unknown as Window).api.mainAgent.update(mainAgent)
      viewMessage('main-save', 'success', t('agentSettings.main.saved'), 2)
    } catch (error) {
      viewMessage(
        'main-save',
        'error',
        t('common.message.saveFailedWithReason', { reason: String(error) })
      )
    } finally {
      setMainSaving(false)
    }
  }

  // ===== 子智能体 =====

  const openEditModal = (agent?: AgentConfigRow): void => {
    setEditingAgent(agent ?? null)
    if (agent) {
      form.setFieldsValue({
        name: agent.name,
        rename: agent.rename || '',
        prompt: agent.prompt || '',
        description: agent.description || '',
        tools: agent.tools ? JSON.parse(agent.tools) : [],
        skills: agent.skills ? JSON.parse(agent.skills) : [],
        model: agent.model || undefined,
        enable: agent.enable
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ enable: true, tools: [], skills: [] })
    }
    setModalOpen(true)
  }

  const handleSave = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      const input: AgentConfigInput = {
        workspace_id: workspaceId,
        name: values.name,
        rename: values.rename || null,
        prompt: values.prompt || null,
        description: values.description || null,
        tools: values.tools || [],
        skills: values.skills || [],
        model: values.model || null,
        enable: values.enable
      }

      if (editingAgent) {
        await (window as unknown as Window).api.agents.update(workspaceId, editingAgent.id, input)
        viewMessage('agent-save', 'success', t('agentSettings.messages.agentUpdated'), 2)
      } else {
        await (window as unknown as Window).api.agents.create(input)
        viewMessage('agent-save', 'success', t('agentSettings.messages.agentCreated'), 2)
        // 通知记忆树刷新（后端已自动创建记忆目录）
        window.dispatchEvent(new CustomEvent('memory-tree-refresh'))
      }

      setModalOpen(false)
      await loadPage(currentPage, workspaceId)
    } catch (error) {
      viewMessage(
        'agent-save',
        'error',
        t('common.message.saveFailedWithReason', { reason: String(error) })
      )
    } finally {
      setSaving(false)
    }
  }

  const handleToggleEnable = async (agent: AgentConfigRow, checked: boolean): Promise<void> => {
    try {
      await (window as unknown as Window).api.agents.update(workspaceId, agent.id, {
        enable: checked
      })
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, enable: checked } : a)))
      viewMessage(
        'agent-toggle',
        'success',
        t(checked ? 'agentSettings.messages.opened' : 'agentSettings.messages.closed'),
        1
      )
    } catch (error) {
      viewMessage(
        'agent-toggle',
        'error',
        t('agentSettings.messages.toggleFailedWithReason', { reason: String(error) })
      )
    }
  }

  const handleDelete = async (agent: AgentConfigRow): Promise<void> => {
    modal.confirm({
      title: t('agentSettings.messages.deleteConfirmTitle', { name: agent.rename || agent.name }),
      content: t('common.message.irreversible'),
      okText: t('common.action.confirm'),
      okType: 'danger',
      cancelText: t('common.action.cancel'),
      onOk: async () => {
        try {
          await (window as unknown as Window).api.agents.delete(workspaceId, agent.id)
          viewMessage('agent-delete', 'success', t('agentSettings.messages.deleted'), 2)
          // 通知记忆树刷新（后端已自动删除记忆目录）
          window.dispatchEvent(new CustomEvent('memory-tree-refresh'))
          await loadPage(currentPage, workspaceId)
        } catch (error) {
          viewMessage(
            'agent-delete',
            'error',
            t('common.message.deleteFailedWithReason', { reason: String(error) })
          )
        }
      }
    })
  }

  // ===== 导入 JSON =====

  interface ImportAgentItem {
    name: string
    rename?: string
    prompt?: string
    description?: string
    skills?: string[] | string | null
    model?: string | null
    tools?: string[]
    enable?: boolean
  }

  const handleImportExec = async (raw: string): Promise<void> => {
    if (!raw) {
      viewMessage('import-error', 'warning', t('agentSettings.messages.importEmptyFile'))
      return
    }

    let data: ImportAgentItem[]
    try {
      data = JSON.parse(raw)
    } catch {
      viewMessage('import-error', 'error', t('agentSettings.messages.importInvalidJson'))
      return
    }

    if (!Array.isArray(data)) {
      viewMessage('import-error', 'error', t('agentSettings.messages.importNotArray'))
      return
    }

    if (data.length === 0) {
      viewMessage('import-error', 'warning', t('agentSettings.messages.importEmptyContent'))
      return
    }

    // 建立有效项集合
    const validToolNames = new Set(availableTools.map((t) => t.name))
    const validSkillIds = new Set(skills.map((s) => s.id))
    const validModelKeys = new Set(providers.map((p) => `${p.provider}:${p.model}`))

    setImportLoading(true)
    let imported = 0
    const skipped: string[] = []
    const stripped: string[] = []

    try {
      for (const item of data) {
        if (!item.name) {
          skipped.push(t('agentSettings.messages.importStrippedSkippedName'))
          continue
        }

        // 验证并过滤 tools
        let filteredTools: string[]
        if (Array.isArray(item.tools) && item.tools.length > 0) {
          const removed = item.tools.filter((t) => !validToolNames.has(t))
          filteredTools = item.tools.filter((t) => validToolNames.has(t))
          if (removed.length > 0) {
            stripped.push(
              t('agentSettings.messages.importMissingTool', {
                name: item.name,
                items: removed.join(', ')
              })
            )
          }
        } else {
          filteredTools = []
        }

        // 验证并过滤 skills
        let filteredSkills: string[]
        const rawSkills = item.skills
        if (rawSkills !== null && rawSkills !== undefined) {
          const skillArr = (Array.isArray(rawSkills) ? rawSkills : [rawSkills]).filter(
            Boolean
          ) as string[]
          const removed = skillArr.filter((s) => !validSkillIds.has(s))
          filteredSkills = skillArr.filter((s) => validSkillIds.has(s))
          if (removed.length > 0) {
            stripped.push(
              t('agentSettings.messages.importMissingSkill', {
                name: item.name,
                items: removed.join(', ')
              })
            )
          }
        } else {
          filteredSkills = []
        }

        // 验证 model
        let validModel: string | null = null
        if (item.model) {
          if (validModelKeys.has(item.model)) {
            validModel = item.model
          } else {
            stripped.push(
              t('agentSettings.messages.importMissingModel', {
                name: item.name,
                model: item.model
              })
            )
          }
        }

        const input: AgentConfigInput = {
          workspace_id: workspaceId,
          name: item.name,
          rename: item.rename || null,
          prompt: item.prompt || null,
          description: item.description || null,
          tools: filteredTools,
          skills: filteredSkills,
          model: validModel,
          enable: item.enable ?? true
        }

        await (window as unknown as Window).api.agents.create(input)
        imported++
      }
    } catch (err) {
      viewMessage(
        'import-error',
        'error',
        t('agentSettings.messages.importFailedWithReason', { reason: String(err) })
      )
    } finally {
      setImportLoading(false)
    }

    // 汇总提示
    const parts: string[] = []
    if (imported > 0) {
      parts.push(t('agentSettings.messages.importSummaryImported', { count: imported }))
    }
    if (skipped.length > 0) {
      parts.push(t('agentSettings.messages.importSummarySkipped', { count: skipped.length }))
    }
    const summary =
      parts.length > 0
        ? parts.join(t('agentSettings.messages.importSummarySeparator'))
        : t('agentSettings.messages.importSummaryNone')
    viewMessage('import-summary', 'success', summary)

    // 逐条展示剔除提示
    if (stripped.length > 0) {
      setTimeout(() => {
        modal.info({
          title: t('agentSettings.messages.importStrippedTitle'),
          content: (
            <ul className="pl-4 m-0 text-sm">
              {stripped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ),
          width: 480
        })
      }, 500)
    }

    // 刷新 & 清空
    if (fileInputRef.current) fileInputRef.current.value = ''
    // 通知记忆树刷新（后端已自动创建记忆目录）
    if (imported > 0) {
      window.dispatchEvent(new CustomEvent('memory-tree-refresh'))
    }
    await loadPage(1, workspaceId)
  }

  // 文件选择处理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || ''
      handleImportExec(text)
    }
    reader.onerror = () =>
      viewMessage('import-file', 'error', t('agentSettings.messages.readFileFailed'))
    reader.readAsText(file)
  }

  const providerOptions = providers.map((p) => ({
    value: `${p.provider}:${p.model}`,
    label: `${getProviderDisplayName(p)} (${p.provider}:${p.model})`
  }))

  return (
    <div>
      <SettingsPageHeader
        title={t('agentSettings.pageTitle')}
        description={t('agentSettings.pageDescription')}
      />

      {/* ====== 主智能体 ====== */}
      <SettingsSection
        title={t('agentSettings.sections.mainAgent')}
        icon={<RobotOutlined size={14} />}
        extra={
          <Button type="primary" size="small" loading={mainSaving} onClick={handleMainSave}>
            {t('common.action.save')}
          </Button>
        }
      >
        <SettingRow
          title={t('agentSettings.main.defaultTools')}
          description={t('agentSettings.main.defaultToolsDescription')}
          control={
            <Select
              mode="multiple"
              size="small"
              placeholder={t('agentSettings.main.defaultToolsPlaceholder')}
              value={mainAgent.tools}
              onChange={(value) => setMainAgent((prev) => ({ ...prev, tools: value }))}
              allowClear
              maxTagCount="responsive"
              style={{ minWidth: 280 }}
              optionRender={(option) => {
                const tool = availableTools.find((t) => t.name === option.value)
                if (!tool) return option.label as React.ReactNode
                return (
                  <div className="flex items-center gap-2">
                    <span style={{ color: tool.color }}>{toolIconMap[tool.icon]}</span>
                    <span>{tool.label}</span>
                  </div>
                )
              }}
              tagRender={(props) => {
                const tool = availableTools.find((t) => t.name === props.value)
                const { label, closable, onClose } = props
                return (
                  <Tag
                    closable={closable}
                    onClose={onClose}
                    style={{
                      marginInlineEnd: 4,
                      background: tool ? `${tool.color}12` : undefined,
                      border: tool ? `1px solid ${tool.color}30` : undefined,
                      color: tool?.color,
                      borderRadius: 12,
                      paddingInline: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ marginRight: 4 }}>{tool ? toolIconMap[tool.icon] : null}</span>
                    {label}
                  </Tag>
                )
              }}
              options={availableTools.map((t) => ({
                value: t.name,
                label: t.label,
                icon: t.icon,
                color: t.color
              }))}
            />
          }
        />
        <SettingRow
          title={t('agentSettings.main.defaultSkills')}
          description={t('agentSettings.main.defaultSkillsDescription')}
          control={
            <Select
              mode="multiple"
              size="small"
              placeholder={t('agentSettings.main.defaultSkillsPlaceholder')}
              value={mainAgent.skills}
              onChange={(value) => setMainAgent((prev) => ({ ...prev, skills: value }))}
              allowClear
              disabled={skills.length === 0}
              style={{ minWidth: 280 }}
              notFoundContent={
                skills.length === 0
                  ? t('agentSettings.form.skillsNotConfigured')
                  : t('agentSettings.form.skillsNoMatch')
              }
              maxTagCount="responsive"
              options={skills.map((s) => ({
                value: s.id,
                label: `${s.name}${s.description ? ` — ${s.description}` : ''}`
              }))}
            />
          }
        />
      </SettingsSection>

      {/* ====== 子智能体列表 ====== */}
      <SettingsSection
        title={t('agentSettings.sections.subagents')}
        icon={<TeamOutlined size={14} />}
        description={
          total > 1
            ? t('agentSettings.list.description_other', { count: total })
            : t('agentSettings.list.description_one', { count: total })
        }
        extra={
          <div className="flex items-center" style={{ gap: 8 }}>
            <Button
              icon={<ImportOutlined />}
              size="small"
              loading={importLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              {t('common.action.import')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => openEditModal()}
            >
              {t('agentSettings.list.newAgent')}
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center" style={{ padding: '36px 0' }}>
            <Spin
              indicator={
                <LoadingOutlined spin style={{ fontSize: 20, color: colorTextTertiary }} />
              }
            />
          </div>
        ) : agents.length > 0 ? (
          <>
            {agents.map((agent) => (
              <SettingRow
                key={agent.id}
                title={agent.rename || agent.name}
                description={agent.description || undefined}
                control={
                  <div className="flex items-center" style={{ gap: 4 }}>
                    <Switch
                      // enable 库列为可空（DEFAULT TRUE），null 视作默认启用
                      checked={agent.enable ?? true}
                      onChange={(checked) => handleToggleEnable(agent, checked)}
                      size="small"
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditModal(agent)}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(agent)}
                    />
                  </div>
                }
              >
                {agent.rename && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: colorTextTertiary,
                      marginTop: 1
                    }}
                  >
                    {agent.name}
                  </span>
                )}
                <div
                  className="flex items-center"
                  style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}
                >
                  {agent.tools && (
                    <Badge
                      count={t('agentSettings.list.toolCount', {
                        count: (JSON.parse(agent.tools) as string[]).length
                      })}
                      style={{
                        background: colorFillAlter,
                        color: colorTextTertiary,
                        boxShadow: 'none'
                      }}
                    />
                  )}
                  {agent.model && (
                    <Badge
                      count={agent.model}
                      style={{
                        background: colorFillAlter,
                        color: colorTextTertiary,
                        boxShadow: 'none'
                      }}
                    />
                  )}
                  {agent.skills && JSON.parse(agent.skills).length > 0 && (
                    <Badge
                      count={t('agentSettings.list.skillCount', {
                        count: (JSON.parse(agent.skills) as string[]).length
                      })}
                      style={{
                        background: colorFillAlter,
                        color: colorTextTertiary,
                        boxShadow: 'none'
                      }}
                    />
                  )}
                </div>
              </SettingRow>
            ))}
            {total > PAGE_SIZE && (
              <div className="flex justify-center" style={{ padding: '10px 0' }}>
                <Pagination
                  current={currentPage}
                  total={total}
                  pageSize={PAGE_SIZE}
                  onChange={(page) => loadPage(page, workspaceId)}
                  size="small"
                />
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              padding: '28px 0',
              textAlign: 'center',
              fontSize: 13,
              color: colorTextSecondary
            }}
          >
            {t('agentSettings.empty.noAgents')}
          </div>
        )}
      </SettingsSection>

      {/* 编辑/创建弹窗 */}
      <Modal
        title={
          editingAgent
            ? t('agentSettings.form.editTitle', {
                name: editingAgent.rename || editingAgent.name
              })
            : t('agentSettings.form.createTitle')
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={640}
        okText={t('common.action.save')}
        cancelText={t('common.action.cancel')}
        styles={{ body: { padding: 0 } }}
      >
        <div className="py-4 px-5 custom-scrollbar" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <Form form={form} layout="vertical" size="small">
            <div className="flex gap-3 items-end">
              <Form.Item
                label={t('agentSettings.form.chineseName')}
                name="rename"
                style={{ flex: 1 }}
              >
                <Input placeholder={t('agentSettings.form.chineseNamePlaceholder')} />
              </Form.Item>
              <Form.Item
                label={t('agentSettings.form.identifier')}
                name="name"
                rules={[
                  { required: true, message: t('agentSettings.form.identifierRequired') },
                  {
                    pattern: /^[a-z][a-z0-9-]*$/,
                    message: t('agentSettings.form.identifierPattern')
                  }
                ]}
                style={{ flex: 1 }}
              >
                <Input placeholder={t('agentSettings.form.identifierPlaceholder')} />
              </Form.Item>
              <Form.Item
                label={t('agentSettings.form.enabled')}
                name="enable"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </div>

            <Form.Item
              label={t('agentSettings.form.description')}
              name="description"
              rules={[{ required: true, message: t('agentSettings.form.descriptionRequired') }]}
            >
              <TextArea rows={3} placeholder={t('agentSettings.form.descriptionPlaceholder')} />
            </Form.Item>

            <Form.Item
              label={t('agentSettings.form.systemPrompt')}
              name="prompt"
              rules={[{ required: true, message: t('agentSettings.form.systemPromptRequired') }]}
            >
              <TextArea rows={6} placeholder={t('agentSettings.form.systemPromptPlaceholder')} />
            </Form.Item>

            <Form.Item label={t('agentSettings.form.tools')} name="tools">
              <Select
                mode="multiple"
                placeholder={t('agentSettings.form.toolsPlaceholder')}
                options={availableTools.map((t) => ({
                  value: t.name,
                  label: `${t.label} (${t.description})`
                }))}
                allowClear
                maxTagCount={4}
              />
            </Form.Item>

            <Form.Item
              label={t('agentSettings.form.model')}
              name="model"
              tooltip={t('agentSettings.form.modelTooltip')}
            >
              <Select
                placeholder={t('agentSettings.form.modelPlaceholder')}
                options={providerOptions}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>

            <Form.Item
              label={t('agentSettings.form.skills')}
              name="skills"
              tooltip={t('agentSettings.form.skillsTooltip')}
            >
              <Select
                mode="multiple"
                placeholder={t('agentSettings.form.skillsPlaceholder')}
                options={skills.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.description ? ` — ${s.description}` : ''}`
                }))}
                allowClear
                disabled={skills.length === 0}
                notFoundContent={
                  skills.length === 0
                    ? t('agentSettings.form.skillsNotConfigured')
                    : t('agentSettings.form.skillsNoMatch')
                }
                maxTagCount={4}
              />
            </Form.Item>
          </Form>
        </div>
      </Modal>
      {/* 隐藏文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  )
}

export default AgentSettings
