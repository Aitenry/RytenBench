import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Dropdown, Form, Input, InputNumber, Modal, Select, Switch, theme } from 'antd'
import { PlusOutlined, UploadOutlined, MoreOutlined } from '@ant-design/icons'
import {
  RiAddLine,
  RiDeleteBin6Line,
  RiEditLine,
  RiFlashlightLine,
  RiListCheck2,
  RiPlug2Line,
  RiRefreshLine
} from '@remixicon/react'
import { SkeletonSettingRows } from '@renderer/components/system/Skeleton'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTranslation } from '@renderer/i18n'
import {
  SettingsPageHeader,
  SettingsSection,
  SettingRow
} from '@renderer/components/system/settings/SettingsUI'
import { harnessApi } from '../../api'
import type { McpServerInput, McpServerView, McpToolInfo } from '../../../shared/types'

/**
 * 设置 → MCP（服务器管理）。
 *
 * 版面遵循设置页既有约定：**字段顺排**（页头 + 分区卡片 + 行式条目），不用装饰性分组标题、
 * 不用带框的信息块；分组的区分只靠纯文本标签，明细放在结构化面板里（详情与工具清单走弹窗，
 * 每行「⋯」菜单是唯一入口，不做一列平行按钮）。
 *
 * 数据流：主进程是唯一真源（配置落 electron-store，状态来自真实连接）。这一页只做三件事：
 * 读（`mcp.list`）、写（save/remove/toggle/setToolsEnabled）、触发重连（reconnect/test）。
 * 目录变化由 `mcp.onCatalogUpdated` 广播回来，因此别处（如导入）改了配置这里也会自动刷新。
 *
 * 「工具可用」的勾选不写在本页的临时 state 里，而是保存时并入 `mainAgent.mcpTools`
 * （见 shared/mcp.ts）：与智能体页的工具下拉共用同一份启用清单，避免两处各存一份。
 */

/** 表单值（env/headers 用数组形态承载键值对，提交时折叠成对象） */
interface ServerFormValues {
  name: string
  description?: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  argsText?: string
  env?: { key?: string; value?: string }[]
  cwd?: string
  url?: string
  headers?: { key?: string; value?: string }[]
  timeoutMs?: number | null
  enabled?: boolean
  toolsEnabled?: boolean
}

/** 每行「⋯」菜单里的一项 */
interface RowAction {
  key: string
  label: string
  icon: React.ReactNode
  danger?: boolean
}

