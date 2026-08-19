import React, { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Input,
  Tabs,
  Tag,
  Switch,
  Empty,
  Popconfirm,
  Modal,
  Tooltip,
  theme
} from 'antd'
import {
  FolderOutlined,
  PlusOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'
import {
  SettingsPageHeader,
  SettingsSection,
  SettingRow
} from '../../../../components/system/settings/settings-ui'

/**
 * Mnemon 记忆管理（三层记忆）
 * - 热记忆：USER 用户画像 / MEMORY 项目记忆（每轮注入 prompt，容量 4KiB / 10KiB）
 * - 长期空间：Memory Spaces（PGlite 数据库 + 关系图，按需召回）
 * - 档案：Project Documents（完整 Markdown，active/archived 冷热分层）
 */

type MnemonSnapshot = Awaited<ReturnType<Window['api']['chat']['mnemonSnapshot']>>

/** 优先级圆点色（编辑部风格：克制用色） */
const IMPORTANCE_DOT: Record<string, string> = {
  critical: '#d4380d',
  normal: '#1677ff',
  low: '#bfbfbf'
}
const IMPORTANCE_LABEL: Record<string, string> = {
  critical: '重要',
  normal: '普通',
  low: '次要'
}

/** 目标选择卡片（选中：强调色左条 + 浅色底 + 强调描边） */
const TargetCard: React.FC<{
  label: string
  desc: string
  selected: boolean
  onClick: () => void
}> = ({ label, desc, selected, onClick }) => {
  const t = useThemeTokens()
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left"
      style={{
        position: 'relative',
        padding: '10px 12px 10px 16px',
        borderRadius: 8,
        cursor: 'pointer',
        border: `1px solid ${selected ? t.primary : t.cardBorder}`,
        background: selected ? t.iconBg : 'transparent',
        transition: 'border-color 0.15s, background 0.15s'
      }}
    >
      {selected && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 1.5,
            background: t.primary
          }}
        />
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: t.text, lineHeight: '19px' }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 1, lineHeight: '16px' }}>
        {desc}
      </div>
    </button>
  )
}

/** 重要性胶囊（选中：强调色描边 + 浅底） */
const ImportancePill: React.FC<{
  color: string
  label: string
  selected: boolean
  onClick: () => void
}> = ({ color, label, selected, onClick }) => {
  const t = useThemeTokens()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '18px',
        border: `1px solid ${selected ? t.primary : t.cardBorder}`,
        color: selected ? t.primary : t.textSecondary,
        background: selected ? t.iconBg : 'transparent',
        cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s'
      }}
    >
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }}
      />
      {label}
    </button>
  )
}

/** 主题化常量（暗色/亮色自适应） */
function useThemeTokens(): {
  cardBg: string
  cardBorder: string
  hairline: string
  formBg: string
  text: string
  textSecondary: string
  textTertiary: string
  iconBg: string
  trackBg: string
  primary: string
  error: string
} {
  const { token } = theme.useToken()
  return {
    cardBg: token.colorBgContainer,
    cardBorder: token.colorBorderSecondary,
    hairline: token.colorSplit,
    formBg: token.colorFillAlter,
    text: token.colorText,
    textSecondary: token.colorTextSecondary,
    textTertiary: token.colorTextTertiary,
    iconBg: token.colorPrimaryBg,
    trackBg: token.colorFillTertiary,
    primary: token.colorPrimary,
    error: token.colorError
  }
}

/** 细容量条：4px 圆角条 + 文字 */
const CapacityBar: React.FC<{
  used: number
  limit: number
}> = ({ used, limit }) => {
  const t = useThemeTokens()
  const percent = Math.min(100, Math.round((used / limit) * 100))
  const nearFull = percent >= 85
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Tooltip title={`${used} / ${limit} 字节`}>
        <div
          style={{
            width: 110,
            height: 4,
            borderRadius: 2,
            background: t.trackBg,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              borderRadius: 2,
              background: nearFull ? t.error : t.primary,
              transition: 'width 0.3s'
            }}
          />
        </div>
      </Tooltip>
      <span style={{ fontSize: 12, color: nearFull ? t.error : t.textTertiary }}>
        {used} / {limit} B
      </span>
    </div>
  )
}

