import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Flex, Modal, Spin, theme } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { Window } from '../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import { useBuildProgress } from '@renderer/hooks/useBuildProgress'
import type { GraphViewProps } from '@renderer/types/components'
import type { GraphChartData, GraphEntity, GraphData } from '@renderer/types/knowledge'
import {
  ENTITY_TYPE_COLORS,
  ENTITY_TYPE_LABELS,
  RELATION_TYPE_LABELS
} from '@renderer/types/knowledge'
import GraphCanvas from './GraphCanvas'
import EntityDetail from './EntityDetail'
import GraphToolbar from './GraphToolbar'
import DocumentPreviewModal from '@renderer/components/document/DocumentPreviewModal'

const GraphView: React.FC<GraphViewProps> = ({
  selectedWiki,
  onOpenDocInEditor,
  initialDocFilter
}) => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const { viewMessage } = useMessage()
  const { startBuild, subscribeToRefresh } = useBuildProgress()
  const [modal, contextHolder] = Modal.useModal()

  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined)

  const [docs, setDocs] = useState<{ id: number; title: string }[]>([])
  const [addedDocIds, setAddedDocIds] = useState<Set<number>>(new Set())
  const [isAppending, setIsAppending] = useState(false)
  const [isGraphLoading, setIsGraphLoading] = useState(false)
  const [docFilter, setDocFilter] = useState<number[]>(initialDocFilter ?? [])

  const [previewDoc, setPreviewDoc] = useState<{
    id: number
    title: string
    image: string | null
    summary: string | null
    tags: string | null
    created_at: string
    updated_at: string
    word_count: number
    content?: string | null
  } | null>(null)
  const [isDocPreviewOpen, setIsDocPreviewOpen] = useState(false)

  const loadGraphData = useCallback(async (wikiId: number, docIds?: number[]) => {
    setIsGraphLoading(true)
    try {
      const data = await (window as unknown as Window).api.graph.getData(wikiId, undefined, docIds)
      setGraphData(data)
      // 修复：筛选/重建后旧选中实体可能已不在图内,详情面板残留过期实体
      setSelectedEntity((prev) =>
        prev && data.entities.some((e) => e.id === prev.id) ? prev : null
      )
    } catch (error) {
      console.error('Failed to load graph data:', error)
    } finally {
      setIsGraphLoading(false)
    }
  }, [])

  const loadDocs = useCallback(async (wikiId: number) => {
    try {
      const directories = await (window as unknown as Window).api.wikis.getDirectories(wikiId)
      const docIds = new Set<number>()
      const docList: { id: number; title: string }[] = []

      for (const dir of directories) {
        const refs = await (window as unknown as Window).api.wikis.getNotesByDirectory(dir.id)
        for (const ref of refs) {
          if (!docIds.has(ref.doc_id)) {
            docIds.add(ref.doc_id)
            const doc = await (window as unknown as Window).api.docs.getById(ref.doc_id)
            if (doc) {
              docList.push({ id: doc.id, title: doc.title })
            }
          }
        }
      }

      setDocs(docList)
    } catch (error) {
      console.error('Failed to load docs:', error)
    }
  }, [])

  const loadProcessedDocIds = useCallback(async (wikiId: number) => {
    try {
      const ids = await (window as unknown as Window).api.graph.getProcessedDocIds(wikiId)
      setAddedDocIds(new Set(ids))
    } catch (error) {
      console.error('Failed to load processed doc ids:', error)
    }
  }, [])

  const graphChartData = useMemo((): GraphChartData | null => {
    if (!graphData) return null

    // 搜索/类型过滤（修复：搜索框与类型筛选状态此前无人消费,输入任何文字都无反应）
    const query = searchQuery.trim().toLowerCase()
    const filteredEntities =
      query || typeFilter
        ? graphData.entities.filter((e) => {
            if (typeFilter && e.type !== typeFilter) return false
            if (!query) return true
            let aliases: string[] = []
            if (e.aliases) {
              try {
                aliases = JSON.parse(e.aliases) as string[]
              } catch {
                aliases = []
              }
            }
            return (
              e.name.toLowerCase().includes(query) ||
              aliases.some((a) => a.toLowerCase().includes(query))
            )
          })
        : graphData.entities

    const entityMap = new Map<number, GraphEntity>()
    const entityTypeSet = new Set<string>()
    for (const entity of filteredEntities) {
      entityMap.set(entity.id, entity)
      entityTypeSet.add(entity.type)
    }

    const typeList = Array.from(entityTypeSet)
    const typeToIndex = new Map<string, number>()
    const categories = typeList.map((type, i) => {
      typeToIndex.set(type, i)
      return {
        name: ENTITY_TYPE_LABELS[type] || type,
        itemStyle: { color: ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.other }
      }
    })

    const nodes = filteredEntities.map((entity) => ({
      id: String(entity.id),
      name: entity.name,
      category: typeToIndex.get(entity.type) ?? 0,
      symbolSize: categories.length <= 10 ? 28 : categories.length <= 30 ? 20 : 14,
      original: entity
    }))

    const links = graphData.relations
      .filter((r) => entityMap.has(r.source_id) && entityMap.has(r.target_id))
      .map((r) => ({
        source: String(r.source_id),
        target: String(r.target_id),
        label: RELATION_TYPE_LABELS[r.relation_type] || r.relation_type,
        description: r.description
      }))

    return { nodes, links, categories }
  }, [graphData, searchQuery, typeFilter])

  useEffect(() => {
    loadDocs(selectedWiki.id).then()
    loadProcessedDocIds(selectedWiki.id).then()
  }, [selectedWiki.id, loadDocs, loadProcessedDocIds])

  useEffect(() => {
    loadGraphData(selectedWiki.id, docFilter.length > 0 ? docFilter : undefined).then()
  }, [selectedWiki.id, docFilter, loadGraphData])

  useEffect(() => {
    return subscribeToRefresh(selectedWiki.id, () => {
      loadGraphData(selectedWiki.id).then()
    })
  }, [selectedWiki.id, loadGraphData, subscribeToRefresh])

  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildComplete((result) => {
      setIsAppending(false)
      viewMessage(
        'graph-build',
        'success',
        `图谱构建完成！实体 ${result.entityCount}，关系 ${result.relationCount}`,
        4
      )
      if (result.wikiId === selectedWiki.id) {
        loadGraphData(selectedWiki.id).then()
        loadProcessedDocIds(selectedWiki.id).then()
      }
    })
  }, [selectedWiki.id, loadGraphData, loadProcessedDocIds, viewMessage])

  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildError((error) => {
      setIsAppending(false)
      viewMessage('graph-build-error', 'error', `图谱构建失败: ${error.error}`)
    })
  }, [viewMessage])

  const handleEntityClick = useCallback((entity: GraphEntity): void => {
    setSelectedEntity(entity)
  }, [])

  const handleBuildGraph = (): void => {
    modal.confirm({
      title: '确认构建图谱',
      content: `将为知识库「${selectedWiki.title}」重新构建知识图谱，已有图谱数据将被清除。确定继续吗？`,
      okText: '确定构建',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        const messageKey = 'graph-build-trigger'
        viewMessage(messageKey, 'loading', '正在启动图谱构建...')

        startBuild(selectedWiki.id, selectedWiki.title)

        try {
          ;(window as unknown as Window).api.graph.buildGraph(selectedWiki.id, { force: true })
          viewMessage(messageKey, 'success', '图谱构建已启动', 2)
        } catch (error) {
          viewMessage(messageKey, 'error', `启动构建失败: ${error}`)
        }
      }
    })
  }

  const handleAppendDocs = async (docIds: number[]): Promise<void> => {
    if (docIds.length === 0) return

    setIsAppending(true)
    startBuild(selectedWiki.id, selectedWiki.title)

    try {
      await (window as unknown as Window).api.graph.appendDocs(selectedWiki.id, docIds)
    } catch {
      setIsAppending(false)
    }
  }

  const handleTypeFilterChange = (value: string | undefined): void => {
    setTypeFilter(value)
  }

  const handleRelationClick = (entityId: number): void => {
    if (graphData) {
      const entity = graphData.entities.find((e) => e.id === entityId)
      if (entity) {
        setSelectedEntity(entity)
      }
    }
  }

  const handleDocClick = async (docId: number): Promise<void> => {
    // 宿主提供「打开文档编辑器」回调时，点击来源文档直接跳到编辑器（图谱↔文档双向联动）
    if (onOpenDocInEditor) {
      onOpenDocInEditor(docId)
      return
    }
    try {
      const doc = await (window as unknown as Window).api.docs.getById(docId)
      if (doc) {
        setPreviewDoc(doc)
        setIsDocPreviewOpen(true)
      }
    } catch (error) {
      console.error('Failed to load doc:', error)
    }
  }

  return (
    <>
      {contextHolder}
      <div className="h-full flex-1 flex flex-col gap-2.5">
        <div
          style={{
            background: colorBgContainer,
            borderRadius: borderRadiusLG
          }}
        >
          <GraphToolbar
            wikiTitle={selectedWiki.title}
            isLoading={false}
            searchQuery={searchQuery}
            typeFilter={typeFilter}
            entityCount={graphData?.entities.length || 0}
            relationCount={graphData?.relations.length || 0}
            docs={docs}
            addedDocIds={addedDocIds}
            isAppending={isAppending}
            docFilter={docFilter}
            isDocGraph={(initialDocFilter?.length ?? 0) > 0}
            onSearchChange={setSearchQuery}
            onTypeFilterChange={handleTypeFilterChange}
            onAppendDocs={handleAppendDocs}
            onDocFilterChange={setDocFilter}
            onBuildGraph={handleBuildGraph}
          />
        </div>

        <div className="flex-1 flex flex-row gap-2.5" style={{ minHeight: 0 }}>
          <div
            className="flex-1"
            style={{
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              overflow: 'hidden',
              minWidth: 0
            }}
          >
            {isGraphLoading ? (
              <Flex vertical align="center" justify="center" style={{ height: '100%' }} gap={16}>
                <Spin size="large">
                  <div style={{ padding: 50 }} />
                </Spin>
              </Flex>
            ) : graphChartData && graphChartData.nodes.length > 0 ? (
              <GraphCanvas
                data={graphChartData}
                onEntityClick={handleEntityClick}
                searchQuery={searchQuery}
              />
            ) : (
              <Flex vertical align="center" justify="center" style={{ height: '100%' }} gap={16}>
                <Empty description="该知识库还没有图谱数据" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleBuildGraph}>
                    开始构建图谱
                  </Button>
                </Empty>
              </Flex>
            )}
          </div>

          <div
            style={{
              width: 300,
              flexShrink: 0
            }}
          >
            <EntityDetail
              entity={selectedEntity}
              entities={graphData?.entities || []}
              relations={graphData?.relations || []}
              onRelationClick={handleRelationClick}
              onDocClick={handleDocClick}
            />
          </div>
        </div>

        <DocumentPreviewModal
          open={isDocPreviewOpen}
          onCancel={() => setIsDocPreviewOpen(false)}
          currentDoc={previewDoc}
        />
      </div>
    </>
  )
}

export default GraphView
