import type { zhCNAgentSettings } from '../zh-CN/agentSettings'

/* Agent settings page strings. Keep keys identical to the zh-CN source of truth. */
export const enUSAgentSettings: typeof zhCNAgentSettings = {
  pageTitle: 'Agents',
  pageDescription: 'Configure main agent defaults, plus the subagents it can delegate tasks to',
  sections: {
    mainAgent: 'Main agent',
    subagents: 'Subagents'
  },
  main: {
    defaultTools: 'Default tools',
    defaultToolsDescription: 'Choose the system tools available to the main agent',
    defaultToolsPlaceholder: 'Select tools',
    defaultSkills: 'Default skills',
    defaultSkillsDescription: 'Choose the skills available to the main agent',
    defaultSkillsPlaceholder: 'Select skills (none if left empty)',
    saved: 'Main agent saved'
  },
  list: {
    description_one: '{{count}} total. Only enabled agents take effect in conversations',
    description_other: '{{count}} total. Only enabled agents take effect in conversations',
    newAgent: 'New',
    toolCount_one: '{{count}} tool',
    toolCount_other: '{{count}} tools',
    skillCount_one: '{{count}} skill',
    skillCount_other: '{{count}} skills'
  },
  form: {
    createTitle: 'New agent',
    editTitle: 'Edit agent: {{name}}',
    chineseName: 'Chinese name',
    chineseNamePlaceholder: 'e.g. 研究代理 (optional)',
    identifier: 'English identifier',
    identifierPlaceholder: 'e.g. research-agent',
    identifierRequired: 'Please enter an English identifier',
    identifierPattern: 'Use lowercase letters, numbers, and hyphens only',
    enabled: 'Enabled',
    description: 'Description',
    descriptionPlaceholder:
      'Describe what the agent does. The main agent uses this to decide when to delegate tasks',
    descriptionRequired: 'Please enter a description',
    systemPrompt: 'System prompt',
    systemPromptPlaceholder: 'The agent role and behavior guidelines',
    systemPromptRequired: 'Please enter a system prompt',
    tools: 'Available tools',
    toolsPlaceholder: 'Select the system tools available to the agent (none if left empty)',
    model: 'Model (optional)',
    modelTooltip:
      'Overrides the main agent model. Leave empty to use the main agent model. ' +
      'Only non-Embedding models are listed',
    modelPlaceholder: 'Use the main agent default model',
    skills: 'Skills (optional)',
    skillsTooltip: 'Choose the skills available to the agent from the loaded skill directories',
    skillsPlaceholder: 'Select the skills available to the agent (none if left empty)',
    skillsNotConfigured: 'No skills found. Configure a directory in Skills settings first',
    skillsNoMatch: 'No matching skills'
  },
  messages: {
    agentUpdated: 'Agent updated',
    agentCreated: 'Agent created',
    opened: 'Enabled',
    closed: 'Disabled',
    toggleFailedWithReason: 'Failed to toggle: {{reason}}',
    deleted: 'Deleted',
    deleteConfirmTitle: 'Delete agent "{{name}}"?',
    importEmptyFile: 'The file is empty',
    importInvalidJson: 'Invalid JSON. Please check the file',
    importNotArray: 'JSON content must be an array',
    importEmptyContent: 'Nothing to import',
    importFailedWithReason: 'Import failed: {{reason}}',
    importStrippedSkippedName: '(missing name)',
    importMissingTool: '{{name}}: tool [{{items}}] not found, removed',
    importMissingSkill: '{{name}}: skill [{{items}}] not found, removed',
    importMissingModel: '{{name}}: model "{{model}}" not found, removed',
    importSummaryImported_one: 'Imported {{count}} agent',
    importSummaryImported_other: 'Imported {{count}} agents',
    importSummarySkipped_one: '{{count}} skipped',
    importSummarySkipped_other: '{{count}} skipped',
    importSummaryNone: 'No agents imported',
    importSummarySeparator: ', ',
    importStrippedTitle: 'The following entries were removed because they no longer exist',
    readFileFailed: 'Failed to read the file'
  },
  empty: {
    noAgents: 'No agents yet. Click New in the top right to create one'
  }
}
