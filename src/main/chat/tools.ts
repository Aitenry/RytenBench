import type { StructuredToolInterface } from '@langchain/core/tools'
import type { ToolInfo, SubAgentConfig } from './types'
import { buildGetWeatherTool } from './tools/weather'
import { buildGetTimeTool } from './tools/time'
import { buildManageTodosTool } from './tools/todos'
import { buildManageDocsTool } from './tools/docs'
import { buildManageWikisTool } from './tools/wikis'
import { buildSearchGraphTool } from './tools/graph'
import { buildManagePlannerTool } from './tools/planner'
import { buildManageMusicTool } from './tools/music'

// ============================================================================
// Tool Registry
// ============================================================================

type ToolFactory = () => StructuredToolInterface

export const toolBuilders: Record<string, ToolFactory> = {
  get_weather: buildGetWeatherTool,
  get_time: buildGetTimeTool,
  manage_todos: buildManageTodosTool,
  manage_docs: buildManageDocsTool,
  manage_wikis: buildManageWikisTool,
  search_graph: buildSearchGraphTool,
  manage_planner: buildManagePlannerTool,
  manage_music: buildManageMusicTool
}

// ============================================================================
// Tool Info — 前端下拉列表
// ============================================================================

export const availableTools: ToolInfo[] = [
  {
    name: 'get_weather',
    label: '天气查询',
    description: '查询当前实况和未来天气预报',
    icon: 'RiSunCloudyLine',
    color: '#1677ff'
  },
  {
    name: 'get_time',
    label: '时间查询',
    description: '获取当前日期和时间',
    icon: 'RiTimeLine',
    color: '#52c41a'
  },
  {
    name: 'manage_todos',
    label: '待办管理',
    description: '查看、创建、更新和删除待办事项',
    icon: 'RiListCheck3',
    color: '#fa8c16'
  },
  {
    name: 'manage_docs',
    label: '文档管理',
    description: '搜索、查看、创建、编辑和删除文档',
    icon: 'RiFileSearchLine',
    color: '#722ed1'
  },
  {
    name: 'manage_wikis',
    label: '知识库',
    description: '浏览和管理知识库、目录、文档归档',
    icon: 'RiBook2Line',
    color: '#13c2c2'
  },
  {
    name: 'search_graph',
    label: '图谱搜索',
    description: '在知识图谱中搜索实体',
    icon: 'RiMindMap',
    color: '#eb2f96'
  },
  {
    name: 'manage_planner',
    label: '规划管理',
    description: '查看甘特图和任务树结构',
    icon: 'RiBarChartHorizontalLine',
    color: '#2f54eb'
  },
  {
    name: 'manage_music',
    label: '音乐管理',
    description: '查看歌单和曲目',
    icon: 'RiPlayListLine',
    color: '#a0d911'
  }
]

// ============================================================================
// Build Tools
// ============================================================================

/** Build LangChain tool instances from selected tool names */
export function buildTools(toolNames: string[]): StructuredToolInterface[] {
  return toolNames.filter((name) => name in toolBuilders).map((name) => toolBuilders[name]())
}

/** 为子代理构建实际的工具实例 */
export function buildSubAgentTools(subagent: SubAgentConfig): StructuredToolInterface[] {
  return (subagent.tools || [])
    .filter((name) => name in toolBuilders)
    .map((name) => toolBuilders[name]())
}

// ============================================================================
// SubAgent Registry
// ============================================================================