const McpSettings: React.FC = () => {
  const {
    token: { colorTextSecondary, colorTextTertiary, colorSuccess, colorError, colorFillAlter }
  } = theme.useToken()
  const { t } = useTranslation()
  const { viewMessage } = useMessage()
  const { modal, message } = App.useApp()

  const [servers, setServers] = useState<McpServerView[]>([])
  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)
  /** 已启用给模型的工具名（与智能体页共用 mainAgent.mcpTools） */
  const [enabledTools, setEnabledTools] = useState<string[]>([])
  /** 正在切开关的服务器 id（行内开关的 loading） */
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<McpServerView | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  /** 试连结果：就地显示在表单里（成功给工具数，失败给原始错误） */
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [toolsView, setToolsView] = useState<{ server: McpServerView } | null>(null)
  const [form] = Form.useForm<ServerFormValues>()
  const transport = Form.useWatch('transport', form)

  const load = useCallback(async () => {
    try {
      const [list, main] = await Promise.all([harnessApi.mcp.list(), harnessApi.mainAgent.get()])
      setServers(list)
      setEnabledTools(main.mcpTools ?? [])
    } catch (error) {
      viewMessage(
        'mcp-load',
        'error',
        t('mcpSettings.messages.loadFailedWithReason', { reason: String(error) })
      )
    } finally {
      setLoading(false)
    }
  }, [viewMessage, t])

  useEffect(() => {
    void load()
  }, [load])

  // 主进程广播目录变化（保存/导入/重连后）：本页与服务清单一并刷新
  useEffect(() => {
    try {
      return harnessApi.mcp.onCatalogUpdated(() => {
        void load()
      })
    } catch (err) {
      console.warn('[mcp-settings] 目录订阅失败:', err)
      return
    }
  }, [load])

  /** 工具名 → 是否已启用（判断某台服务器的工具当前是否进了模型工具清单） */
  const enabledSet = useMemo(() => new Set(enabledTools), [enabledTools])

  const serverEnabledCount = (view: McpServerView): number =>
    view.tools.filter((tool) => enabledSet.has(tool.name)).length

  // ── 表单：打开 / 提交 ────────────────────────────────────────────────

  const openCreate = (): void => {
    setEditing(null)
    setTestResult(null)
    form.resetFields()
    form.setFieldsValue({ transport: 'stdio', enabled: true, toolsEnabled: true, env: [] })
    setFormOpen(true)
  }

  const openEdit = (view: McpServerView): void => {
    const config = view.config
    setEditing(view)
    setTestResult(null)
    form.setFieldsValue({
      name: config.name,
      description: config.description,
      transport: config.transport,
      command: config.command,
      argsText: (config.args ?? []).join('\n'),
      env: Object.entries(config.env ?? {}).map(([key, value]) => ({ key, value })),
      cwd: config.cwd,
      url: config.url,
      headers: Object.entries(config.headers ?? {}).map(([key, value]) => ({ key, value })),
      timeoutMs: config.timeoutMs ?? null,
      enabled: config.enabled,
      toolsEnabled: serverEnabledCount(view) > 0 || view.tools.length === 0
    })
    setFormOpen(true)
  }

  /** 表单值 → IPC 入参（键值对折成对象、参数按行拆、空值不落库） */
  const toInput = (values: ServerFormValues): McpServerInput => {
    const pairs = (
      rows?: { key?: string; value?: string }[]
    ): Record<string, string> | undefined => {
      const out: Record<string, string> = {}
      for (const row of rows ?? []) {
        const key = row?.key?.trim()
        if (key) out[key] = row?.value ?? ''
      }
      return Object.keys(out).length > 0 ? out : undefined
    }
    const base: McpServerInput = {
      id: editing?.config.id,
      name: values.name?.trim() ?? '',
      description: values.description?.trim() || undefined,
      enabled: values.enabled ?? true,
      transport: values.transport,
      timeoutMs: values.timeoutMs ?? undefined
    }
    if (values.transport === 'stdio') {
      return {
        ...base,
        command: values.command?.trim(),
        args: (values.argsText ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        env: pairs(values.env),
        cwd: values.cwd?.trim() || undefined
      }
    }
    return { ...base, url: values.url?.trim(), headers: pairs(values.headers) }
  }

  /** 这台服务器的全部工具名（用于并入 / 移出 mainAgent.mcpTools） */
  const toolNamesOf = (view: McpServerView): string[] => view.tools.map((tool) => tool.name)

  const handleSave = async (): Promise<void> => {
    let values: ServerFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const saved = await harnessApi.mcp.save(toInput(values))
      // 【工具可用】的落点：把这台服务器的工具并入 / 移出 mainAgent.mcpTools。
      // 关键是**先摘掉这台服务器名下的全部工具名再按勾选补回**——用户可能在服务器上
      // 删过工具，只做并集会留下永远挂不上的幽灵名字。
      const before = servers.find((s) => s.config.id === saved.id)
      const stale = before ? toolNamesOf(before) : []
      const rest = enabledTools.filter((name) => !stale.includes(name))
      // saved 刚写入、工具清单要等重连完成才有：重新拉一次列表拿到最新工具名
      const fresh = (await harnessApi.mcp.list()).find((v) => v.config.id === saved.id)
      const kept = values.toolsEnabled && fresh ? toolNamesOf(fresh) : []
      const next = Array.from(new Set([...rest, ...kept]))
      await harnessApi.mcp.setToolsEnabled(next)
      setEnabledTools(next)
      message.success(t('mcpSettings.messages.saved', { name: saved.name }))
      setFormOpen(false)
      await load()
    } catch (error) {
      viewMessage(
        'mcp-save',
        'error',
        t('mcpSettings.messages.saveFailedWithReason', { reason: String(error) })
      )
    } finally {
      setSaving(false)
    }
  }

  // ── 行操作 ──────────────────────────────────────────────────────────

  const handleToggle = async (view: McpServerView, checked: boolean): Promise<void> => {
    setTogglingId(view.config.id)
    // 乐观更新：开关的手感不该等一次真实的连接握手
    setServers((prev) =>
      prev.map((s) =>
        s.config.id === view.config.id
          ? { ...s, config: { ...s.config, enabled: checked } }
          : s
      )
    )
    try {
      await harnessApi.mcp.toggle(view.config.id, checked)
    } catch (error) {
      viewMessage(
        'mcp-toggle',
        'error',
        t('mcpSettings.list.enableFailedWithReason', { reason: String(error) })
      )
    } finally {
      setTogglingId(null)
      await load()
    }
  }

  const handleRemove = (view: McpServerView): void => {
    modal.confirm({
      title: t('mcpSettings.list.removeConfirmTitle', { name: view.config.name }),
      content: t('mcpSettings.list.removeConfirmBody'),
      okText: t('common.action.confirm'),
      okType: 'danger',
      cancelText: t('common.action.cancel'),
      onOk: async () => {
        try {
          await harnessApi.mcp.remove(view.config.id)
          // 顺手把它带来的工具从启用清单里摘掉，避免留下永远挂不上的名字
          const rest = enabledTools.filter((name) => !toolNamesOf(view).includes(name))
          await harnessApi.mcp.setToolsEnabled(rest)
          setEnabledTools(rest)
          message.success(t('mcpSettings.list.removed', { name: view.config.name }))
          await load()
        } catch (error) {
          viewMessage(
            'mcp-remove',
            'error',
            t('common.message.deleteFailedWithReason', { reason: String(error) })
          )
        }
      }
    })
  }

  const handleReconnect = async (): Promise<void> => {
    setReconnecting(true)
    try {
      await harnessApi.mcp.reconnect()
      const list = await harnessApi.mcp.list()
      setServers(list)
      message.success(
        t('mcpSettings.list.reconnectDone', { count: list.filter((v) => v.status === 'ok').length })
      )
    } catch (error) {
      viewMessage(
        'mcp-reconnect',
        'error',
        t('common.message.operationFailedWithReason', { reason: String(error) })
      )
    } finally {
      setReconnecting(false)
    }
  }

  const handleImport = async (): Promise<void> => {
    try {
      const result = await harnessApi.mcp.pickImportFile()
      if (!result) return
      if (result.imported.length === 0) {
        viewMessage('mcp-import', 'warning', t('mcpSettings.messages.importNone'))
      } else {
        message.success(t('mcpSettings.messages.importDone', { count: result.imported.length }))
      }
      if (result.failed.length > 0) {
        setTimeout(() => {
          modal.info({
            title: t('mcpSettings.messages.importPartial'),
            width: 480,
            content: (
              <ul className="pl-4 m-0 text-sm">
                {result.failed.map((item) => (
                  <li key={item.name}>
                    {item.name}: {item.reason}
                  </li>
                ))}
              </ul>
            )
          })
        }, 300)
      }
      await load()
    } catch (error) {
      viewMessage(
        'mcp-import',
        'error',
        t('mcpSettings.messages.importFailedWithReason', { reason: String(error) })
      )
    }
  }

  const handleTest = async (): Promise<void> => {
    let values: ServerFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await harnessApi.mcp.test(toInput(values))
      if (result.ok) {
        const count = result.tools?.length ?? 0
        setTestResult({
          ok: true,
          text: count
            ? t('mcpSettings.form.testOk', { count })
            : t('mcpSettings.form.testEmpty')
        })
      } else {
        setTestResult({ ok: false, text: result.error ?? t('mcpSettings.form.testFailed') })
      }
    } catch (error) {
      setTestResult({ ok: false, text: String(error) })
    } finally {
      setTesting(false)
    }
  }

  // ── 版面片段 ────────────────────────────────────────────────────────

  /** 状态：小圆点 + 文案（颜色是唯一的状态语言，与列表其它页一致） */
  const statusNode = (view: McpServerView): React.ReactNode => {
    const color =
      view.status === 'ok'
        ? colorSuccess
        : view.status === 'error'
          ? colorError
          : colorTextTertiary
    return (
      <span className="flex items-center" style={{ gap: 6, fontSize: 12, color }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            display: 'inline-block'
          }}
        />
        {t(`mcpSettings.status.${view.status}`)}
      </span>
    )
  }

  /** 一行副标题：连接目标 + 工具计数（命令/地址是要给用户看的信息，不藏进 tooltip） */
  const subtitleNode = (view: McpServerView): React.ReactNode => {
    const config = view.config
    const target =
      config.transport === 'stdio'
        ? [config.command, ...(config.args ?? [])].filter(Boolean).join(' ')
        : (config.url ?? '')
    return (
      <span style={{ fontSize: 12, color: colorTextTertiary, wordBreak: 'break-all' }}>
        {target}
        {view.tools.length > 0 ? ` · ${t('mcpSettings.list.toolCount', { count: view.tools.length })}` : ''}
        {view.status === 'error' && view.error ? ` · ${view.error}` : ''}
      </span>
    )
  }

  /** 「⋯」菜单项：一个功能一个入口，不做一列文字按钮 */
  const actionsOf = (): RowAction[] => [
    {
      key: 'tools',
      label: t('mcpSettings.list.viewTools'),
      icon: <RiListCheck2 size={14} />
    },
    { key: 'edit', label: t('mcpSettings.list.edit'), icon: <RiEditLine size={14} /> },
    { key: 'reconnect', label: t('mcpSettings.list.manual'), icon: <RiRefreshLine size={14} /> },
    {
      key: 'remove',
      label: t('mcpSettings.list.remove'),
      icon: <RiDeleteBin6Line size={14} />,
      danger: true
    }
  ]

  const onAction = (view: McpServerView, key: string): void => {
    if (key === 'tools') setToolsView({ server: view })
    else if (key === 'edit') openEdit(view)
    else if (key === 'reconnect') void handleReconnect()
    else if (key === 'remove') handleRemove(view)
  }

  const isStdio = transport !== 'http' && transport !== 'sse'

  return (
    <div>
      <SettingsPageHeader
        title={t('mcpSettings.pageTitle')}
        description={t('mcpSettings.pageDescription')}
      />

      <SettingsSection
        title={t('mcpSettings.list.sectionTitle')}
        icon={<RiPlug2Line size={14} />}
        extra={
          <div className="flex items-center" style={{ gap: 8 }}>
            <Button
              icon={<RiRefreshLine size={14} />}
              size="small"
              loading={reconnecting}
              onClick={handleReconnect}
            >
              {t('mcpSettings.list.reconnect')}
            </Button>
            <Button icon={<UploadOutlined />} size="small" onClick={handleImport}>
              {t('mcpSettings.list.importFile')}
            </Button>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreate}>
              {t('mcpSettings.list.newServer')}
            </Button>
          </div>
        }
      >
        {loading ? (
          <div style={{ padding: '4px 0' }}>
            <SkeletonSettingRows rows={3} />
          </div>
        ) : servers.length === 0 ? (
          <div
            style={{
              padding: '28px 0',
              textAlign: 'center',
              fontSize: 13,
              color: colorTextSecondary
            }}
          >
            {t('mcpSettings.list.empty')}
          </div>
        ) : (
          servers.map((view) => {
            const enabledCount = serverEnabledCount(view)
            return (
              <SettingRow
                key={view.config.id}
                title={view.config.name}
                description={view.config.description || undefined}
                control={
                  <div className="flex items-center" style={{ gap: 8 }}>
                    {statusNode(view)}
                    <Switch
                      size="small"
                      checked={view.config.enabled}
                      loading={togglingId === view.config.id}
                      onChange={(checked) => void handleToggle(view, checked)}
                    />
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: actionsOf().map((action) => ({
                          key: action.key,
                          label: action.label,
                          icon: action.icon,
                          danger: action.danger
                        })),
                        onClick: ({ key }) => onAction(view, key)
                      }}
                    >
                      <Button type="text" size="small" icon={<MoreOutlined />} />
                    </Dropdown>
                  </div>
                }
              >
                <div style={{ marginTop: 2 }}>{subtitleNode(view)}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: colorTextTertiary }}>
                  {view.tools.length === 0
                    ? ''
                    : enabledCount > 0
                      ? t('mcpSettings.list.enabledForModel', { count: enabledCount })
                      : t('mcpSettings.list.notEnabledForModel')}
                </div>
              </SettingRow>
            )
          })
        )}
      </SettingsSection>

      {/* ── 新增 / 编辑 ── */}
      <Modal
        open={formOpen}
        title={
          editing
            ? t('mcpSettings.form.editTitle', { name: editing.config.name })
            : t('mcpSettings.form.createTitle')
        }
        onCancel={() => setFormOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={620}
        okText={t('common.action.save')}
        cancelText={t('common.action.cancel')}
        footer={[
          <Button key="test" onClick={handleTest} loading={testing}>
            {testing ? t('mcpSettings.form.testing') : t('mcpSettings.form.test')}
          </Button>,
          <Button key="cancel" onClick={() => setFormOpen(false)}>
            {t('common.action.cancel')}
          </Button>,
          <Button key="save" type="primary" loading={saving} onClick={handleSave}>
            {t('common.action.save')}
          </Button>
        ]}
      >
        <Form form={form} layout="vertical" size="small" style={{ paddingTop: 4 }}>
          {/* 基本信息（纯文本分组标签，不用装饰性标题） */}
          <div style={{ fontSize: 12, color: colorTextTertiary, margin: '2px 0 8px' }}>
            {t('mcpSettings.form.groups.basic')}
          </div>
          <Form.Item
            label={t('mcpSettings.field.name')}
            name="name"
            rules={[{ required: true, message: t('mcpSettings.field.namePlaceholder') }]}
            extra={t('mcpSettings.field.nameHint')}
          >
            <Input placeholder={t('mcpSettings.field.namePlaceholder')} />
          </Form.Item>
          <Form.Item label={t('mcpSettings.field.description')} name="description">
            <Input placeholder={t('mcpSettings.field.descriptionPlaceholder')} />
          </Form.Item>

          <div style={{ fontSize: 12, color: colorTextTertiary, margin: '10px 0 8px' }}>
            {t('mcpSettings.form.groups.connection')}
          </div>
          <Form.Item
            label={t('mcpSettings.field.transport')}
            name="transport"
            extra={t('mcpSettings.field.transportHint')}
          >
            <Select
              options={[
                { value: 'stdio', label: t('mcpSettings.transport.stdio') },
                { value: 'http', label: t('mcpSettings.transport.http') },
                { value: 'sse', label: t('mcpSettings.transport.sse') }
              ]}
            />
          </Form.Item>

          {isStdio ? (
            <>
              <Form.Item
                label={t('mcpSettings.field.command')}
                name="command"
                rules={[{ required: true, message: t('mcpSettings.field.commandPlaceholder') }]}
              >
                <Input placeholder={t('mcpSettings.field.commandPlaceholder')} />
              </Form.Item>
              <Form.Item
                label={t('mcpSettings.field.args')}
                name="argsText"
                extra={t('mcpSettings.field.argsHint')}
              >
                <Input.TextArea
                  rows={2}
                  placeholder={t('mcpSettings.field.argsPlaceholder')}
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
              <KeyValueList
                name="env"
                label={t('mcpSettings.field.env')}
                keyPlaceholder={t('mcpSettings.field.envPlaceholder')}
                addLabel={t('mcpSettings.field.addEnv')}
                extra={editing ? t('mcpSettings.field.secretsKept') : undefined}
              />
              <Form.Item label={t('mcpSettings.field.cwd')} name="cwd">
                <Input placeholder={t('mcpSettings.field.cwdPlaceholder')} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                label={t('mcpSettings.field.url')}
                name="url"
                rules={[{ required: true, message: t('mcpSettings.field.urlPlaceholder') }]}
              >
                <Input placeholder={t('mcpSettings.field.urlPlaceholder')} />
              </Form.Item>
              <KeyValueList
                name="headers"
                label={t('mcpSettings.field.headers')}
                keyPlaceholder={t('mcpSettings.field.headerPlaceholder')}
                addLabel={t('mcpSettings.field.addHeader')}
                extra={editing ? t('mcpSettings.field.secretsKept') : undefined}
              />
            </>
          )}

          <div style={{ fontSize: 12, color: colorTextTertiary, margin: '10px 0 8px' }}>
            {t('mcpSettings.form.groups.options')}
          </div>
          <div className="flex gap-3">
            <Form.Item label={t('mcpSettings.field.timeout')} name="timeoutMs" style={{ flex: 1 }}>
              <InputNumber
                min={1000}
                step={1000}
                style={{ width: '100%' }}
                placeholder={t('mcpSettings.field.timeoutPlaceholder')}
              />
            </Form.Item>
            <Form.Item
              label={t('mcpSettings.field.enabled')}
              name="enabled"
              valuePropName="checked"
              style={{ flex: 1 }}
              extra={t('mcpSettings.field.enabledHint')}
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label={t('mcpSettings.field.toolsEnabled')}
              name="toolsEnabled"
              valuePropName="checked"
              style={{ flex: 1 }}
              extra={t('mcpSettings.field.toolsEnabledHint')}
            >
              <Switch />
            </Form.Item>
          </div>

          {/* 试连结果就地显示：成功给工具数，失败给原始错误（用户据此改配置） */}
          {testResult && (
            <div
              style={{
                fontSize: 12,
                color: testResult.ok ? colorSuccess : colorError,
                wordBreak: 'break-all',
                background: colorFillAlter,
                borderRadius: 6,
                padding: '6px 8px'
              }}
            >
              <RiFlashlightLine size={12} style={{ marginRight: 6 }} />
              {testResult.text}
            </div>
          )}
        </Form>
      </Modal>

      {/* ── 工具清单（结构化明细：名称 + 描述两列对齐） ── */}
      <Modal
        open={Boolean(toolsView)}
        title={toolsView?.server.config.name}
        onCancel={() => setToolsView(null)}
        footer={null}
        width={560}
      >
        {toolsView && toolsView.server.tools.length > 0 ? (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {toolsView.server.tools.map((tool: McpToolInfo, index) => (
              <div
                key={tool.name}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: index === 0 ? 'none' : `1px solid ${colorFillAlter}`
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: colorTextSecondary,
                    flex: '0 0 auto',
                    minWidth: 140
                  }}
                >
                  {tool.rawName}
                </span>
                <span style={{ fontSize: 12, color: colorTextTertiary, minWidth: 0 }}>
                  {tool.description || '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: colorTextSecondary }}>
            {toolsView?.server.error ?? t('mcpSettings.form.testEmpty')}
          </div>
        )}
      </Modal>
    </div>
  )
}

/**
 * 键值对列表（env / headers 共用）。
 *
 * 用 antd `Form.List` 而不是自造 state：删除某一项后索引要跟着重排（自造 state 最容易
 * 在这里错位——删了第 2 行、值却留在第 3 行）。敏感值用 `Input.Password`，
 * 回显的是掩码串（主进程不下发明文）。
 */
const KeyValueList: React.FC<{
  name: string
  label: string
  keyPlaceholder: string
  addLabel: string
  extra?: string
}> = ({ name, label, keyPlaceholder, addLabel, extra }) => {
  const { colorTextTertiary } = theme.useToken().token
  return (
    <Form.Item label={label} extra={extra} style={{ marginBottom: 12 }}>
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <div className="flex flex-col" style={{ gap: 6 }}>
            {fields.map((field) => (
              <div key={field.key} className="flex items-center" style={{ gap: 6 }}>
                <Form.Item name={[field.name, 'key']} noStyle>
                  <Input placeholder={keyPlaceholder} style={{ flex: 1 }} />
                </Form.Item>
                <Form.Item name={[field.name, 'value']} noStyle>
                  <Input.Password placeholder="••••" style={{ flex: 1 }} visibilityToggle={false} />
                </Form.Item>
                <Button
                  type="text"
                  size="small"
                  icon={<RiDeleteBin6Line size={14} />}
                  onClick={() => remove(field.name)}
                />
              </div>
            ))}
            <Button
              type="dashed"
              size="small"
              icon={<RiAddLine size={14} />}
              onClick={() => add({ key: '', value: '' })}
              style={{ color: colorTextTertiary }}
            >
              {addLabel}
            </Button>
          </div>
        )}
      </Form.List>
    </Form.Item>
  )
}

export default McpSettings
