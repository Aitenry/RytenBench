/**
 * 主进程里**会出现在系统界面上**的文案：系统托盘菜单、原生文件对话框、启动页步骤名、独立窗口标题。
 *
 * 这里不放：日志、注释、抛给渲染进程的错误信息（那些属于各自的模块）、以及发给模型的提示词。
 * 中文是源语言，`enUS` 用 `typeof zhCN` 约束，缺键/多键都是编译期错误。
 */
import { enUSGraphProgress, zhCNGraphProgress } from './graph-progress'

export const zhCN = {
  tray: {
    tooltip: 'RytenBench — AI 桌面工作台',
    subtitle: 'AI 桌面工作台',
    hideWindow: '隐藏窗口',
    showWindow: '显示主窗口',
    closeToTray: '关闭到系统托盘',
    quit: '退出 RytenBench'
  },
  dialog: {
    unsupportedFileTypeTitle: '不支持的文件类型',
    unsupportedFileTypeMessage: '当前模型不支持视觉识别，请选择文档类附件（pdf、txt、md 等）',
    filterSupportedFiles: '支持的文件',
    filterAllFiles: '所有文件',
    filterTextFiles: '文本文件',
    filterDocumentFiles: '文档文件',
    filterImageFiles: '图片文件',
    filterAudioFiles: '音频文件',
    selectMemoryDir: '选择记忆存储目录',
    selectSkillsDir: '选择技能存储目录',
    selectWorkspaceDir: '选择 AI 工作区目录',
    selectMusicRoot: '选择音乐根目录',
    selectCoverImage: '选择封面图片',
    selectPlaylistCover: '选择歌单封面',
    selectMusicFiles: '选择音乐文件'
  },
  splash: {
    stepLoadConfig: '加载配置',
    stepInitKeystore: '初始化密钥库',
    stepConnectDatabase: '连接数据库',
    stepRunMigrations: '执行数据库迁移',
    stepInitWorkspace: '初始化工作区',
    stepCompleted: '初始化完成'
  },
  window: {
    mermaidPreview: 'Mermaid 预览'
  },
  graphProgress: zhCNGraphProgress,
  /** 经 IPC 抛给渲染进程、最终以提示条形式出现在界面上的错误文案 */
  error: {
    musicDirNotSet: '未设置音乐目录',
    playlistNotFound: '歌单不存在',
    trackNotFound: '歌曲不存在',
    fileOutsideMusicDir: '文件不在音乐目录内，已拒绝访问',
    workspaceNotConfigured: '尚未配置工作区，请先在对话页选择工作区目录',
    httpFromProvider: '{{provider}} 返回 HTTP {{status}}',
    fetchModelsFailed: '拉取模型列表失败：{{reason}}',
    invalidStatus: 'status 必须为 0（未开始）/ 1（进行中）/ 2（已完成）',
    invalidPathAbsolute: '路径无效：必须传入 AI 工作区内的绝对路径',
    workspaceDirNotConfigured: '未配置 AI 工作区目录，拒绝文件访问',
    pathOutsideWorkspace: '路径不在 AI 工作区内，已拒绝访问',
    graphModelNotConfigured:
      '未配置图谱构建模型：请先到「系统设置 → 图谱」中选择用于构建知识图谱的大模型。',
    memoryDirNotConfigured: '未配置记忆存储目录',
    invalidRequest: '请求参数无效',
    /* 流式生成失败时直接写进助手消息的文案 */
    responseFailed: '获取响应失败：{{reason}}',
    emptyModelResponse: '模型未返回任何内容，请查看日志或重试。'
  },
  /** 底栏天气组件：主进程缓存里存的是天气码与日期，下发前按当前语言渲染成文案 */
  weather: {
    today: '今天',
    unknown: '未知',
    weekdays: {
      sun: '周日',
      mon: '周一',
      tue: '周二',
      wed: '周三',
      thu: '周四',
      fri: '周五',
      sat: '周六'
    },
    codes: {
      code0: '晴天',
      code1: '大部晴朗',
      code2: '局部多云',
      code3: '多云',
      code45: '有雾',
      code48: '冰雾',
      code51: '小毛毛雨',
      code53: '中毛毛雨',
      code55: '大毛毛雨',
      code56: '小冻毛毛雨',
      code57: '大冻毛毛雨',
      code61: '小雨',
      code63: '中雨',
      code65: '大雨',
      code66: '小冻雨',
      code67: '大冻雨',
      code71: '小雪',
      code73: '中雪',
      code75: '大雪',
      code77: '雪粒',
      code80: '小阵雨',
      code81: '中阵雨',
      code82: '大阵雨',
      code85: '小阵雪',
      code86: '大阵雪',
      code95: '雷暴',
      code96: '小冰雹雷暴',
      code99: '大冰雹雷暴'
    }
  },
  /** 工具下拉（AgentSettings「默认工具」）的展示名与说明；键就是工具 name，与工具给模型看的 description 无关 */
  tools: {
    get_weather: { label: '天气查询', description: '查询当前实况和未来天气预报' },
    get_time: { label: '时间查询', description: '获取当前日期和时间' },
    manage_todos: { label: '待办管理', description: '查看、创建、更新和删除待办事项' },
    manage_docs: { label: '文档管理', description: '搜索、查看、创建、编辑和删除文档' },
    manage_wikis: { label: '知识库', description: '浏览和管理知识库、目录、文档归档' },
    search_graph: { label: '图谱搜索', description: '在知识图谱中搜索实体' },
    manage_planner: { label: '规划管理', description: '查看甘特图和任务树结构' },
    manage_music: { label: '音乐管理', description: '查看歌单和曲目' }
  },
  /** 模型重试失败后的「换模型继续」弹窗 */
  modelRecovery: {
    header: '模型请求失败',
    question: '当前模型自动重试 {{count}} 次仍失败。请选择要切换的模型，继续完成当前任务：',
    providerDescription: '供应商：{{provider}}',
    abandonLabel: '不换模型，放弃本轮生成',
    abandonDescription: '结束本轮生成（已生成内容保留在界面，不落库）'
  }
}

