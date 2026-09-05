import React, { useState, useEffect, useCallback } from 'react'
import { InputNumber, Switch, Select } from 'antd'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../resource/types/window'
import type { SystemSettings, GraphSettings as GraphSettingsType } from '@renderer/types/settings'
import type { ProviderOption } from '@renderer/types/components'
import { isEmbeddingProvider, getProviderDisplayName } from '@renderer/utils/providerMeta'
import { SettingsPageHeader, SettingsSection, SettingRow } from './SettingsUI'

const GraphSettings: React.FC = () => {
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
      setProviders(allProviders.filter((p) => !isEmbeddingProvider(p)))
      setEmbeddingProviders(allProviders.filter((p) => isEmbeddingProvider(p)))
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
      <SettingsPageHeader title="图谱构建设置" description="管理知识图谱构建参数与默认模型配置" />

      {/* 图谱构建参数 */}
      <SettingsSection title="构建参数" bodyPadding={0}>
        <SettingRow
          title="最大并发 LLM 调用数"
          description="构建知识图谱时同时进行的 LLM 请求数量，值越大构建越快但对 API 压力也越大"
          control={
            <InputNumber
              min={1}
              max={32}
              value={settings?.graph.maxConcurrency}
              onChange={(v) => v !== null && handleGraphChange('maxConcurrency', v)}
              style={{ width: 120 }}
            />
          }
        />
        <SettingRow
          title="Gleaning 二次扫描"
          description="实体抽取后再扫描一次，确保遗漏的实体也被发现"
          control={
            <Switch
              checked={settings?.graph.enableGleaning}
              onChange={(v) => handleGraphChange('enableGleaning', v)}
            />
          }
        />
        <SettingRow
          title="Gleaning 文档数阈值"
          description="仅当知识库文档总数不超过此阈值时才执行 Gleaning，超出则跳过以节省时间"
          control={
            <InputNumber
              min={0}
              max={500}
              value={settings?.graph.gleaningThreshold}
              onChange={(v) => v !== null && handleGraphChange('gleaningThreshold', v)}
              style={{ width: 120 }}
              disabled={!settings?.graph.enableGleaning}
            />
          }
        />
        <SettingRow
          title="文本分块大小"
          description="Markdown 文本按标题层级分块时每块的最大字符数"
          control={
            <InputNumber
              min={500}
              max={10000}
              step={100}
              value={settings?.graph.maxChunkSize}
              onChange={(v) => v !== null && handleGraphChange('maxChunkSize', v)}
              style={{ width: 140 }}
            />
          }
        />
      </SettingsSection>

      {/* 默认模型 */}
      <SettingsSection title="默认模型">
        <SettingRow
          title="图谱构建使用模型"
          description="构建知识图谱时默认使用的大模型，留空则使用供应商默认设置"
          control={
            <Select
              placeholder="使用供应商默认设置"
              value={settings?.defaultModelId}
              onChange={handleDefaultModelChange}
              allowClear
              options={providers.map((p) => ({
                value: p.id,
                label: `${p.provider.toUpperCase()}: ${getProviderDisplayName(p)}`
              }))}
              style={{ width: 260 }}
            />
          }
        />
        <SettingRow
          title="Embedding 模型"
          description="用于文本向量化嵌入的模型，仅显示标记为嵌入标签的供应商"
          control={
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
                <span style={{ color: 'inherit', opacity: 0.6 }}>
                  暂无 Embedding 模型，请先在模型设置中添加
                </span>
              }
              style={{ width: 260 }}
            />
          }
        />
      </SettingsSection>
    </div>
  )
}

export default GraphSettings
