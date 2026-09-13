import type { zhCNGraph } from '../zh-CN/graph'

/* 关系类型在画布 tooltip 里与头尾实体名直接拼接（`头 + 标签 + 尾`，见 GraphCanvas 的 edge
   formatter），中文原样拼接即可，英文单词之间需要空格，否则会渲染成 "Alicepart ofBob"。
   这一层空格写在词条值里，不改拼接逻辑。 */
export const enUSGraph: typeof zhCNGraph = {
  entityType: {
    person: 'Person',
    organization: 'Organization',
    concept: 'Concept',
    event: 'Event',
    location: 'Location',
    other: 'Other',
    technology: 'Technology',
    product: 'Product',
    system: 'System',
    document: 'Document',
    standard: 'Standard',
    facility: 'Facility',
    substance: 'Substance',
    process: 'Process',
    role: 'Role',
    skill: 'Skill',
    measure: 'Metric',
    artifact: 'Artifact',
    creature: 'Creature',
    realm: 'Tier'
  },
  relationType: {
    contains: 'contains',
    part_of: 'part of',
    is_a: 'is a',
    located_in: 'located in',
    depends_on: 'depends on',
    related_to: 'related to',
    leads_to: 'leads to',
    uses: 'uses',
    creates: 'creates',
    produces: 'produces',
    operates: 'operates',
    owns: 'owns',
    acquires: 'acquires',
    belongs_to: 'belongs to',
    governs: 'governs',
    monitors: 'monitors',
    employs: 'employs',
    mentors: 'mentors',
    friend_of: 'friend of',
    enemy_of: 'enemy of',
    loves: 'loves',
    family_of: 'family of',
    fights: 'fights',
    kills: 'kills'
  },
  empty: {
    noData: 'This knowledge base has no graph data yet',
    startBuild: 'Start building the graph',
    noSelection: 'Click a node in the graph to view its details'
  },
  toolbar: {
    stats: 'Entities {{entityCount}} | Relations {{relationCount}}',
    searchPlaceholder: 'Search entities...',
    allDocs: 'All documents',
    noDocs: 'No documents',
    appendModalTitle: 'Select documents to append to the graph',
    appendHint_one:
      'Documents already in the graph are hidden from this list ({{count}} document added)',
    appendHint_other:
      'Documents already in the graph are hidden from this list ({{count}} documents added)',
    appendSearchPlaceholder: 'Search and select documents...',
    allDocsAdded: 'All documents are already in the graph',
    appendConfirm: 'Append'
  },
  build: {
    confirmTitle: 'Confirm graph build',
    confirmContent:
      'The knowledge graph for "{{title}}" will be rebuilt and the existing graph data will be cleared. Continue?',
    confirmOk: 'Confirm and build',
    starting: 'Starting graph build...',
    started: 'Graph build started',
    startFailed: 'Failed to start the build: {{reason}}',
    completed: 'Graph build complete! Entities {{entityCount}}, relations {{relationCount}}',
    failed: 'Graph build failed: {{reason}}'
  },
  progress: {
    overallProgress: 'Overall progress',
    entityLabel: 'Entities',
    relationLabel: 'Relations',
    documentsProcessed: 'Processed {{processed}}/{{total}} documents',
    chunksProcessed: 'Processed {{processed}}/{{total}} chunks'
  },
  detail: {
    confidence: 'Confidence: {{percent}}%',
    description: 'Description',
    aliases: 'Aliases',
    sourceDocs_one: 'Source documents ({{count}})',
    sourceDocs_other: 'Source documents ({{count}})',
    docFallback: 'Document #{{id}}',
    relatedRelations_one: 'Relations ({{count}})',
    relatedRelations_other: 'Relations ({{count}})',
    noRelations: 'No relations',
    relationLine: '-- {{relation}} →',
    createdAt: 'Created',
    updatedAt: 'Updated'
  },
  canvas: {
    tooltipDescription: 'Description: {{description}}',
    edgeTooltip: '{{source}} {{relation}} {{target}}',
    showIsolated_one: 'Show {{count}} isolated node',
    showIsolated_other: 'Show {{count}} isolated nodes',
    hideIsolated_one: 'Hide {{count}} isolated node',
    hideIsolated_other: 'Hide {{count}} isolated nodes',
    isolatedHidden_one: '{{count}} isolated node hidden',
    isolatedHidden_other: '{{count}} isolated nodes hidden'
  }
}
