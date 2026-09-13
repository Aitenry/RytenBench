import type { zhCNMemorySettings } from '../zh-CN/memorySettings'

export const enUSMemorySettings: typeof zhCNMemorySettings = {
  page: {
    title: 'Memory (Mnemon)',
    description:
      'Three layers of memory: runtime memory (injected every turn), long-term memory spaces (recalled on demand), and project documents (full archives). Stored under the memory root directory and isolated per workspace, so each workspace keeps its own memory.'
  },
  storage: {
    sectionTitle: 'Memory storage directory',
    placeholder: 'For example: E:\\RytenBench\\Memory (leave empty to disable)',
    browse: 'Browse...',
    activePath: 'Currently in use: {{path}}',
    saved: 'Memory directory saved',
    cleared: 'Memory directory cleared',
    selectFailed: 'Failed to select directory: {{reason}}'
  },
  enable: {
    sectionTitle: 'Enable memory',
    empty: 'No memory directory is configured, so the model has no persistent memory.',
    emptyHint:
      'Pick a directory above (for example E:\\RytenBench\\Memory) and save to enable the three memory layers.'
  },
  manage: {
    sectionTitle: 'Memory management',
    snapshotFailed: 'Failed to load memory snapshot: {{reason}}'
  },
  tabs: {
    runtime: 'Runtime ({{count}})',
    bodies: 'Memory spaces ({{count}})',
    documents: 'Documents ({{count}})'
  },
  importance: {
    label: 'Importance',
    critical: 'High',
    normal: 'Normal',
    low: 'Low'
  },
  runtime: {
    bytes: '{{used}} / {{limit}} bytes',
    count: '{{count}} entries',
    add: 'Remember',
    emptyUser: 'No user profile memory yet',
    emptyMemory: 'No project memory yet',
    removeConfirm: 'Delete this memory entry?',
    contentRequired: 'Please enter the memory content'
  },
  targets: {
    userLabel: 'User profile',
    userDesc: 'Identity · Preferences · Communication style',
    userPlaceholder:
      'Enter what to remember about the user, e.g. prefers the dark theme, likes editorial-style design',
    userHint:
      'The user profile holds 4 KiB; high-importance entries are kept first when it is compacted.',
    memoryLabel: 'Project memory',
    memoryDesc: 'Decisions · Conventions · Reusable lessons',
    memoryPlaceholder:
      'Enter what to remember about the project, e.g. the refactor plan is final and uses LangChain underneath',
    memoryHint:
      'Project memory holds 10 KiB; once full, low-priority entries are archived to a memory space automatically.'
  },
  bodies: {
    namePlaceholder: 'Space name, e.g. Blog project',
    descriptionPlaceholder: 'Routing description: what belongs here and when it should be recalled',
    create: 'Create space',
    nameRequired: 'Please enter a space name',
    created: 'Created "{{name}}"',
    empty:
      'No memory spaces yet. The model can create one with the mnemon_memory_body_create tool during a conversation, or you can create one here.',
    active: 'Active',
    inactive: 'Inactive',
    unhealthy: 'Unhealthy',
    stats: 'Insights {{insights}} · Relations {{edges}} · Deleted {{deleted}}',
    content: 'Content',
    participatesInRecall: 'Included in recall',
    excludedFromRecall: 'Excluded from recall'
  },
  insights: {
    title: 'Content of "{{name}}"',
    empty: 'No content in this space yet',
    meta: '{{category}} · Importance {{importance}} · {{date}}'
  },
  documents: {
    empty:
      'No project documents yet. The model can create design, process, or handover documents with the mnemon_document_manage tool during a conversation.',
    updatedAt: 'Updated {{time}} · revision {{revision}}'
  },
  mechanism: {
    sectionTitle: 'How memory works',
    runtimeTitle: 'Runtime memory',
    runtimeDesc:
      'USER profile (4 KiB) + MEMORY project memory (10 KiB), injected automatically every turn; the model maintains it with the mnemon_runtime_memory tool; when MEMORY is full, entries are archived to a memory space automatically.',
    bodiesTitle: 'Long-term memory spaces',
    bodiesDesc:
      'Insights that stay stable across sessions, each space with its own database and four relation types; mnemon_recall retrieves and mnemon_remember stores; the active state controls whether a space takes part in recall.',
    documentsTitle: 'Project documents',
    documentsDesc:
      'Full Markdown documents (design, process, handover); active takes part in search while archived stays cold; mnemon_document_manage creates and mnemon_document_search searches.'
  }
}
