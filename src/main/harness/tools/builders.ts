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
// 注意：这里的 label/description 只是**兜底**，真正下发前会由
// ipc/misc.ts 按当前界面语言用 mainMessages().tools 覆盖（未收录的名字才用这里的值）。
// 它们与各工具给模型看的 description 是两回事，改这里不影响模型行为。
// ============================================================================

export const availableTools: ToolInfo[] = [
  {
    name: 'get_weather',
    label: 'Weather',
    description: 'Current conditions and forecast',
    icon: 'RiSunCloudyLine',
    color: '#1677ff'
  },
  {
    name: 'get_time',
    label: 'Time',
    description: 'Current date and time',
    icon: 'RiTimeLine',
    color: '#52c41a'
  },
  {
    name: 'manage_todos',
    label: 'To-dos',
    description: 'View, create, update and delete to-dos',
    icon: 'RiListCheck3',
    color: '#fa8c16'
  },
  {
    name: 'manage_docs',
    label: 'Documents',
    description: 'Search, view, create, edit and delete documents',
    icon: 'RiFileSearchLine',
    color: '#722ed1'
  },
  {
    name: 'manage_wikis',
    label: 'Knowledge base',
    description: 'Browse and manage knowledge bases, folders and archived documents',
    icon: 'RiBook2Line',
    color: '#13c2c2'
  },
  {
    name: 'search_graph',
    label: 'Graph search',
    description: 'Search entities in the knowledge graph',
    icon: 'RiMindMap',
    color: '#eb2f96'
  },
  {
    name: 'manage_planner',
    label: 'Planner',
    description: 'Inspect the Gantt chart and task tree',
    icon: 'RiBarChartHorizontalLine',
    color: '#2f54eb'
  },
  {
    name: 'manage_music',
    label: 'Music',
    description: 'Browse playlists and tracks',
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
