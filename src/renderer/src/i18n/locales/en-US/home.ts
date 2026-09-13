import type { zhCNHome } from '../zh-CN/home'

/* Home module (dashboard / document tree / document & todo editors / preview modals).
   Keep key names identical to the zh-CN source of truth. */
export const enUSHome: typeof zhCNHome = {
  /* Nouns (shared by tree section titles, search groups, stat blocks, breadcrumb fallbacks) */
  term: {
    doc: 'Document',
    docLibrary: 'Document library',
    todo: 'Todos',
    wiki: 'Knowledge base',
    directory: 'Directory',
    graph: 'Knowledge graph',
    properties: 'Properties'
  },
  /* Todo / document status names */
  status: {
    pending: 'To do',
    doing: 'In progress',
    done: 'Done'
  },
  /* Breadcrumb */
  breadcrumb: {
    home: 'Home',
    docWithId: 'Document {{id}}',
    todoWithId: 'Todo {{id}}'
  },
  /* Form field labels and placeholders */
  field: {
    title: 'Title',
    summary: 'Summary',
    tags: 'Tags',
    cover: 'Cover',
    coverImage: 'Cover image',
    coverAlt: 'Cover',
    dueDate: 'Due date',
    priority: 'Priority',
    status: 'Status',
    category: 'Category',
    startTime: 'Started',
    completedTime: 'Completed',
    createdTime: 'Created',
    updatedTime: 'Updated',
    directoryName: 'Directory name',
    tagPlaceholder: 'Type a tag and press Enter',
    tagPlaceholderMore: 'Add another…',
    selectImage: 'Choose image',
    changeImage: 'Change image',
    uploadImage: 'Upload image',
    removeImage: 'Remove image'
  },
  /* Left document tree */
  tree: {
    createNamed: 'New {{name}}'
  },
  /* In-tree search */
  search: {
    placeholder: 'Search documents, todos, knowledge bases',
    noResults: 'No matches'
  },
  /* Documents */
  doc: {
    untitled: 'Untitled document',
    create: 'New document',
    import: 'Import document',
    importing: 'Importing document...',
    importSuccess: 'Document imported',
    importFailed: 'Failed to import document',
    creating: 'Creating document...',
    createSuccess: 'Document created',
    createFailed: 'Failed to create document',
    delete: 'Delete document',
    deleteHard: 'Delete permanently',
    deleteTitle: 'Delete "{{name}}"?',
    deleting: 'Deleting document...',
    deleteSuccess: 'Document deleted',
    deleteFailed: 'Failed to delete document',
    archiveToOtherDir: 'Archive to another directory',
    archiveToWiki: 'Archive to knowledge base',
    createdAt: 'Created {{date}}',
    titleWithId: 'Document {{id}}',
    notFound: 'Document not found or deleted',
    empty: 'No documents',
    propsSaved: 'Document properties saved',
    propsSaveFailed: 'Failed to save document properties'
  },
  /* Todos */
  todo: {
    untitled: 'Untitled todo',
    create: 'New todo',
    addTitle: 'Add todo',
    editTitle: 'Todo details',
    titlePlaceholder: 'Enter a todo title',
    categoryPlaceholder: 'Enter a category',
    contentPlaceholder: 'Write something… Markdown supported (# heading, - list, ``` code block)',
    creating: 'Adding todo...',
    createSuccess: 'Todo added',
    createFailed: 'Failed to add todo',
    saving: 'Saving todo...',
    updated: 'Todo updated',
    saveFailed: 'Failed to save todo',
    deleteTitle: 'Delete this todo?',
    actionStart: 'Start task',
    actionComplete: 'Mark complete',
    actionReactivate: 'Reactivate',
    updatingStatus: 'Updating status...',
    markedDoing: 'Marked as in progress',
    reactivated: 'Reactivated',
    statusUpdateFailed: 'Failed to update status',
    priority: 'Priority P{{level}}',
    duePrefix: 'Due ',
    overduePrefix: 'Overdue · ',
    metaCreated: 'Created {{time}}',
    metaUpdated: 'Updated {{time}}',
    metaStarted: 'Started {{time}}',
    metaCompleted: 'Completed {{time}}',
    empty: 'No todos',
    notFound: 'Todo not found or deleted'
  },
  /* Knowledge bases */
  wiki: {
    create: 'New knowledge base',
    edit: 'Edit knowledge base',
    titlePlaceholder: 'Knowledge base title',
    summaryPlaceholder: 'Knowledge base summary',
    creating: 'Creating knowledge base...',
    createSuccess: 'Knowledge base created!',
    createFailed: 'Failed to create knowledge base',
    saving: 'Saving knowledge base...',
    updated: 'Knowledge base updated',
    saveFailed: 'Failed to save knowledge base',
    delete: 'Delete knowledge base',
    deleteTitle: 'Delete "{{name}}"?',
    deleteContent:
      'The knowledge base and its directories will be removed. Documents inside them are kept.',
    deleting: 'Deleting knowledge base...',
    deleted: 'Knowledge base deleted',
    deleteFailed: 'Failed to delete knowledge base',
    empty: 'No knowledge bases',
    notFound: 'Knowledge base not found or deleted'
  },
  /* Knowledge base directories */
  dir: {
    create: 'New directory',
    createChild: 'New subdirectory',
    createSubTitle: 'New directory under "{{name}}"',
    renameTitle: 'Rename directory',
    defaultName: 'New directory',
    creating: 'Creating directory...',
    createSuccess: 'Directory created!',
    saving: 'Saving directory...',
    saved: 'Directory saved',
    saveFailed: 'Failed to save directory',
    delete: 'Delete directory',
    deleteTitle: 'Delete "{{name}}"?',
    deleteContent:
      'Documents in the directory will not be deleted; they will only be unlinked from it.',
    deleting: 'Deleting directory...',
    deleteSuccess: 'Directory deleted',
    deleteFailed: 'Failed to delete directory',
    removeDoc: 'Remove from directory',
    removeDocTitle: 'Remove "{{name}}" from "{{dir}}"?',
    removeDocContent: 'Only the directory link is removed; the document itself is kept.',
    removing: 'Removing...',
    removed: 'Removed from directory',
    removeFailed: 'Failed to remove'
  },
  /* Knowledge graph entry */
  graph: {
    view: 'View graph'
  },
  /* Save status bar of the document / todo editors */
  editor: {
    saving: 'Saving…',
    unsaved: 'Unsaved',
    saved: 'Saved',
    savedWithTime: 'Saved {{time}}',
    hint: 'Ctrl+S to save now · auto-save after editing'
  },
  /* Right outline panel */
  outline: {
    title: 'Outline',
    empty: 'No headings',
    wordCount: 'Words',
    created: 'Created',
    updated: 'Updated'
  },
  /* Home dashboard */
  dashboard: {
    greetingNight: 'Working late',
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    welcomeBack: '{{greeting}}, welcome back',
    dateFormat: 'dddd, MMMM D, YYYY',
    subtitle: 'Pick something from the document tree, or create a new one to start',
    recentUpdate: 'Updated {{date}}',
    pendingTodos: 'Open todos',
    overdueCount_one: '{{count}} overdue',
    overdueCount_other: '{{count}} overdue',
    noOverdue: 'None overdue',
    wikiSubtitle: 'Knowledge capture and archiving',
    todoSection: 'Todos',
    recentDocsSection: 'Recent documents',
    noPendingTodos: 'No open todos',
    noDocsHint: 'No documents yet — click "New document" to start writing'
  },
  /* Archive document modal */
  archive: {
    title: 'Archive "{{name}}" to a knowledge base directory',
    ok: 'Archive',
    stepWiki: '1. Choose a knowledge base',
    stepDirectory: '2. Choose a directory',
    selectWikiFirst: 'Choose a knowledge base first',
    noDirectories: 'This knowledge base has no directories',
    archiving: 'Archiving document...',
    success: 'Document archived!',
    failed: 'Failed to archive document'
  },
  /* Document properties modal */
  props: {
    title: 'Document properties',
    titleWithDoc: 'Properties · {{name}}',
    summaryPlaceholder: 'Describe this document in one sentence…'
  },
  /* Document preview modal */
  preview: {
    doc: 'Document preview',
    empty: 'No content'
  }
}