/** 单条热记忆：圆点 + 内容 + 时间 + 删除（hover 显示） */
const RuntimeEntryRow: React.FC<{
  entry: { content: string; importance: string; updated_at?: string }
  onRemove: () => void
  onRemoveTitle: string
}> = ({ entry, onRemove, onRemoveTitle }) => {
  const t = useThemeTokens()
  return (
    <div
      className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors"
      style={{ borderBottom: `1px solid ${t.hairline}` }}
    >
      <span
        className="mt-[7px] rounded-full shrink-0"
        style={{ width: 7, height: 7, background: IMPORTANCE_DOT[entry.importance] ?? '#bfbfbf' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            lineHeight: '20px',
            color: t.text,
            wordBreak: 'break-all'
          }}
        >
          {entry.content}
        </div>
        <div
          style={{
            fontSize: 11,
            lineHeight: '16px',
            color: t.textTertiary,
            marginTop: 1
          }}
        >
          {IMPORTANCE_LABEL[entry.importance] ?? entry.importance}
          {entry.updated_at ? ` · ${entry.updated_at.slice(0, 10)}` : ''}
        </div>
      </div>
      <Popconfirm title={onRemoveTitle} onConfirm={onRemove} okText="删除" cancelText="取消">
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </Popconfirm>
    </div>
  )
}

