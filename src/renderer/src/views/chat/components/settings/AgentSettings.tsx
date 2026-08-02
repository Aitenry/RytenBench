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
  Divider,
  message
} from 'antd'
import {
  LoadingOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ImportOutlined
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { AgentConfigRow, AgentConfigInput } from '../../../../../../main/database/mapper/agent'
import type { ProviderOption } from '@renderer/types/components'
import type { ToolInfo } from '../../../../../resource/types/window'
import { toolIconMap } from '../ChatConstants'

const { TextArea } = Input

const PAGE_SIZE = 5

const AgentSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorTextTertiary, colorFillAlter }
  } = theme.useToken()

  const { viewMessage } = useMessage()

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
        viewMessage('agent-load', 'error', `加载失败: ${error}`)
      } finally {
        setLoading(false)
      }
    },
    [viewMessage]
  )

  const loadOptions = useCallback(async () => {
    try {
      const [providerList, tools, skillList, main, settings] = await Promise.all([
        (window as unknown as Window).api.providers.getEnabled(),
        (window as unknown as Window).api.chat.getTools(),
        (window as unknown as Window).api.chat.listSkills(),
        (window as unknown as Window).api.mainAgent.get(),
        (window as unknown as Window).api.systemSettings.getAll()
      ])
      setProviders((providerList as ProviderOption[]).filter((p) => !p.tags?.includes('embedding')))
      setAvailableTools(tools)
      setSkills(skillList)
      setMainAgent({
        tools: ((main as Record<string, unknown>).tools as string[]) ?? [],
        skills: ((main as Record<string, unknown>).skills as string[]) ?? []
      })
      const wsId = (settings as unknown as Record<string, unknown>)?.chat
        ? ((((settings as unknown as Record<string, unknown>).chat as Record<string, unknown>)
            ?.activeWorkspaceId as number) ?? 0)
        : 0
      setWorkspaceId(wsId)
      return wsId
    } catch (error) {
      viewMessage('agent-options', 'error', `加载选项失败: ${error}`)
      return 0
    }
  }, [viewMessage])

  useEffect(() => {
    loadOptions().then((wsId) => {
      loadPage(1, wsId)
    })
  }, [loadPage, loadOptions])

  // ===== 主智能体 =====

  const handleMainSave = async (): Promise<void> => {
    setMainSaving(true)
    try {
      await (window as unknown as Window).api.mainAgent.update(mainAgent)
      viewMessage('main-save', 'success', '主智能体已保存', 2)
    } catch (error) {
      viewMessage('main-save', 'error', `保存失败: ${error}`)
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
        viewMessage('agent-save', 'success', '智能体已更新', 2)
      } else {
        await (window as unknown as Window).api.agents.create(input)
        viewMessage('agent-save', 'success', '智能体已创建', 2)
      }

      setModalOpen(false)
      await loadPage(currentPage, workspaceId)
    } catch (error) {
      viewMessage('agent-save', 'error', `保存失败: ${error}`)
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
      viewMessage('agent-toggle', 'success', checked ? '已开启' : '已关闭', 1)
    } catch (error) {
      viewMessage('agent-toggle', 'error', `切换失败: ${error}`)
    }
  }

  const handleDelete = async (agent: AgentConfigRow): Promise<void> => {
    Modal.confirm({
      title: `确认删除智能体"${agent.rename || agent.name}"？`,
      content: '删除后不可恢复。',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await (window as unknown as Window).api.agents.delete(workspaceId, agent.id)
          viewMessage('agent-delete', 'success', '已删除', 2)
          await loadPage(currentPage, workspaceId)
        } catch (error) {
          viewMessage('agent-delete', 'error', `删除失败: ${error}`)
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
      message.warning('文件内容为空')
      return
    }

    let data: ImportAgentItem[]
    try {
      data = JSON.parse(raw)
    } catch {
      message.error('JSON 格式错误，请检查')
      return
    }

    if (!Array.isArray(data)) {
      message.error('JSON 内容必须是一个数组')
      return
    }

    if (data.length === 0) {
      message.warning('导入内容为空')
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
          skipped.push('(缺少 name)')
          continue
        }

        // 验证并过滤 tools
        let filteredTools: string[]
        if (Array.isArray(item.tools) && item.tools.length > 0) {
          const removed = item.tools.filter((t) => !validToolNames.has(t))
          filteredTools = item.tools.filter((t) => validToolNames.has(t))
          if (removed.length > 0) {
            stripped.push(`${item.name}: 工具 [${removed.join(', ')}] 不存在，已移除`)
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
            stripped.push(`${item.name}: 技能 [${removed.join(', ')}] 不存在，已移除`)
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
            stripped.push(`${item.name}: 模型 "${item.model}" 不存在，已移除`)
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
      message.error(`导入过程出错: ${err}`)
    } finally {
      setImportLoading(false)
    }

    // 汇总提示
    const parts: string[] = []
    if (imported > 0) parts.push(`成功导入 ${imported} 个智能体`)
    if (skipped.length > 0) parts.push(`${skipped.length} 个被跳过`)
    const summary = parts.length > 0 ? parts.join('，') : '未导入任何智能体'
    message.success(summary)

    // 逐条展示剔除提示
    if (stripped.length > 0) {
      setTimeout(() => {
        Modal.info({
          title: '以下字段已自动剔除不存在的项',
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
    reader.onerror = () => message.error('读取文件失败')
    reader.readAsText(file)
  }

  const providerOptions = providers.map((p) => ({
    value: `${p.provider}:${p.model}`,
    label: `${p.name} (${p.provider}:${p.model})`
  }))

  return (
    <div>
      {/* ====== 主智能体 ====== */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
              主智能体
            </h3>
            <p className="text-sm mt-1 mb-0" style={{ color: colorTextSecondary }}>
              配置主智能体的默认工具和技能
            </p>
          </div>
          <Button type="primary" size="small" loading={mainSaving} onClick={handleMainSave}>
            保存
          </Button>
        </div>

        <div className="p-4 rounded-lg" style={{ background: colorFillAlter }}>
          <Form layout="vertical" size="small">
            <Form.Item label="默认工具" tooltip="选择主智能体可用的系统工具">
              <Select
                mode="multiple"
                size="small"
                placeholder="选择工具"
                value={mainAgent.tools}
                onChange={(value) => setMainAgent((prev) => ({ ...prev, tools: value }))}
                allowClear
                maxTagCount="responsive"
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
            </Form.Item>

            <Form.Item label="默认技能" tooltip="选择主智能体可用的技能">
              <Select
                mode="multiple"
                size="small"
                placeholder="选择技能（不选则无技能）"
                value={mainAgent.skills}
                onChange={(value) => setMainAgent((prev) => ({ ...prev, skills: value }))}
                allowClear
                disabled={skills.length === 0}
                notFoundContent={
                  skills.length === 0 ? '未找到技能，请先在技能设置中配置目录' : '无匹配技能'
                }
                maxTagCount="responsive"
                options={skills.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.description ? ` — ${s.description}` : ''}`
                }))}
              />
            </Form.Item>
          </Form>
        </div>
      </div>

      <Divider style={{ margin: '16px 0' }} />

      {/* ====== 子智能体列表 ====== */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
            子智能体
          </h3>
          <p className="text-sm mt-1 mb-0" style={{ color: colorTextSecondary }}>
            管理子智能体配置，只有开启的智能体才会在对话中生效
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            icon={<ImportOutlined />}
            size="small"
            loading={importLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            导入
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={() => openEditModal()}
          >
            新建
          </Button>
        </div>
      </div>

      {loading ? (
        <div
          className="p-6 rounded-lg flex items-center justify-center"
          style={{ background: colorFillAlter }}
        >
          <Spin
            indicator={<LoadingOutlined spin style={{ fontSize: 20, color: colorTextTertiary }} />}
          />
        </div>
      ) : agents.length > 0 ? (
        <div className="p-4 rounded-lg" style={{ background: colorFillAlter }}>
          <div className="font-medium mb-2" style={{ color: colorText }}>
            智能体列表（{total}）
          </div>
          <div className="flex flex-col">
            {agents.map((agent, idx) => (
              <div
                key={agent.id}
                className="flex items-center justify-between py-2.5 gap-3"
                style={{
                  borderBottom: idx < agents.length - 1 ? `1px solid ${colorTextTertiary}` : 'none'
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: colorText }}>
                      {agent.rename || agent.name}
                    </span>
                    {agent.rename && (
                      <span className="text-xs" style={{ color: colorTextTertiary }}>
                        ({agent.name})
                      </span>
                    )}
                    <Switch
                      checked={agent.enable}
                      onChange={(checked) => handleToggleEnable(agent, checked)}
                      size="small"
                    />
                  </div>
                  {agent.description && (
                    <div
                      className="text-xs mt-0.5 line-clamp-2"
                      style={{ color: colorTextSecondary }}
                    >
                      {agent.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {agent.tools && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: colorFillAlter,
                          color: colorTextTertiary
                        }}
                      >
                        {(JSON.parse(agent.tools) as string[]).length} 个工具
                      </span>
                    )}
                    {agent.model && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: colorFillAlter,
                          color: colorTextTertiary
                        }}
                      >
                        {agent.model}
                      </span>
                    )}
                    {agent.skills && JSON.parse(agent.skills).length > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: colorFillAlter,
                          color: colorTextTertiary
                        }}
                      >
                        {(JSON.parse(agent.skills) as string[]).length} 个技能
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
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
              </div>
            ))}
          </div>
          {total > PAGE_SIZE && (
            <div className="mt-3 flex justify-center">
              <Pagination
                current={currentPage}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={(page) => loadPage(page, workspaceId)}
                size="small"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 rounded-lg text-center" style={{ background: colorFillAlter }}>
          <p className="text-sm m-0" style={{ color: colorTextSecondary }}>
            暂无智能体，点击&ldquo;新建&rdquo;创建
          </p>
        </div>
      )}

      {/* 编辑/创建弹窗 */}
      <Modal
        title={
          editingAgent ? `编辑智能体: ${editingAgent.rename || editingAgent.name}` : '新建智能体'
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={640}
        destroyOnHidden
        okText="保存"
        cancelText="取消"
        styles={{ body: { padding: 0 } }}
      >
        <div className="py-4 px-5 custom-scrollbar" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <Form form={form} layout="vertical" size="small">
            <div className="flex gap-3 items-end">
              <Form.Item label="中文名称" name="rename" style={{ flex: 1 }}>
                <Input placeholder="如 研究代理（可选）" />
              </Form.Item>
              <Form.Item
                label="英文标识名"
                name="name"
                rules={[
                  { required: true, message: '请输入英文标识名' },
                  {
                    pattern: /^[a-z][a-z0-9-]*$/,
                    message: '只能包含小写字母、数字和连字符'
                  }
                ]}
                style={{ flex: 1 }}
              >
                <Input placeholder="如 research-agent" />
              </Form.Item>
              <Form.Item label="启用" name="enable" valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>

            <Form.Item
              label="功能描述"
              name="description"
              rules={[{ required: true, message: '请输入功能描述' }]}
            >
              <TextArea rows={3} placeholder="描述智能体的功能，主智能体据此决定何时委托任务" />
            </Form.Item>

            <Form.Item
              label="系统提示词"
              name="prompt"
              rules={[{ required: true, message: '请输入系统提示词' }]}
            >
              <TextArea rows={6} placeholder="智能体的系统角色和行为规范" />
            </Form.Item>

            <Form.Item label="可用工具" name="tools">
              <Select
                mode="multiple"
                placeholder="选择智能体可用的系统工具（不选则无工具）"
                options={availableTools.map((t) => ({
                  value: t.name,
                  label: `${t.label} (${t.description})`
                }))}
                allowClear
                maxTagCount={4}
              />
            </Form.Item>

            <Form.Item
              label="模型（可选）"
              name="model"
              tooltip="覆盖主智能体的模型，留空则使用主智能体模型。仅显示非 Embedding 模型"
            >
              <Select
                placeholder="使用主智能体默认模型"
                options={providerOptions}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>

            <Form.Item
              label="技能（可选）"
              name="skills"
              tooltip="从已加载的技能目录中选择智能体可用的技能"
            >
              <Select
                mode="multiple"
                placeholder="选择智能体可用的技能（不选则无技能）"
                options={skills.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.description ? ` — ${s.description}` : ''}`
                }))}
                allowClear
                disabled={skills.length === 0}
                notFoundContent={
                  skills.length === 0 ? '未找到技能，请先在技能设置中配置目录' : '无匹配技能'
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
