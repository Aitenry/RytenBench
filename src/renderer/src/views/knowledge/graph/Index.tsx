import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Flex, Modal, Select, theme, Typography } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import GraphCanvas, { GraphChartData } from './GraphCanvas'
import EntityDetail from './EntityDetail'
import GraphToolbar from './GraphToolbar'
import BuildProgress from './BuildProgress'
import DocPreviewModal from '@renderer/components/DocPreviewModal'
import {
  ENTITY_TYPE_COLORS,
  ENTITY_TYPE_LABELS,
  GraphData,
  GraphEntity,
  RELATION_TYPE_LABELS,
  WikiRow
} from './types'

const { Text } = Typography

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  // Wiki selection state
  const [wikis, setWikis] = useState<WikiRow[]>([])
  const [selectedWiki, setSelectedWiki] = useState<WikiRow | null>(null)

  // Graph data state
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined)

  // Build progress state
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildPhase, setBuildPhase] = useState('')
  const [buildProcessed, setBuildProcessed] = useState(0)
  const [buildTotal, setBuildTotal] = useState(0)
  const [buildMessage, setBuildMessage] = useState('')
  const [showBuildProgress, setShowBuildProgress] = useState(false)

  // Append doc state
  const [docs, setDocs] = useState<{ id: number; title: string }[]>([])
  const [addedDocIds, setAddedDocIds] = useState<Set<number>>(new Set())
  const [isAppending, setIsAppending] = useState(false)

  // Doc preview state
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

  // Load wikis list
  const loadWikis = useCallback(async () => {
    try {
      const result = await (window as unknown as Window).api.wikis.getAll(1, 100)
      setWikis(result.items)
    } catch (error) {
      console.error('Failed to load wikis:', error)
    }
  }, [])

  // Doc filter state (empty = show all)
  const [docFilter, setDocFilter] = useState<number[]>([])

  // Load all graph data for selected wiki (entities + relations at once)
  const loadGraphData = useCallback(async (wikiId: number, docIds?: number[]) => {
    try {
      const data = await (window as unknown as Window).api.graph.getData(wikiId, undefined, docIds)
      setGraphData(data)
      if (data.entities.length === 0) {
        setSelectedEntity(null)
      }
    } catch (error) {
      console.error('Failed to load graph data:', error)
    }
  }, [])

  // Load docs list for the selected wiki
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

  // Load processed doc IDs (already in graph)
  const loadProcessedDocIds = useCallback(async (wikiId: number) => {
    try {
      const ids = await (window as unknown as Window).api.graph.getProcessedDocIds(wikiId)
      setAddedDocIds(new Set(ids))
    } catch (error) {
      console.error('Failed to load processed doc ids:', error)
    }
  }, [])

  // Build ECharts graph data from entities + relations
  // Database: graph_relations.source_id / target_id → graph_entities.id
  // Main process returns: { entities: GraphEntity[], relations: GraphRelation[] }
  // ECharts graph format: { nodes: [{id,name,category,original}], links: [{source,target,label}], categories: [{name,itemStyle}] }
  const graphChartData = useMemo((): GraphChartData | null => {
    if (!graphData) return null

    // Build entity ID → entity lookup for relation resolution
    const entityMap = new Map<number, GraphEntity>()
    const entityTypeSet = new Set<string>()
    for (const entity of graphData.entities) {
      entityMap.set(entity.id, entity)
      entityTypeSet.add(entity.type)
    }

    // Build categories from unique entity types (for legend & color mapping)
    const typeList = Array.from(entityTypeSet)
    const typeToIndex = new Map<string, number>()
    const categories = typeList.map((type, i) => {
      typeToIndex.set(type, i)
      return {
        name: ENTITY_TYPE_LABELS[type] || type,
        itemStyle: { color: ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.other }
      }
    })

    // Build nodes from entities
    const nodes = graphData.entities.map((entity) => ({
      id: String(entity.id),
      name: entity.name,
      category: typeToIndex.get(entity.type) ?? 0,
      symbolSize: categories.length <= 10 ? 28 : categories.length <= 30 ? 20 : 14,
      original: entity
    }))

    // Build links from relations, filtering orphaned references
    const links = graphData.relations
      .filter((r) => entityMap.has(r.source_id) && entityMap.has(r.target_id))
      .map((r) => ({
        source: String(r.source_id),
        target: String(r.target_id),
        label: RELATION_TYPE_LABELS[r.relation_type] || r.relation_type
      }))

    return { nodes, links, categories }
  }, [graphData])

  // Initial load
  useEffect(() => {
    loadWikis().then()
  }, [loadWikis])

  // Load docs and processed IDs only when wiki changes
  useEffect(() => {
    if (selectedWiki) {
      loadDocs(selectedWiki.id).then()
      loadProcessedDocIds(selectedWiki.id).then()
    }
  }, [selectedWiki, loadDocs, loadProcessedDocIds])

  // Load graph when wiki or docFilter changes
  useEffect(() => {
    if (selectedWiki) {
      loadGraphData(selectedWiki.id, docFilter.length > 0 ? docFilter : undefined).then()
    }
  }, [selectedWiki, docFilter, loadGraphData])

  // Listen for build progress
  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildProgress((progress) => {
      setBuildPhase(progress.phase)
      setBuildProcessed(progress.processedDocs)
      setBuildTotal(progress.totalDocs)
      setBuildMessage(progress.message)
    })
  }, [])

  // Listen for build complete
  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildComplete((result) => {
      setIsBuilding(false)
      setIsAppending(false)
      setShowBuildProgress(false)
      viewMessage(
        'graph-build',
        'success',
        `图谱构建完成！实体 ${result.entityCount}，关系 ${result.relationCount}`,
        4
      )
      if (selectedWiki) {
        loadGraphData(selectedWiki.id).then()
        loadProcessedDocIds(selectedWiki.id).then()
      }
    })
  }, [selectedWiki, loadGraphData, loadProcessedDocIds, viewMessage])

  // Listen for build error
  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildError((error) => {
      setIsBuilding(false)
      setIsAppending(false)
      setShowBuildProgress(false)
      viewMessage('graph-build-error', 'error', `图谱构建失败: ${error.error}`)
    })
  }, [viewMessage])

  // Handle wiki selection
  const handleSelectWiki = (wiki: WikiRow): void => {
    setSelectedWiki(wiki)
    setSelectedEntity(null)
    setSearchQuery('')
    setTypeFilter(undefined)
  }

  // Handle entity click
  const handleEntityClick = useCallback((entity: GraphEntity): void => {
    setSelectedEntity(entity)
  }, [])

  // Handle build graph
  const handleBuildGraph = async (): Promise<void> => {
    if (!selectedWiki) return

    Modal.confirm({
      title: '确认构建图谱',
      content: `将为知识库「${selectedWiki.title}」重新构建知识图谱，已有图谱数据将被清除。确定继续吗？`,
      okText: '确定构建',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        const messageKey = 'graph-build-trigger'
        viewMessage(messageKey, 'loading', '正在启动图谱构建...')

        setIsBuilding(true)
        setShowBuildProgress(true)
        setBuildPhase('collect')
        setBuildProcessed(0)
        setBuildTotal(0)
        setBuildMessage('初始化...')

        try {
          ;(window as unknown as Window).api.graph.buildGraph(selectedWiki.id, { force: true })
          viewMessage(messageKey, 'success', '图谱构建已启动', 2)
        } catch (error) {
          setIsBuilding(false)
          setShowBuildProgress(false)
          viewMessage(messageKey, 'error', `启动构建失败: ${error}`)
        }
      }
    })
  }

  // Handle back to wiki list
  const handleBackToWikiList = (): void => {
    setSelectedWiki(null)
    setGraphData(null)
    setSelectedEntity(null)
    setSearchQuery('')
    setTypeFilter(undefined)
    setDocFilter([])
  }

  // Handle append docs to graph
  const handleAppendDocs = async (docIds: number[]): Promise<void> => {
    if (!selectedWiki || docIds.length === 0) return

    setIsAppending(true)
    setShowBuildProgress(true)
    setBuildPhase('collect')
    setBuildProcessed(0)
    setBuildTotal(docIds.length)
    setBuildMessage('初始化...')

    try {
      await (window as unknown as Window).api.graph.appendDocs(selectedWiki.id, docIds)
    } catch {
      setIsAppending(false)
      setShowBuildProgress(false)
    }
  }

  // Handle type filter change
  const handleTypeFilterChange = (value: string | undefined): void => {
    setTypeFilter(value)
  }

  // Handle relation click (navigate to related entity)
  const handleRelationClick = (entityId: number): void => {
    if (graphData) {
      const entity = graphData.entities.find((e) => e.id === entityId)
      if (entity) {
        setSelectedEntity(entity)
      }
    }
  }

  // Handle doc tag click (open doc preview)
  const handleDocClick = async (docId: number): Promise<void> => {
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

  // Wiki selection view
  if (!selectedWiki) {
    return (
      <div className="h-full flex-1 flex flex-row gap-2.5">
        <main
          className="w-full"
          style={{
            background: colorBgContainer,
            borderRadius: borderRadiusLG
          }}
        >
          <div style={{ padding: '12px', height: '100%' }}>
            <Flex vertical align="center" justify="center" style={{ height: '100%' }} gap={16}>
              <Empty
                description="选择一个知识库来查看其知识图谱"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Select
                  placeholder="选择知识库"
                  style={{ width: 260 }}
                  onChange={(value) => {
                    const wiki = wikis.find((w) => w.id === value)
                    if (wiki) handleSelectWiki(wiki)
                  }}
                  options={wikis.map((wiki) => ({ value: wiki.id, label: wiki.title }))}
                  optionRender={(option) => (
                    <Flex justify="space-between" align="center">
                      <Text>{option.label}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {wikis.find((w) => w.id === option.value)?.doc_count ?? 0} 篇文档
                      </Text>
                    </Flex>
                  )}
                />
              </Empty>
            </Flex>
          </div>
        </main>
      </div>
    )
  }

  // Graph view
  return (
    <div className="h-full flex-1 flex flex-col gap-2.5">
      {/* Toolbar */}
      <div
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <GraphToolbar
          wikiTitle={selectedWiki.title}
          isLoading={isBuilding}
          searchQuery={searchQuery}
          typeFilter={typeFilter}
          entityCount={graphData?.entities.length || 0}
          relationCount={graphData?.relations.length || 0}
          docs={docs}
          addedDocIds={addedDocIds}
          isAppending={isAppending}
          docFilter={docFilter}
          onSearchChange={setSearchQuery}
          onTypeFilterChange={handleTypeFilterChange}
          onAppendDocs={handleAppendDocs}
          onDocFilterChange={setDocFilter}
          onBuildGraph={handleBuildGraph}
          onBackToWikiList={handleBackToWikiList}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-row gap-2.5" style={{ minHeight: 0 }}>
        {/* Graph canvas */}
        <div
          className="flex-1"
          style={{
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'hidden',
            minWidth: 0
          }}
        >
          {graphChartData && graphChartData.nodes.length > 0 ? (
            <GraphCanvas
              data={graphChartData}
              onEntityClick={handleEntityClick}
              searchQuery={searchQuery}
            />
          ) : (
            <Flex vertical align="center" justify="center" style={{ height: '100%' }} gap={16}>
              <Empty description="该知识库还没有图谱数据" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleBuildGraph}
                  loading={isBuilding}
                >
                  开始构建图谱
                </Button>
              </Empty>
            </Flex>
          )}
        </div>

        {/* Entity detail panel */}
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

      {/* Build progress modal */}
      <BuildProgress
        open={showBuildProgress}
        phase={buildPhase}
        processedDocs={buildProcessed}
        totalDocs={buildTotal}
        message={buildMessage}
      />

      {/* Doc preview modal */}
      <DocPreviewModal
        open={isDocPreviewOpen}
        onCancel={() => setIsDocPreviewOpen(false)}
        currentDoc={previewDoc}
      />
    </div>
  )
}

export default Index