/** 分组卡片：色条标题 + 容量 + 条目列表 */
const RuntimeGroupCard: React.FC<{
  title: string
  accent: string
  entries: { content: string; importance: string; updated_at?: string }[]
  usage: { used: number; limit: number }
  emptyText: string
  onRemove: (entry: { content: string }) => void
}> = ({ title, accent, entries, usage, emptyText, onRemove }) => {
  const t = useThemeTokens()
  return (
    <div
      style={{
        border: `1px solid ${t.cardBorder}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: t.cardBg
      }}
    >
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: `1px solid ${t.hairline}` }}
      >
        <span className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600 }}>
          <span style={{ width: 3, height: 14, borderRadius: 1.5, background: accent }} />
          {title}
          <span style={{ fontSize: 12, fontWeight: 400, color: t.textTertiary }}>
            {entries.length} 条
          </span>
        </span>
        <CapacityBar used={usage.used} limit={usage.limit} />
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-6" style={{ fontSize: 12, color: t.textTertiary }}>
          {emptyText}
        </div>
      ) : (
        <div className="custom-scrollbar" style={{ maxHeight: 240, overflow: 'auto' }}>
          {entries.map((entry, i) => (
            <RuntimeEntryRow
              key={i}
              entry={entry}
              onRemoveTitle="删除这条记忆？"
              onRemove={() => onRemove(entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const MemorySettings: React.FC = () => {
  const { viewMessage } = useMessage()
  const t = useThemeTokens()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [memoryPath, setMemoryPath] = useState('')
  const [savingPath, setSavingPath] = useState(false)
  const [snapshot, setSnapshot] = useState<MnemonSnapshot | null>(null)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)

  // 热记忆添加表单
  const [addTarget, setAddTarget] = useState<'user' | 'memory'>('memory')
  const [addContent, setAddContent] = useState('')
  const [addImportance, setAddImportance] = useState<'critical' | 'normal' | 'low'>('normal')
  const [adding, setAdding] = useState(false)

  // 空间创建表单
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creatingBody, setCreatingBody] = useState(false)

  // 空间内容浏览
  const [browsingBody, setBrowsingBody] = useState<{ id: string; name: string } | null>(null)
  const [bodyInsights, setBodyInsights] = useState<
    { id: string; content: string; category?: string; importance?: number; createdAt?: string }[]
  >([])
  const [browsingLoading, setBrowsingLoading] = useState(false)

  const loadSettings = useCallback(async () => {
    const msgKey = 'memory-settings-load'
    try {
      const result = await (window as unknown as Window).api.systemSettings.getAll()
      setSettings(result)
      setMemoryPath(result.chat?.memoryPath ?? '')
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  const loadSnapshot = useCallback(async () => {
    setLoadingSnapshot(true)
    try {
      const snap = await (window as unknown as Window).api.chat.mnemonSnapshot()
      setSnapshot(snap)
    } catch (error) {
      viewMessage('mnemon-snapshot', 'error', `加载记忆快照失败: ${error}`)
    } finally {
      setLoadingSnapshot(false)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  useEffect(() => {
    if (settings?.chat?.memoryPath) {
      loadSnapshot().then()
    }
  }, [settings?.chat?.memoryPath, loadSnapshot])

  const handleBrowsePath = async (): Promise<void> => {
    try {
      const path = await (window as unknown as Window).api.chat.selectMemoryDirectory()
      if (path) setMemoryPath(path)
    } catch (error) {
      viewMessage('memory-path', 'error', `选择目录失败: ${error}`)
    }
  }

  const handleSavePath = async (): Promise<void> => {
    const msgKey = 'memory-path'
    try {
      setSavingPath(true)
      const trimmed = memoryPath.trim()
      const nextChat: ChatSettings = {
        ...(settings?.chat ?? {}),
        memoryPath: trimmed || undefined
      }
      await (window as unknown as Window).api.systemSettings.update({ chat: nextChat })
      setSettings((prev) => (prev ? { ...prev, chat: nextChat } : prev))
      setMemoryPath(trimmed)
      viewMessage(msgKey, 'success', trimmed ? '记忆目录已保存' : '已清空记忆目录', 2)
      if (trimmed) {
        loadSnapshot().then()
      } else {
        setSnapshot(null)
      }
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    } finally {
      setSavingPath(false)
    }
  }

  /** 热记忆新增 */
  const handleAddRuntime = async (): Promise<void> => {
    const msgKey = 'mnemon-runtime-add'
    const content = addContent.trim()
    if (!content) {
      viewMessage(msgKey, 'warning', '请输入记忆内容', 2)
      return
    }
    setAdding(true)
    try {
      const result = await (window as unknown as Window).api.chat.mnemonRuntimeMutate({
        action: 'add',
        target: addTarget,
        content,
        importance: addImportance
      })
      viewMessage(msgKey, result.success ? 'success' : 'warning', result.message, 3)
      if (result.success) {
        setAddContent('')
        loadSnapshot().then()
      }
    } finally {
      setAdding(false)
    }
  }

  /** 热记忆删除（唯一子串定位） */
  const handleRemoveRuntime = async (entry: {
    content: string
    target: 'user' | 'memory'
  }): Promise<void> => {
    const msgKey = 'mnemon-runtime-remove'
    try {
      const oldText = entry.content.slice(0, 60)
      const result = await (window as unknown as Window).api.chat.mnemonRuntimeMutate({
        action: 'remove',
        target: entry.target,
        old_text: oldText
      })
      viewMessage(msgKey, result.success ? 'success' : 'warning', result.message, 3)
      loadSnapshot().then()
    } catch (error) {
      viewMessage(msgKey, 'error', `删除失败: ${error}`)
    }
  }

  /** 空间激活开关 */
  const handleToggleBody = async (
    id: string,
    active: boolean
  ): Promise<void> => {
    const msgKey = 'mnemon-body-toggle'
    try {
      const result = await (window as unknown as Window).api.chat.mnemonBodyUpdate(id, { active })
      viewMessage(msgKey, result.success ? 'success' : 'warning', result.message ?? '', 2)
      loadSnapshot().then()
    } catch (error) {
      viewMessage(msgKey, 'error', `更新失败: ${error}`)
    }
  }

  /** 创建空间 */
  const handleCreateBody = async (): Promise<void> => {
    const msgKey = 'mnemon-body-create'
    if (!createName.trim()) {
      viewMessage(msgKey, 'warning', '请输入空间名称', 2)
      return
    }
    setCreatingBody(true)
    try {
      const result = await (window as unknown as Window).api.chat.mnemonBodyCreate(
        createName.trim(),
        createDescription.trim()
      )
      viewMessage(msgKey, result.success ? 'success' : 'warning', result.success ? `已创建「${result.body?.name}」` : (result.message ?? ''), 3)
      if (result.success) {
        setCreateName('')
        setCreateDescription('')
        loadSnapshot().then()
      }
    } finally {
      setCreatingBody(false)
    }
  }

  /** 浏览空间内容 */
  const handleBrowseBody = async (body: { id: string; name: string }): Promise<void> => {
    setBrowsingBody(body)
    setBrowsingLoading(true)
    setBodyInsights([])
    try {
      const items = await (window as unknown as Window).api.chat.mnemonBodyList([body.id])
      setBodyInsights(items)
    } catch {
      setBodyInsights([])
    } finally {
      setBrowsingLoading(false)
    }
  }

  const runtime = snapshot?.runtime
  const userEntries = runtime?.entries.filter((e) => e.target === 'user') ?? []
  const memoryEntries = runtime?.entries.filter((e) => e.target === 'memory') ?? []
  const bodies = snapshot?.bodies?.items ?? []
  const documents = snapshot?.documents
  const configured = !!settings?.chat?.memoryPath

  const renderRuntimeTab = (): React.ReactNode => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 添加记忆 */}
      <div
        style={{
          padding: '14px',
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 10,
          background: t.formBg
        }}
      >
        {/* 目标选择卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <TargetCard
            label="用户画像"
            desc="身份 · 偏好 · 沟通风格"
            selected={addTarget === 'user'}
            onClick={() => setAddTarget('user')}
          />
          <TargetCard
            label="项目记忆"
            desc="决策 · 约定 · 可复用经验"
            selected={addTarget === 'memory'}
            onClick={() => setAddTarget('memory')}
          />
        </div>

        {/* 内容输入（下划线式） */}
        <div
          style={{
            marginTop: 12,
            borderBottom: `1px solid ${t.hairline}`,
            transition: 'border-color 0.15s',
            paddingBottom: 2
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.primary)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = t.hairline)}
        >
          <Input.TextArea
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            placeholder={
              addTarget === 'user'
                ? '输入要记住的用户信息，如：偏好深色主题、喜欢编辑部风格设计'
                : '输入要记住的项目信息，如：重构方案已定稿，底层用 LangChain'
            }
            autoSize={{ minRows: 1, maxRows: 3 }}
            style={{
              padding: '4px 0',
              fontSize: 13.5,
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              outline: 'none'
            }}
            onPressEnter={handleAddRuntime}
          />
        </div>

        {/* 重要性 + 记住 */}
        <div
          className="flex items-center justify-between gap-2 flex-wrap"
          style={{ marginTop: 10 }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 12, color: t.textTertiary }}>重要性</span>
            <ImportancePill
              color="#d4380d"
              label="重要"
              selected={addImportance === 'critical'}
              onClick={() => setAddImportance('critical')}
            />
            <ImportancePill
              color="#1677ff"
              label="普通"
              selected={addImportance === 'normal'}
              onClick={() => setAddImportance('normal')}
            />
            <ImportancePill
              color="#bfbfbf"
              label="次要"
              selected={addImportance === 'low'}
              onClick={() => setAddImportance('low')}
            />
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={adding}
            onClick={handleAddRuntime}
          >
            记住
          </Button>
        </div>

        {/* 目标说明（随选择切换） */}
        <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 10, lineHeight: '16px' }}>
          {addTarget === 'user' ? (
            <>用户画像容量 4 KiB；重要度高的条目整理时优先保留。</>
          ) : (
            <>项目记忆容量 10 KiB，写满后低优先级条目自动归档到长期空间。</>
          )}
        </div>
      </div>

      {/* 用户画像 */}
      <RuntimeGroupCard
        title="用户画像"
        accent="#1677ff"
        entries={userEntries}
        usage={runtime ? runtime.targets.user : { used: 0, limit: 4096 }}
        emptyText="暂无用户画像记忆"
        onRemove={(entry) => handleRemoveRuntime({ content: entry.content, target: 'user' })}
      />

      {/* 项目记忆 */}
      <RuntimeGroupCard
        title="项目记忆"
        accent="#52c41a"
        entries={memoryEntries}
        usage={runtime ? runtime.targets.memory : { used: 0, limit: 10240 }}
        emptyText="暂无项目记忆"
        onRemove={(entry) => handleRemoveRuntime({ content: entry.content, target: 'memory' })}
      />
    </div>
  )

  const renderBodiesTab = (): React.ReactNode => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 创建空间 */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{
          padding: '10px 12px',
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 10,
          background: t.formBg
        }}
      >
        <Input
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          placeholder="空间名称，如：Blog 项目"
          style={{ width: 170 }}
        />
        <Input
          value={createDescription}
          onChange={(e) => setCreateDescription(e.target.value)}
          placeholder="路由描述：什么内容属于这里、何时召回"
          style={{ flex: 1, minWidth: 220 }}
          onPressEnter={handleCreateBody}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={creatingBody}
          onClick={handleCreateBody}
        >
          创建空间
        </Button>
      </div>

      {bodies.length === 0 ? (
        <Empty
          description="暂无记忆空间。模型对话中可通过 mnemon_memory_body_create 工具创建，或在这里手动创建。"
          style={{ padding: '32px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bodies.map((body) => (
            <div
              key={body.id}
              className="flex items-start gap-3 px-3.5 py-3"
              style={{
                border: `1px solid ${t.cardBorder}`,
                borderRadius: 10,
                background: t.cardBg
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: body.active ? t.iconBg : t.trackBg
                }}
              >
                <DatabaseOutlined style={{ fontSize: 17, color: body.active ? t.primary : t.textTertiary }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{body.name}</span>
                  {body.active ? (
                    <Tag color="green" style={{ marginRight: 0, fontSize: 11, lineHeight: '18px' }}>
                      激活
                    </Tag>
                  ) : (
                    <Tag style={{ marginRight: 0, fontSize: 11, lineHeight: '18px' }}>未激活</Tag>
                  )}
                  {!body.healthy && <Tag color="red" style={{ marginRight: 0, fontSize: 11 }}>异常</Tag>}
                </div>
                {body.description && (
                  <div
                    style={{
                      fontSize: 12,
                      color: t.textSecondary,
                      marginTop: 2,
                      lineHeight: '17px'
                    }}
                  >
                    {body.description}
                  </div>
                )}
                <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>
                  洞察 {body.stats?.totalInsights ?? 0} · 关系 {body.stats?.edgeCount ?? 0} · 已删{' '}
                  {body.stats?.deletedInsights ?? 0}
                </div>
              </div>
              <div
                className="flex items-center gap-1 shrink-0"
                style={{ marginTop: 2 }}
              >
                <Button
                  type="text"
                  size="small"
                  disabled={!body.healthy}
                  onClick={() => handleBrowseBody({ id: body.id, name: body.name })}
                >
                  内容
                </Button>
                <Tooltip title={body.active ? '参与召回' : '不参与召回'}>
                  <Switch
                    checked={body.active}
                    size="small"
                    onChange={(checked) => handleToggleBody(body.id, checked)}
                  />
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空间内容浏览 */}
      <Modal
        open={browsingBody !== null}
        title={`「${browsingBody?.name}」内容`}
        footer={null}
        onCancel={() => setBrowsingBody(null)}
        width={640}
      >
        {browsingLoading ? (
          <Empty description="加载中…" style={{ padding: '24px 0' }} />
        ) : bodyInsights.length === 0 ? (
          <Empty description="空间内暂无内容" style={{ padding: '24px 0' }} />
        ) : (
          <div className="custom-scrollbar" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {bodyInsights.map((item) => (
              <div
                key={item.id}
                className="px-3 py-2.5"
                style={{ borderBottom: `1px solid ${t.hairline}` }}
              >
                <div style={{ fontSize: 13, lineHeight: '20px', wordBreak: 'break-all', color: t.text }}>
                  {item.content}
                </div>
                <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>
                  {item.category ?? 'general'} · 重要度 {item.importance ?? 3} ·{' '}
                  {item.createdAt?.slice(0, 10)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )

  const renderDocumentsTab = (): React.ReactNode => (
    <div>
      {!documents || documents.total === 0 ? (
        <Empty
          description="暂无项目档案。模型对话中可通过 mnemon_document_manage 工具创建设计 / 流程 / 交接文档。"
          style={{ padding: '32px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {documents.documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-3 px-3.5 py-3"
              style={{
                border: `1px solid ${t.cardBorder}`,
                borderRadius: 10,
                background: t.cardBg
              }}
            >
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: t.iconBg
                }}
              >
                <FileTextOutlined style={{ fontSize: 17, color: t.primary }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{doc.title}</span>
                  {doc.status === 'active' ? (
                    <Tag color="blue" style={{ marginRight: 0, fontSize: 11, lineHeight: '18px' }}>
                      active
                    </Tag>
                  ) : (
                    <Tag style={{ marginRight: 0, fontSize: 11, lineHeight: '18px' }}>archived</Tag>
                  )}
                </div>
                {doc.excerpt && (
                  <div
                    style={{
                      fontSize: 12,
                      color: t.textSecondary,
                      marginTop: 2,
                      lineHeight: '17px'
                    }}
                  >
                    {doc.excerpt}
                  </div>
                )}
                <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 4 }}>
                  更新于 {doc.updatedAt.slice(0, 16).replace('T', ' ')} · revision {doc.revision}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div>
      <SettingsPageHeader
        title="记忆（Mnemon）"
        description="三层记忆：热记忆（每轮注入）· 长期记忆空间（按需召回）· 项目档案（完整文档）。统一存储于记忆目录下。"
      />

      {/* 目录选择 */}
      <SettingsSection title="记忆存储目录" icon={<FolderOutlined size={14} />} bodyPadding={16}>
        <div style={{ display: 'flex', gap: 8, maxWidth: 720, flexWrap: 'wrap' }}>
          <Input
            value={memoryPath}
            onChange={(e) => setMemoryPath(e.target.value)}
            placeholder="例如：E:\RytenBench\Memory（留空不启用）"
            allowClear
            style={{ flex: 1, minWidth: 320 }}
          />
          <Button onClick={handleBrowsePath}>浏览…</Button>
          <Button
            type="primary"
            loading={savingPath}
            disabled={memoryPath.trim() === (settings?.chat?.memoryPath ?? '')}
            onClick={handleSavePath}
          >
            保存
          </Button>
        </div>
        {settings?.chat?.memoryPath && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12,
              opacity: 0.65,
              wordBreak: 'break-all'
            }}
          >
            当前已生效：{settings.chat.memoryPath}
          </p>
        )}
      </SettingsSection>

      {/* 未配置引导 / 三层记忆管理 */}
      {!configured ? (
        <SettingsSection title="启用记忆" icon={<DatabaseOutlined size={14} />} bodyPadding={24}>
          <Empty
            imageStyle={{ height: 56 }}
            description={
              <span style={{ fontSize: 13 }}>
                未配置记忆目录，模型将没有持久记忆。
                <br />
                在上方选择一个目录（如 E:\RytenBench\Memory）并保存即可启用三层记忆。
              </span>
            }
          />
        </SettingsSection>
      ) : (
        <SettingsSection
          title="记忆管理"
          icon={<DatabaseOutlined size={14} />}
          bodyPadding={12}
          extra={
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              loading={loadingSnapshot}
              onClick={() => loadSnapshot()}
            />
          }
        >
          {loadingSnapshot && !snapshot ? (
            <Empty description="加载中…" style={{ padding: '24px 0' }} />
          ) : (
            <Tabs
              size="small"
              items={[
                { key: 'runtime', label: `热记忆（${userEntries.length + memoryEntries.length}）`, children: renderRuntimeTab() },
                { key: 'bodies', label: `长期空间（${bodies.length}）`, children: renderBodiesTab() },
                { key: 'documents', label: `档案（${documents?.total ?? 0}）`, children: renderDocumentsTab() }
              ]}
            />
          )}
        </SettingsSection>
      )}

      {/* 机制说明 */}
      <SettingsSection title="记忆机制说明" bodyPadding={16}>
        <SettingRow
          title="热记忆"
          description="USER 用户画像（4 KiB）+ MEMORY 项目记忆（10 KiB），每轮自动注入；模型用 mnemon_runtime_memory 工具维护；MEMORY 写满自动归档到长期空间。"
          control={<span />}
        />
        <SettingRow
          title="长期记忆空间"
          description="跨会话稳定洞察，每空间独立数据库 + 四类关系；mnemon_recall 召回、mnemon_remember 沉淀；激活状态控制是否参与召回。"
          control={<span />}
        />
        <SettingRow
          title="项目档案"
          description="完整 Markdown 文档（设计/流程/交接），active 参与搜索、archived 冷层；mnemon_document_manage 创建，mnemon_document_search 检索。"
          control={<span />}
        />
      </SettingsSection>
    </div>
  )
}

export default MemorySettings
