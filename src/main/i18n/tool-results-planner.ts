import { getMainLanguage } from './index'

/** 计划/待办/音乐工具的返回文案（会显示在工具卡片上，跟随界面语言）。 */
export const zhCNPlannerToolTexts = {
  /** 任务类型标签（TYPE_LABELS），未知类型回退成 {{type}} */
  typeLabels: {
    project: '项目',
    phase: '阶段',
    task: '任务',
    unknown: '{{type}}'
  },

  /** 三个工具共用的空态与「未知命令/子命令」提示 */
  common: {
    noTasks: '还没有规划任务。',
    unknownCommand: '未知命令：{{command}}。支持：{{supported}}',
    unknownSubcommand: '未知子命令：{{subcommand}}。支持：{{supported}}'
  },

  planner: {
    /** mainPlural 单复数：中文两份同文案，英文 1 item / n items */
    listHeader_one: '**规划任务列表**（共 {{count}} 项）\n',
    listHeader_other: '**规划任务列表**（共 {{count}} 项）\n',
    treeHeader: '**规划任务树**\n',
    /** 每个任务行下方的一行汇总字段 */
    meta: '类型：{{type}} | 进度：{{progress}}% | 工时：{{hours}}h | 优先级：P{{priority}}',
    dateRange: '日期：{{range}}',
    validation: {
      titleRequired: '标题不能为空。',
      typeRequired: '类型不能为空，支持：{{types}}',
      progressRequired: '进度不能为空（可设为 0）。',
      progressRange: '进度范围 0-100。',
      workHoursRequired: '工时不能为空。',
      workHoursNegative: '工时不能为负数。',
      priorityRequired: '优先级不能为空。',
      priorityRange: '无效优先级 P{{priority}}，有效范围：P0–P7。',
      startRequired: '开始日期不能为空（格式 YYYY-MM-DDTHH:mm:ss，如 {{example}}）。',
      endRequired: '结束日期不能为空（格式 YYYY-MM-DDTHH:mm:ss，如 {{example}}）。',
      endBeforeStart: '结束日期不能早于开始日期。',
      taskIdRequired: '任务 ID 不能为空。',
      taskNotFound: '未找到 ID 为 {{id}} 的任务。',
      fieldsRequired: '没有需要更新的字段。',
      parentStartBound: '开始日期不能早于父级「{{parentTitle}}」的开始日期（{{parentStart}}）',
      parentEndBound: '结束日期不能晚于父级「{{parentTitle}}」的结束日期（{{parentEnd}}）'
    },
    created: '已创建{{type}}：[{{id}}] {{path}}',
    updated: '已更新任务 [{{id}}] "{{title}}"：{{fields}}',
    /** 任务字段名（update 回显里的 key），不是数据 */
    fieldLabels: {
      title: '标题',
      progress: '进度',
      work_hours: '工时',
      priority: '优先级',
      start_date: '开始日期',
      end_date: '结束日期'
    },
    /** 项目/阶段进度由子节点聚合，不能手改 */
    aggregateProgress:
      '「{{type}}」类型的进度由子节点聚合计算，不能手动修改。如需更新其他字段，请保持 progress 不变（当前 {{progress}}）。',
    deleted: '已删除{{type}}：[{{id}}] "{{title}}"{{detail}}',
    /** 级联删除的子任务计数，走 mainPlural（1 subtask / n subtasks） */
    deletedChildren_one: '（含 {{count}} 个子任务）',
    deletedChildren_other: '（含 {{count}} 个子任务）',

    deps: {
      empty: '还没有任务依赖关系。',
      header: '**依赖关系列表**\n',
      addNeedsIds: '添加依赖需要提供 taskId 和 dependsOnTaskId',
      deleteNeedsIds: '删除依赖需要提供 taskId 和 dependsOnTaskId',
      selfDependency: '任务不能依赖自身。',
      added:
        '已添加依赖：[{{taskId}}] → [{{dependsOnTaskId}}]（[{{taskId}}] 依赖 [{{dependsOnTaskId}}]）',
      removed: '已删除依赖：[{{taskId}}] → [{{dependsOnTaskId}}]',
      notFound: '未找到依赖：[{{taskId}}] → [{{dependsOnTaskId}}]'
    }
  },

  todos: {
    listHeader_one: '**待办列表**（共 {{count}} 项）\n',
    listHeader_other: '**待办列表**（共 {{count}} 项）\n',
    empty: '没有找到待办事项。',
    /** 状态/优先级标签，下标即库里的数值 */
    statusLabels: {
      todo: '待办',
      inProgress: '进行中',
      done: '已完成',
      unknown: '状态{{status}}'
    },
    priorityLabels: {
      none: '',
      p0: 'P0-紧急',
      p1: 'P1-高',
      p2: 'P2-中',
      p3: 'P3-低'
    },
    meta: {
      status: '状态：{{status}}',
      priority: '优先级：{{priority}}',
      due: '截止：{{dueDate}}',
      category: '分类：{{category}}'
    },
    created: '已创建待办：[{{id}}] {{title}}（优先级 P{{priority}}{{due}}）',
    createdDue: '，截止 {{dueDate}}',
    updated: '已更新待办 [{{id}}] {{title}}',
    deleted: '已删除待办 [{{id}}] {{title}}',
    notFound: '未找到 ID 为 {{id}} 的待办事项。'
  },

  music: {
    playlistsHeader: '🎵 **歌单列表**\n',
    playlistsEmpty: '还没有任何歌单。',
    playlistLine: '  [{{id}}] **{{name}}**（{{trackCount}} 首）',
    playlistDescription: '    描述：{{description}}',
    /** 可用歌单之间用中文顿号分隔，英文用逗号 */
    availablePlaylistsSeparator: '、',
    playlistNotFound: '未找到名为 "{{name}}" 的歌单。可用歌单：{{available}}',
    playlistTracksEmpty: '歌单 "{{name}}" 中还没有曲目。',
    trackListHeader_one: '🎵 **{{name}}**（共 {{count}} 首，显示前 {{shown}} 首）\n',
    trackListHeader_other: '🎵 **{{name}}**（共 {{count}} 首，显示前 {{shown}} 首）\n',
    trackLine: '  [{{id}}] {{title}} - {{artist}} ({{duration}}){{liked}}',
    unknownArtist: '未知艺术家',
    liked: '收藏',
    nowPlaying: '正在播放：{{title}} - {{artist}}',
    trackNotFound: '未找到 ID 为 {{id}} 的曲目。',
    noPlayerWindow: '无法通知播放器窗口。'
  }
}