export const enUS: typeof zhCN = {
  tray: {
    tooltip: 'RytenBench — AI Desktop Workspace',
    subtitle: 'AI Desktop Workspace',
    hideWindow: 'Hide window',
    showWindow: 'Show main window',
    closeToTray: 'Close to system tray',
    quit: 'Quit RytenBench'
  },
  dialog: {
    unsupportedFileTypeTitle: 'Unsupported file type',
    unsupportedFileTypeMessage:
      'The current model does not support vision input. Please attach a document (pdf, txt, md, …).',
    filterSupportedFiles: 'Supported files',
    filterAllFiles: 'All files',
    filterTextFiles: 'Text files',
    filterDocumentFiles: 'Documents',
    filterImageFiles: 'Images',
    filterAudioFiles: 'Audio',
    selectMemoryDir: 'Select the memory folder',
    selectSkillsDir: 'Select the skills folder',
    selectWorkspaceDir: 'Select the AI workspace folder',
    selectMusicRoot: 'Select the music root folder',
    selectCoverImage: 'Select a cover image',
    selectPlaylistCover: 'Select a playlist cover',
    selectMusicFiles: 'Select music files'
  },
  splash: {
    stepLoadConfig: 'Loading configuration',
    stepInitKeystore: 'Initializing keystore',
    stepConnectDatabase: 'Connecting to the database',
    stepRunMigrations: 'Running database migrations',
    stepInitWorkspace: 'Initializing workspace',
    stepCompleted: 'Initialization complete'
  },
  window: {
    mermaidPreview: 'Mermaid preview'
  },
  graphProgress: enUSGraphProgress,
  error: {
    musicDirNotSet: 'No music folder is configured',
    playlistNotFound: 'Playlist not found',
    trackNotFound: 'Track not found',
    fileOutsideMusicDir: 'The file is outside the music folder — access denied',
    workspaceNotConfigured:
      'No workspace configured yet. Pick a workspace folder on the assistant page first.',
    httpFromProvider: '{{provider}} returned HTTP {{status}}',
    fetchModelsFailed: 'Failed to fetch the model list: {{reason}}',
    invalidStatus: 'status must be 0 (not started) / 1 (in progress) / 2 (done)',
    invalidPathAbsolute: 'Invalid path: an absolute path inside the AI workspace is required',
    workspaceDirNotConfigured: 'No AI workspace folder configured — file access denied',
    pathOutsideWorkspace: 'The path is outside the AI workspace — access denied',
    graphModelNotConfigured:
      'No graph building model configured. Choose one under Settings → Graph first.',
    memoryDirNotConfigured: 'No memory storage folder configured',
    invalidRequest: 'Invalid request parameters',
    responseFailed: 'Failed to get response: {{reason}}',
    emptyModelResponse: 'The model returned no content. Check the logs or try again.'
  },
  tools: {
    get_weather: { label: 'Weather', description: 'Current conditions and forecast' },
    get_time: { label: 'Time', description: 'Current date and time' },
    manage_todos: { label: 'To-dos', description: 'View, create, update and delete to-dos' },
    manage_docs: {
      label: 'Documents',
      description: 'Search, view, create, edit and delete documents'
    },
    manage_wikis: {
      label: 'Knowledge base',
      description: 'Browse and manage knowledge bases, folders and archived documents'
    },
    search_graph: { label: 'Graph search', description: 'Search entities in the knowledge graph' },
    manage_planner: { label: 'Planner', description: 'Inspect the Gantt chart and task tree' },
    manage_music: { label: 'Music', description: 'Browse playlists and tracks' }
  },
  modelRecovery: {
    header: 'Model request failed',
    question:
      'The current model still fails after {{count}} automatic retries. Pick a model to switch to and finish the current task:',
    providerDescription: 'Provider: {{provider}}',
    abandonLabel: 'Keep the model and abandon this turn',
    abandonDescription: 'End this turn (generated content stays on screen and is not persisted)'
  },
  weather: {
    today: 'Today',
    unknown: 'Unknown',
    weekdays: {
      sun: 'Sun',
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat'
    },
    codes: {
      code0: 'Clear sky',
      code1: 'Mainly clear',
      code2: 'Partly cloudy',
      code3: 'Overcast',
      code45: 'Fog',
      code48: 'Depositing rime fog',
      code51: 'Light drizzle',
      code53: 'Moderate drizzle',
      code55: 'Dense drizzle',
      code56: 'Light freezing drizzle',
      code57: 'Dense freezing drizzle',
      code61: 'Slight rain',
      code63: 'Moderate rain',
      code65: 'Heavy rain',
      code66: 'Light freezing rain',
      code67: 'Heavy freezing rain',
      code71: 'Slight snow',
      code73: 'Moderate snow',
      code75: 'Heavy snow',
      code77: 'Snow grains',
      code80: 'Slight rain showers',
      code81: 'Moderate rain showers',
      code82: 'Violent rain showers',
      code85: 'Slight snow showers',
      code86: 'Heavy snow showers',
      code95: 'Thunderstorm',
      code96: 'Thunderstorm with slight hail',
      code99: 'Thunderstorm with heavy hail'
    }
  }
}
