import type { StructuredToolInterface } from '@langchain/core/tools'
import type { ToolInfo, SubAgentConfig } from '../types'
import { buildGetWeatherTool } from './weather'
import { buildGetTimeTool } from './time'
import { buildManageTodosTool } from './todos'
import { buildManageDocsTool } from './docs'
import { buildManageWikisTool } from './wikis'
import { buildSearchGraphTool } from './graph'
import { buildManagePlannerTool } from './planner'
import { buildManageMusicTool } from './music'

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

/** 为智能体构建实际的工具实例 */
export function buildSubAgentTools(subAgent: SubAgentConfig): StructuredToolInterface[] {
  return (subAgent.tools || [])
    .filter((name) => name in toolBuilders)
    .map((name) => toolBuilders[name]())
}

// ============================================================================
// SubAgent Registry
// ============================================================================

/** 从数据库加载指定工作区下已启用的智能体定义 */
export async function loadSubAgentDefinitions(workspaceId: number): Promise<SubAgentConfig[]> {
  const { getEnabledSubAgentConfigs } = await import('../../database/mapper/agent')
  return getEnabledSubAgentConfigs(workspaceId)
}
