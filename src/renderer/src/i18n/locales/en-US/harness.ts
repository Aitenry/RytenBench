import type { zhCNHarness } from '../zh-CN/harness'

/* Harness (assistant) module strings. Keep keys identical to the zh-CN source of truth. */
export const enUSHarness: typeof zhCNHarness = {
  index: {
    setupWorkspaceTitle: 'Configure a workspace to start chatting',
    setupWorkspaceDescription:
      'Conversations and memories are isolated per workspace. Pick a directory as your workspace to get started; everything else keeps working.',
    setupWorkspaceButton: 'Choose workspace folder',
    setupModelTitle: 'Configure a model to start chatting',
    setupModelDescription:
      'AI chat needs a model provider. Add and enable at least one model to get started; everything else keeps working.',
    setupModelButton: 'Configure models'
  },
  sidebar: {
    title: 'Workspaces',
    searchPlaceholder: 'Search workspaces and conversations',
    searchTooltip: 'Search workspaces and conversations',
    exitSearch: 'Exit search',
    assistantSettings: 'Assistant settings',
    newWorkspace: 'New workspace',
    noWorkspace: 'No workspace configured yet',
    noMatchResult: 'No matching results',
    noMatchTopic: 'No matching conversations',
    emptyTopics: 'No conversations yet',
    topicDeleteBlocked: 'Running, cannot delete',
    topicDelete: 'Delete conversation',
    topicRunning: 'Conversation is running',
    topicActions: 'Conversation actions',
    workspaceActions: 'Workspace actions',
    workspaceHasRunning: 'A conversation is running',
    workspaceDelete: 'Delete workspace',
    workspaceDeleteConfirmTitle: 'Delete workspace',
    workspaceDeleteConfirmContent:
      'Delete "{{name}}"? All conversations and memories in this workspace will be deleted too.',
    newSession: 'New conversation',
    renameWorkspace: 'Rename workspace',
    workspaceNamePlaceholder: 'Workspace name',
    workspaceNameRequired: 'Please enter a workspace name',
    renameSuccess: 'Workspace renamed',
    renameFailed: 'Failed to rename',
    defaultWorkspaceName: 'Workspace',
    memory: 'Memory',
    memoryNotConfigured:
      'No memory directory configured. The model will have no persistent memory.',
    memoryGoSettings: 'Configure memory in settings',
    memoryUserProfile: 'User profile',
    memoryProject: 'Project memory',
    memoryEmpty: 'No hot memory yet. Tell the model what to remember during a conversation',
    memoryCount: '{{count}}',
    memoryHotEmpty: 'Hot memory -',
    memoryHotCount: '{{count}} hot memories',
    memorySpaces: 'Spaces {{active}}/{{total}} active',
    memoryDocuments: 'Documents {{count}}',
    memoryManage: 'Manage memory',
    timeJustNow: 'Just now',
    timeMinutes: '{{count}}m',
    timeHours: '{{count}}h',
    timeDays: '{{count}}d',
    timeDate: '{{month}}/{{day}}',
    timeFullDate: '{{year}}/{{month}}/{{day}}'
  },
  input: {
    placeholder: 'Send a message to Rita',
    attachTooltip: 'Upload attachment',
    modelPlaceholder: 'Select a model',
    stopTooltip: 'Stop generating',
    visionUnsupported: 'The current model does not support vision, so images cannot be pasted',
    imageReadFailed: 'Failed to read the image attachment: {{name}}',
    filePathUnavailable:
      'Cannot get the local path of "{{name}}". Add it by drag-and-drop or the upload button',
    pasteImageFallbackName: 'paste-image.png'
  },
  header: {
    toggleSidebar: 'Sidebar',
    togglePanel: 'Workspace panel'
  },
  messageArea: {
    scrollToBottom: 'Back to bottom'
  },
  messageLocator: {
    jumpToRound: 'Jump to turn {{round}}',
    emptyMessage: '(empty message)',
    noAnswer: '(no answer yet)',
    codePlaceholder: ' [code] ',
    imagePlaceholder: ' [image] '
  },
  welcome: {
    title: "Hi, I'm Rita~",
    subtitleWeather:
      "How's the weather today? If it looks good, I can plan tomorrow's schedule for you too~",
    subtitleDocument:
      'I can analyze your documents, pull out the key information, and map how they relate.',
    subtitleTodo: 'Tell me anything important and I will keep track of it and turn it into to-dos.',
    subtitleKnowledge: 'I can organize scattered documents into a knowledge base for you.'
  },
  loading: {
    generating: 'Generating...'
  },
  assistantMessage: {
    toolCallFallback: 'Tool call',
    toolPreparing: 'Building arguments…',
    toolExecuting: 'Running…',
    thinkingInProgress: 'Thinking…',
    thinkingDone: 'Thinking process',
    retrying: 'Retrying (attempt {{attempt}}/{{retries}})…',
    compacting: 'Compacting earlier conversation…',
    compacted: 'Earlier conversation compacted',
    compactedCounts: '<mono>{{compressed}}</mono> → kept <mono>{{retained}}</mono>',
    memoryInjected: 'Injected memory · <mono>{{count}}</mono>',
    memoryInjectedUser:
      '(user profile <mono>{{user}}</mono> · project memory <mono>{{memory}}</mono>)',
    memoryInjectedProject: '(project memory <mono>{{count}}</mono>)',
    userProfileBytes: 'User profile USER (<mono>{{bytes}}</mono> bytes)',
    projectMemoryBytes: 'Project memory MEMORY (<mono>{{bytes}}</mono> bytes)',
    toolInput: 'Input:',
    toolOutput: 'Output:',
    dispatched: 'Background task dispatched',
    subAgentRunning: '{{name}} · Running…',
    subAgentError: '{{name}} · Error',
    subAgentCompleted: '{{name}} · Completed',
    subAgentExecuting: 'The agent is working…',
    silentGenerating: 'Generating…',
    todoList: 'To-do list',
    todoCompleted: '<mono>{{completed}}</mono>/<mono>{{total}}</mono> completed',
    todoInProgress: '· <mono>{{count}}</mono> in progress',
    todoEmpty: 'No to-dos yet. Ask the model to plan tasks with write_todos',
    todoFallback: 'To-do {{index}}',
    itemCount: '<mono>{{count}}</mono> items',
    itemCount_one: '<mono>{{count}}</mono> item',
    itemCount_other: '<mono>{{count}}</mono> items',
    matchCount: '<mono>{{count}}</mono> matches',
    matchCount_one: '<mono>{{count}}</mono> match',
    matchCount_other: '<mono>{{count}}</mono> matches',
    memoryTool: 'Memory tool',
    memoryWrite: 'Memory write',
    memoryStatus: 'Memory status',
    memorySpaces: 'Memory spaces',
    memoryRecall: 'Memory recall',
    memoryDocumentSearch: 'Document search',
    memoryRelated: 'Related memories',
    memoryBodyActivate: '{{active}}/{{total}} active',
    memoryBodyHot: 'Hot memory',
    memoryBodyDocuments: 'Project documents',
    memoryBodySpaceFallback: 'Space {{index}}',
    memoryBodyUnnamed: 'Unnamed space',
    memoryBodyActive: 'Active',
    memoryBodyInactive: 'Inactive',
    memoryBodyInsights: '<mono>{{count}}</mono> insights',
    memoryBodyInsights_one: '<mono>{{count}}</mono> insight',
    memoryBodyInsights_other: '<mono>{{count}}</mono> insights',
    memoryBodyTotalActive: '<mono>{{total}}</mono> total · <mono>{{active}}</mono> active',
    statusParseFailed: 'Cannot parse the status output',
    toolOutputParseFailed: 'Cannot parse the tool output',
    memoryBodyEmpty: 'No memory spaces yet. Ask the model to create one in a conversation',
    memoryBodyCount: '<mono>{{count}}</mono> items',
    memoryBodyCount_one: '<mono>{{count}}</mono> item',
    memoryBodyCount_other: '<mono>{{count}}</mono> items',
    memoryDocumentCount: '<mono>{{count}}</mono> documents',
    memoryDocumentCount_one: '<mono>{{count}}</mono> document',
    memoryDocumentCount_other: '<mono>{{count}}</mono> documents',
    memoryDocumentActive: 'Active',
    memoryDocumentArchived: 'Archived',
    memoryRecallEmpty: 'No related memories recalled',
    memoryDocumentEmpty: 'No matching documents found',
    memoryRelatedEmpty: 'No related memories found',
    memoryEntrySource: 'Source: {{name}}',
    memoryEntryScore: 'Relevance {{score}}',
    memoryEntryDepth: 'Depth {{depth}}',
    memoryRemembered: 'Saved to "{{name}}"',
    memoryCategory: 'Category: {{category}}',
    memoryImportance: 'Importance {{importance}}'
  },
  messageActions: {
    copied: 'Copied',
    copy: 'Copy',
    feedbackUp: 'Good answer',
    feedbackUpMarked: 'Marked: good answer',
    feedbackDown: 'Bad answer',
    feedbackDownMarked: 'Marked: bad answer',
    feedbackUpRecorded: 'Recorded: good answer',
    feedbackDownRecorded: 'Recorded: bad answer',
    feedbackCanceled: 'Feedback cleared',
    saveToMemory: 'Save to memory',
    savingToMemory: 'Saving to memory…',
    saveToMemoryEmpty: 'This answer has no body text to save',
    saveToMemoryFailed: 'Failed to save to memory',
    branch: 'Branch into a new conversation',
    branching: 'Creating branch…',
    deleteTurn: 'Delete this exchange',
    deleteConfirmTitle: 'Confirm deletion',
    deleteConfirmContent: 'This exchange will be deleted and cannot be recovered afterwards.',
    elapsedTooltip: 'Time from asking to the answer finishing',
    elapsed: 'Took {{elapsed}}',
    elapsedSeconds: '{{seconds}}s',
    elapsedMinutes: '{{minutes}}m {{seconds}}s',
    usageTooltip: 'Usage for this turn'
  },
  usagePanel: {
    title: 'Usage for this turn',
    route: 'Provider / model',
    cacheHit: 'Cache hit',
    uncachedInput: 'Uncached input',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
    input: 'Input',
    output: 'Output',
    reasoning: 'of which reasoning',
    calls: 'Model calls',
    callsValue: '{{count}} calls',
    tokensValue: '{{value}} tok'
  },
  goalBar: {
    phaseActive: 'Active',
    phasePaused: 'Paused',
    phaseBlocked: 'Blocked',
    phaseComplete: 'Complete',
    blocked: 'Blocked ({{code}}): {{message}}',
    round: 'Round {{current}}/{{max}}'
  },
  taskCard: {
    completed: '{{done}}/{{total}} completed',
    inProgress: '· {{count}} in progress'
  },
  userMessage: {
    goalRound: 'Goal auto-continuation · round {{round}}'
  },
  askQuestion: {
    title: 'Your confirmation is needed',
    okText: 'Submit answer',
    customPlaceholder: 'Type your answer…',
    footerHint:
      'After submitting, the model continues in this turn; click "Stop generating" to cancel the question and abort the turn.'
  },
  modelRecovery: {
    title: 'Model request failed',
    abandon: 'Abandon this turn',
    continueWithModel: 'Continue with selected model',
    searchPlaceholder: 'Search model name',
    noMatch: 'No model matches "{{query}}"',
    noModels: 'No models available. Add and enable one in Settings → Models, then try again.',
    hint: 'After switching, execution resumes from the interruption point with the new model. The question is not resent and completed tools are not re-run.'
  },
  backgroundAgents: {
    running: 'Running',
    failed: 'Failed',
    killed: 'Stopped',
    completed: 'Completed',
    runningCount: '{{count}} running',
    completedCount: '{{count}} completed',
    failedCount: '{{count}} failed',
    killedCount: '{{count}} stopped',
    summarySeparator: ', ',
    promptLabel: 'Task',
    generating: 'Generating…',
    noOutput: 'No output yet'
  },
  fileExplorer: {
    title: 'Resource editor',
    refresh: 'Refresh',
    loading: 'Loading...',
    empty: 'Empty folder'
  },
  fileEditor: {
    loading: 'Loading editor...'
  },
  helpers: {
    toolPreparing: '{{name}} · Building arguments…',
    toolExecuting: '{{name}} · Running…'
  },
  handlers: {
    branchCreating: 'Creating branch conversation...',
    branchUntitled: 'Untitled',
    branchTitle: 'Branch · {{title}}',
    branchSuccess: 'Branched into a new conversation ({{count}} messages)',
    branchListHint: 'Branch conversation created. Open it from the list on the left',
    branchFailed: 'Failed to branch',
    sendFailed: 'Sorry, something went wrong. Please try again later.'
  }
}