/** 子代理定义：将工具组合为专用子代理，主代理通过 task() 工具委托任务 */
export const subAgentDefinitions: SubAgentConfig[] = [
  {
    name: 'research-agent',
    description:
      '专门研究外部实时信息的子代理。' +
      '可用能力：(1)查询全球任意地点的当前实况天气（温度、体感温度、湿度、风速风向、天气状况）和未来多日预报（每日高低温度、降水概率、风速风向）；' +
      '(2)获取当前日期和时间。当你需要查询天气、了解当前时间或进行外部信息检索时使用此代理。',
    systemPrompt:
      '你是一个专业的研究助手。你可以查询全球任意地点的天气实况和预报（通过 Open-Meteo），以及获取当前时间。' +
      '\n工作规范：' +
      '\n- 天气查询时，先确认地点名称（支持中英文城市名/区县名），再调用 get_weather，默认预报 3 天' +
      '\n- 如果用户问的是"今天"或"当前"，设置 forecast_days=1' +
      '\n- 返回结果要结构清晰，包含关键信息摘要' +
      '\n- 全程使用中文回复',
    tools: ['get_weather', 'get_time']
  },
  {
    name: 'task-manager',
    description:
      '管理个人待办事项和项目规划的子代理。' +
      '可用能力：(1)待办事项完整 CRUD — 列出待办（可按状态0=待办/1=进行中/2=已完成、优先级1=紧急/2=高/3=中/4=低筛选）、创建待办（支持设置标题、描述、优先级、截止日期、分类标签）、更新待办、删除待办；' +
      '(2)规划管理 — 列出所有规划任务（可按类型 project/phase/task 筛选）、查看层级任务树（含聚合进度、类型、工时、优先级）、创建任务（支持 project/phase/task 三级结构，需标题/类型/进度/工时/优先级P0-P7/起止日期）、更新任务、删除任务（级联删除子任务）、管理任务依赖关系（list/add/delete）。' +
      '当你需要处理待办事项或进行甘特图式项目管理时使用此代理。',
    systemPrompt:
      '你是一个任务与项目管理专家。你可以管理用户的所有待办事项和规划任务。' +
      '\n待办事项（manage_todos）:' +
      '\n  - list: 列出待办，可筛选 status(0待办/1进行中/2已完成)、priority(1紧急/2高/3中/4低)' +
      '\n  - add: 创建待办，需要 title，可选 description、priority、due_date(YYYY-MM-DD)、category' +
      '\n  - update: 更新待办，需要 id，可选 title/description/status/priority/due_date/category' +
      '\n  - delete: 删除待办，需要 id' +
      '\n规划管理（manage_planner）:' +
      '\n  - list: 列出规划任务，可选 type(project/phase/task) 筛选' +
      '\n  - tree: 获取层级任务树（含聚合进度、类型、工时、优先级）' +
      '\n  - create: 创建任务，必填 title/type/progress/work_hours/priority(P0-P7)/start_date/end_date(YYYY-MM-DDTHH:mm:ss)，可选 parent_id。注意：project/phase 类型的 progress 自动置 0' +
      '\n  - update: 更新任务，必填 id/title/progress/work_hours/priority/start_date/end_date。注意：project/phase 不能修改进度' +
      '\n  - delete: 删除任务（级联删除所有子任务），需要 id' +
      '\n  - deps: 管理依赖，子命令 list(列出所有)/add(需要 taskId,dependsOnTaskId)/delete',
    tools: ['manage_todos', 'manage_planner']
  },
  {
    name: 'knowledge-agent',
    description:
      '管理文档、知识库和知识图谱的综合性知识代理。' +
      '可用能力：(1)文档管理 — 全文搜索文档、获取文档 Markdown 标题目录树、按标题导航阅读文档段落、创建/更新/删除文档（支持 Markdown 内容）；' +
      '(2)知识库管理 — 列出所有知识库、查看知识库详情、浏览层级目录结构（含文档数量）、查看目录下文档列表、创建/更新/删除知识库、创建/重命名/删除目录、将文档归档到目录或从目录移除；' +
      '(3)知识图谱 — 在知识图谱中搜索实体（人物、地点、概念、组织等），可按知识库限定搜索范围，返回实体类型、名称、别名、置信度、描述。' +
      '典型工作流：浏览知识库目录 → 找到目标文档 → 阅读文档内容；或在图谱中搜索实体关系。当你需要处理任何文档、知识库或图谱相关操作时使用此代理。',
    systemPrompt:
      '你是一个知识管理专家。你可以管理文档、知识库，并在知识图谱中搜索实体关系。' +
      '\n文档管理（manage_docs）:' +
      '\n  - search: 全文搜索，返回 id/标题/标签/摘要，需要 query' +
      '\n  - toc: 获取文档 Markdown 标题目录树（按 # 层级缩进），需要 docId' +
      '\n  - get: 获取文档内容，需要 docId，可选 headingId（从 toc 获取，如 h-2）定位到特定段落' +
      '\n  - create: 创建文档，需要 title，可选 summary/tags(JSON数组字符串)/content(Markdown)' +
      '\n  - update: 更新文档，需要 docId，可选 title/summary/tags/content' +
      '\n  - delete: 彻底删除文档（不可恢复），需要 docId' +
      '\n知识库管理（manage_wikis）:' +
      '\n  - list: 列出所有知识库（id/标题/标签/描述/文档数）' +
      '\n  - get: 获取知识库详情，需要 wikiId' +
      '\n  - directories: 获取层级目录树（含文档数量），需要 wikiId' +
      '\n  - docs: 获取目录下的文档列表，需要 directoryId' +
      '\n  - create/update/delete: 知识库 CRUD' +
      '\n  - create_directory: 创建目录，需要 wikiId/name，可选 parentId' +
      '\n  - update_directory/delete_directory: 重命名/删除目录' +
      '\n  - archive: 归档文档到目录，需要 directoryId/docIds(数组)' +
      '\n  - remove_doc: 从目录移除文档，需要 directoryId/docId' +
      '\n知识图谱（search_graph）:' +
      '\n  - 按关键词搜索实体，可选 wikiId 限定范围' +
      '\n工作流优先级：list → directories → docs 获得 docId 后用 manage_docs 的 toc/get 阅读；或直接 search_graph 查图谱',
    tools: ['manage_docs', 'manage_wikis', 'search_graph']
  },
  {
    name: 'entertainment-agent',
    description:
      '管理音乐播放的子代理。' +
      '可用能力：(1)列出所有歌单（名称、曲目数、描述）；' +
      '(2)列出指定歌单中的曲目（支持歌单名模糊匹配，显示标题、艺术家、时长、收藏状态）；' +
      '(3)播放指定 ID 的曲目（通过 IPC 通知播放器窗口自动开始播放）。' +
      '当你需要浏览歌单、查看曲目或播放音乐时使用此代理。',
    systemPrompt:
      '你是一个音乐助手。你可以管理用户的音乐库。' +
      '\n可用命令（manage_music）:' +
      '\n  - playlists: 列出所有歌单（名称、曲目数、描述）' +
      '\n  - tracks: 列出指定歌单的曲目。可选 playlistName（模糊匹配，不填返回第一个歌单）、limit（默认20）' +
      '\n  - play: 播放指定 ID 的曲目，需要 trackId。播放时会自动通知播放器窗口开始播放' +
      '\n工作流程：先 playlists 浏览歌单 → 用 tracks 查看曲目 → 用 play 播放指定曲目',
    tools: ['manage_music']
  }
]
