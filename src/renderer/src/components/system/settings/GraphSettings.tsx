import React, { useState, useEffect, useCallback } from 'react'
import { theme, Form, InputNumber, Switch, Select, Space } from 'antd'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings, GraphSettings as GraphSettingsType } from '@renderer/types/settings'
import type { ProviderOption } from '@renderer/types/components'

const GraphSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorFillAlter }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [embeddingProviders, setEmbeddingProviders] = useState<ProviderOption[]>([])

  const loadSettings = useCallback(async () => {
    const msgKey = 'graph-settings-load'
    try {
      const [result, providerList] = await Promise.all([
        (window as unknown as Window).api.systemSettings.getAll(),
        (window as unknown as Window).api.providers.getEnabled()
      ])
      setSettings(result)
      const allProviders = providerList as ProviderOption[]
      setProviders(allProviders.filter((p) => !p.tags?.includes('embedding')))
      setEmbeddingProviders(allProviders.filter((p) => p.tags?.includes('embedding')))
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  const updateSettings = async (updates: Partial<SystemSettings>): Promise<void> => {
    const msgKey = 'graph-settings-save'
    try {
      viewMessage(msgKey, 'loading', '正在保存...')
      await (window as unknown as Window).api.systemSettings.update(updates)
      viewMessage(msgKey, 'success', '保存成功', 2)
      await loadSettings()
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    }
  }

  const handleGraphChange = (field: keyof GraphSettingsType, value: unknown): void => {
    if (!settings) return
    updateSettings({ graph: { ...settings.graph, [field]: value } }).then()
  }

  const handleDefaultModelChange = (value: number): void => {
    updateSettings({ defaultModelId: value }).then()
  }

  const handleEmbeddingModelChange = (value: number): void => {
    updateSettings({ defaultEmbeddingModelId: value }).then()
  }

  return (
    <div>
      <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
        图谱构建设置
      </h3>
      <p className="text-sm mt-1 mb-4" style={{ color: colorTextSecondary }}>
        管理知识图谱构建参数与默认模型配置
      </p>

      {/* 图谱构建参数 */}
      <div className="p-4 rounded-lg mb-4" style={{ background: colorFillAlter }}>
        <div className="font-medium mb-3" style={{ color: colorText }}>
          构建参数
        </div>
        <Form layout="vertical" size="small">
          <Form.Item
            label="最大并发 LLM 调用数"
            tooltip="构建知识图谱时同时进行的 LLM 请求数量，值越大构建越快但对 API 压力也越大"
          >
            <InputNumber
              min={1}
              max={32}
              value={settings?.graph.maxConcurrency}
              onChange={(v) => v !== null && handleGraphChange('maxConcurrency', v)}
              style={{ width: 120 }}
            />
          </Form.Item>

          <Form.Item
            label="Gleaning 二次扫描"
            tooltip="实体抽取后再扫描一次，确保遗漏的实体也被发现（文档数量 ≤ 阈值时执行）"
          >
            <Space>
              <Switch
                checked={settings?.graph.enableGleaning}
                onChange={(v) => handleGraphChange('enableGleaning', v)}
              />
              <span className="text-xs" style={{ color: colorTextSecondary }}>
                {settings?.graph.enableGleaning ? '已启用' : '已禁用'}
              </span>
            </Space>
          </Form.Item>

          <Form.Item
            label="Gleaning 文档数阈值"
            tooltip="仅当知识库文档总数不超过此阈值时才执行 Gleaning，超出则跳过以节省时间"
          >
            <InputNumber
              min={0}
              max={500}
              value={settings?.graph.gleaningThreshold}
              onChange={(v) => v !== null && handleGraphChange('gleaningThreshold', v)}
              style={{ width: 120 }}
              disabled={!settings?.graph.enableGleaning}
            />
          </Form.Item>

          <Form.Item label="文本分块大小" tooltip="Markdown 文本按标题层级分块时每块的最大字符数">
            <InputNumber
              min={500}
              max={10000}
              step={100}
              value={settings?.graph.maxChunkSize}
              onChange={(v) => v !== null && handleGraphChange('maxChunkSize', v)}
              style={{ width: 140 }}
            />
          </Form.Item>
        </Form>
      </div>

      {/* 默认模型 */}
      <div className="p-4 rounded-lg mb-4" style={{ background: colorFillAlter }}>
        <div className="font-medium mb-3" style={{ color: colorText }}>
          默认模型
        </div>
        <Form layout="vertical" size="small">
          <Form.Item
            label="图谱构建使用模型"
            tooltip="构建知识图谱时默认使用的大模型，留空则使用供应商默认设置"
          >
            <Select
              placeholder="使用供应商默认设置"
              value={settings?.defaultModelId}
              onChange={handleDefaultModelChange}
              allowClear
              options={providers.map((p) => ({
                value: p.id,
                label: `${p.provider.toUpperCase()}: ${p.model}`
              }))}
              style={{ width: '100%', maxWidth: 400 }}
            />
          </Form.Item>

          <Form.Item
            label="Embedding 模型"
            tooltip="用于文本向量化嵌入的模型，仅显示标记为 Embedding 标签的供应商"
          >
            <Select
              placeholder="未设置 Embedding 模型"
              value={settings?.defaultEmbeddingModelId}
              onChange={handleEmbeddingModelChange}
              allowClear
              options={embeddingProviders.map((p) => ({
                value: p.id,
                label: `${p.provider.toUpperCase()}: ${p.model}`
              }))}
              notFoundContent={
                <span style={{ color: colorTextSecondary }}>
                  暂无 Embedding 模型，请先在供应商设置中添加
                </span>
              }
              style={{ width: '100%', maxWidth: 400 }}
            />
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}

export default GraphSettings
