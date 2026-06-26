import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Flex, Select, theme, Typography } from 'antd'
import { PlayCircleOutlined } from '@ant-design/icons'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import GraphCanvas, { GraphChartData } from './GraphCanvas'
import EntityDetail from './EntityDetail'
import GraphToolbar from './GraphToolbar'
import BuildProgress from './BuildProgress'
import NotePreviewModal from '@renderer/components/NotePreviewModal'
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

  // Note preview state
  const [previewNote, setPreviewNote] = useState<{
    id: number
    title: string
    image: string | null
    summary: string | null
    tags: string | null
    version: number
    created_at: string
    updated_at: string
    word_count: number
    content?: string | null
  } | null>(null)
  const [isNotePreviewOpen, setIsNotePreviewOpen] = useState(false)

  // Load wikis list
  const loadWikis = useCallback(async () => {
    try {
      const result = await (window as unknown as Window).api.wikis.getAll(1, 100)
      setWikis(result.items)
    } catch (error) {
      console.error('Failed to load wikis:', error)
    }
  }, [])

  // Load all graph data for selected wiki (entities + relations at once)
  const loadGraphData = useCallback(async (wikiId: number) => {
    try {
      const data = await (window as unknown as Window).api.graph.getData(wikiId)
      setGraphData(data)
      if (data.entities.length === 0) {
        setSelectedEntity(null)
      }
    } catch (error) {
      console.error('Failed to load graph data:', error)
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

  // Load graph when wiki or filter changes
  useEffect(() => {
    if (selectedWiki) {
      loadGraphData(selectedWiki.id).then()
    }
  }, [selectedWiki, loadGraphData])

  // Listen for build progress
  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildProgress((progress) => {
      setBuildPhase(progress.phase)
      setBuildProcessed(progress.processedNotes)
      setBuildTotal(progress.totalNotes)
      setBuildMessage(progress.message)
    })
  }, [])

  // Listen for build complete
  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildComplete((result) => {
      setIsBuilding(false)
      setShowBuildProgress(false)
      viewMessage(
        'graph-build',
        'success',
        `图谱构建完成！实体 ${result.entityCount}，关系 ${result.relationCount}`,
        4
      )
      if (selectedWiki) {
        loadGraphData(selectedWiki.id).then()
      }
    })
  }, [selectedWiki, loadGraphData, viewMessage])

  // Listen for build error
  useEffect(() => {
    return (window as unknown as Window).api.graph.onBuildError((error) => {
      setIsBuilding(false)
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
  const handleEntityClick = (entity: GraphEntity): void => {
    setSelectedEntity(entity)
  }

  // Handle build graph
  const handleBuildGraph = async (): Promise<void> => {
    if (!selectedWiki) return

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

  // Handle back to wiki list
  const handleBackToWikiList = (): void => {
    setSelectedWiki(null)
    setGraphData(null)
    setSelectedEntity(null)
    setSearchQuery('')
    setTypeFilter(undefined)
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

  // Handle note tag click (open note preview)
  const handleNoteClick = async (noteId: number): Promise<void> => {
    try {
      const note = await (window as unknown as Window).api.notes.getById(noteId)
      if (note) {
        setPreviewNote(note)
        setIsNotePreviewOpen(true)
      }
    } catch (error) {
      console.error('Failed to load note:', error)
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
                        {wikis.find((w) => w.id === option.value)?.note_count ?? 0} 篇笔记
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
          onSearchChange={setSearchQuery}
          onTypeFilterChange={handleTypeFilterChange}
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
            onNoteClick={handleNoteClick}
          />
        </div>
      </div>

      {/* Build progress modal */}
      <BuildProgress
        open={showBuildProgress}
        phase={buildPhase}
        processedNotes={buildProcessed}
        totalNotes={buildTotal}
        message={buildMessage}
      />

      {/* Note preview modal */}
      <NotePreviewModal
        open={isNotePreviewOpen}
        onCancel={() => setIsNotePreviewOpen(false)}
        currentNote={previewNote}
      />
    </div>
  )
}

export default Index