export const enUSPlannerToolTexts: typeof zhCNPlannerToolTexts = {
  typeLabels: {
    project: 'Project',
    phase: 'Phase',
    task: 'Task',
    unknown: '{{type}}'
  },

  common: {
    noTasks: 'No planner tasks yet.',
    unknownCommand: 'Unknown command: {{command}}. Supported: {{supported}}',
    unknownSubcommand: 'Unknown subcommand: {{subcommand}}. Supported: {{supported}}'
  },

  planner: {
    listHeader_one: '**Planner tasks** ({{count}} item)\n',
    listHeader_other: '**Planner tasks** ({{count}} items)\n',
    treeHeader: '**Planner task tree**\n',
    meta: 'Type: {{type}} | Progress: {{progress}}% | Work hours: {{hours}}h | Priority: P{{priority}}',
    dateRange: 'Date: {{range}}',
    validation: {
      titleRequired: 'Title must not be empty.',
      typeRequired: 'Type must not be empty. Supported: {{types}}',
      progressRequired: 'Progress must not be empty (it may be 0).',
      progressRange: 'Progress must be between 0 and 100.',
      workHoursRequired: 'Work hours must not be empty.',
      workHoursNegative: 'Work hours must not be negative.',
      priorityRequired: 'Priority must not be empty.',
      priorityRange: 'Invalid priority P{{priority}}. Valid range: P0–P7.',
      startRequired: 'Start date must not be empty (format YYYY-MM-DDTHH:mm:ss, e.g. {{example}}).',
      endRequired: 'End date must not be empty (format YYYY-MM-DDTHH:mm:ss, e.g. {{example}}).',
      endBeforeStart: 'End date must not be earlier than the start date.',
      taskIdRequired: 'Task ID must not be empty.',
      taskNotFound: 'No task found with ID {{id}}.',
      fieldsRequired: 'No fields to update.',
      parentStartBound:
        'Start date must not be earlier than the parent "{{parentTitle}}" start date ({{parentStart}})',
      parentEndBound:
        'End date must not be later than the parent "{{parentTitle}}" end date ({{parentEnd}})'
    },
    created: 'Created {{type}}: [{{id}}] {{path}}',
    updated: 'Updated task [{{id}}] "{{title}}": {{fields}}',
    fieldLabels: {
      title: 'title',
      progress: 'progress',
      work_hours: 'work_hours',
      priority: 'priority',
      start_date: 'start_date',
      end_date: 'end_date'
    },
    aggregateProgress:
      'The progress of a "{{type}}" is aggregated from its child nodes and cannot be changed manually. To update other fields, keep progress unchanged (currently {{progress}}).',
    deleted: 'Deleted {{type}}: [{{id}}] "{{title}}"{{detail}}',
    deletedChildren_one: ' ({{count}} subtask)',
    deletedChildren_other: ' ({{count}} subtasks)',

    deps: {
      empty: 'No task dependencies yet.',
      header: '**Dependency list**\n',
      addNeedsIds: 'Adding a dependency requires taskId and dependsOnTaskId',
      deleteNeedsIds: 'Deleting a dependency requires taskId and dependsOnTaskId',
      selfDependency: 'A task cannot depend on itself.',
      added:
        'Added dependency: [{{taskId}}] → [{{dependsOnTaskId}}] ([{{taskId}}] depends on [{{dependsOnTaskId}}])',
      removed: 'Deleted dependency: [{{taskId}}] → [{{dependsOnTaskId}}]',
      notFound: 'No dependency found: [{{taskId}}] → [{{dependsOnTaskId}}]'
    }
  },

  todos: {
    listHeader_one: '**Todo list** ({{count}} item)\n',
    listHeader_other: '**Todo list** ({{count}} items)\n',
    empty: 'No todo items found.',
    statusLabels: {
      todo: 'To do',
      inProgress: 'In progress',
      done: 'Done',
      unknown: 'Status {{status}}'
    },
    priorityLabels: {
      none: '',
      p0: 'P0-Urgent',
      p1: 'P1-High',
      p2: 'P2-Medium',
      p3: 'P3-Low'
    },
    meta: {
      status: 'Status: {{status}}',
      priority: 'Priority: {{priority}}',
      due: 'Due: {{dueDate}}',
      category: 'Category: {{category}}'
    },
    created: 'Created todo: [{{id}}] {{title}} (priority P{{priority}}{{due}})',
    createdDue: ', due {{dueDate}}',
    updated: 'Updated todo [{{id}}] {{title}}',
    deleted: 'Deleted todo [{{id}}] {{title}}',
    notFound: 'No todo item found with ID {{id}}.'
  },

  music: {
    playlistsHeader: '🎵 **Playlists**\n',
    playlistsEmpty: 'No playlists yet.',
    playlistLine: '  [{{id}}] **{{name}}** ({{trackCount}} tracks)',
    playlistDescription: '    Description: {{description}}',
    availablePlaylistsSeparator: ', ',
    playlistNotFound: 'No playlist named "{{name}}" was found. Available playlists: {{available}}',
    playlistTracksEmpty: 'Playlist "{{name}}" has no tracks yet.',
    trackListHeader_one: '🎵 **{{name}}** ({{count}} track, showing the first {{shown}})\n',
    trackListHeader_other: '🎵 **{{name}}** ({{count}} tracks, showing the first {{shown}})\n',
    trackLine: '  [{{id}}] {{title}} - {{artist}} ({{duration}}){{liked}}',
    unknownArtist: 'Unknown artist',
    liked: ' liked',
    nowPlaying: 'Now playing: {{title}} - {{artist}}',
    trackNotFound: 'No track found with ID {{id}}.',
    noPlayerWindow: 'Could not reach the player window.'
  }
}

export function getPlannerToolTexts(): typeof zhCNPlannerToolTexts {
  return getMainLanguage() === 'en-US' ? enUSPlannerToolTexts : zhCNPlannerToolTexts
}
