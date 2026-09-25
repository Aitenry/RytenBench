import type { StructuredToolInterface } from '@langchain/core/tools'
import type { SubAgentConfig } from '../types'
import {
  HARNESS_TOOL_CONTRIBUTION,
  type PluginToolContribution,
  type ToolInfo
} from '../../../../main/plugins/tool-contract'
import { listContributions } from '../../../../main/plugins/contributions'
import { buildGetWeatherTool } from './weather'
import { buildGetTimeTool } from './time'

// ============================================================================
// Tool Registry — 本地工具 + 插件贡献（harness 只提供注册表/消费点）
// ============================================================================

type ToolFactory = () => StructuredToolInterface

/**
 * harness **本地**工具：与某个插件的数据无关，因此留在 harness。
 * - `get_weather`：数据源 `src/main/weather.ts` 属 core；
 * - `get_time`：纯本地时间。
 *
 * planner / home / music 的工具**不在这里**：它们的实现已搬进各自插件
 * （`src/plugins/<id>/main/tools.ts`），由插件 `install(ctx)` 经
 * `ctx.contribute(HARNESS_TOOL_CONTRIBUTION, …)` 注册，这里在组装时拉取。
 */
export const toolBuilders: Record<string, ToolFactory> = {
  get_weather: buildGetWeatherTool,
  get_time: buildGetTimeTool
}

// ============================================================================
// Tool Info — 前端下拉列表
// 注意：这里的 label/description 只是**兜底**，真正下发前会由
// ipc/misc.ts 按当前界面语言用 mainMessages().tools 覆盖（未收录的名字才用这里的值）。
// 它们与各工具给模型看的 description 是两回事，改这里不影响模型行为。
// ============================================================================

/** 本地工具的展示元数据（插件工具的元数据随贡献一起带上，见 tool-contract.ts） */
const localToolInfos: ToolInfo[] = [
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
  }
]

/** 已告警过的重名（同名工具每轮组装都会撞上，这里只提示一次，避免刷日志） */
const warnedConflicts = new Set<string>()

function warnConflict(name: string): void {
  if (warnedConflicts.has(name)) return
  warnedConflicts.add(name)
  console.warn(
    `[Harness] 工具名冲突：'${name}' 已被更早注册的同名工具占用（本地工具优先），忽略后续贡献`
  )
}

/**
 * 合并后的工具表：本地工具 + 各插件贡献。
 *
 * **每次调用都重新拉取贡献**——这正是「插件启停即时生效」的落点：插件停用后贡献被宿主摘除，
 * 下一次组装（下一轮对话/子代理）就看不到它的工具。未装载任何插件时贡献为空数组，
 * 工具集退化为本地两个工具，**不抛错**。
 */
function resolveToolBuilders(): Record<string, ToolFactory> {
  const merged: Record<string, ToolFactory> = { ...toolBuilders }
  for (const contribution of listContributions<PluginToolContribution>(HARNESS_TOOL_CONTRIBUTION)) {
    if (contribution.name in merged) {
      warnConflict(contribution.name)
      continue
    }
    merged[contribution.name] = contribution.build
  }
  return merged
}

/**
 * 工具清单（设置 → 智能体页的工具下拉用）：本地工具 + 各插件贡献，同名的本地优先。
 * 每次调用即时拉取，因此插件的启停会立刻反映在这份清单里。
 *
 * 贡献部分**按 name 排序**：注册表本身顺序无关（按插件装载顺序入列），不排序的话
 * 启停过一次插件就会让设置页下拉的顺序发生变化。本地工具固定排在前。
 */
export function listAvailableTools(): ToolInfo[] {
  const infos: ToolInfo[] = [...localToolInfos]
  const seen = new Set(infos.map((info) => info.name))
  const contributed: ToolInfo[] = []
  for (const contribution of listContributions<PluginToolContribution>(HARNESS_TOOL_CONTRIBUTION)) {
    if (seen.has(contribution.name)) {
      warnConflict(contribution.name)
      continue
    }
    seen.add(contribution.name)
    contributed.push(contribution.info)
  }
  contributed.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  return [...infos, ...contributed]
}

// ============================================================================
// Build Tools
// ============================================================================

/** Build LangChain tool instances from selected tool names */
export function buildTools(toolNames: string[]): StructuredToolInterface[] {
  const registry = resolveToolBuilders()
  return toolNames.filter((name) => name in registry).map((name) => registry[name]())
}

/** 为智能体构建实际的工具实例 */
export function buildSubAgentTools(subAgent: SubAgentConfig): StructuredToolInterface[] {
  const registry = resolveToolBuilders()
  return (subAgent.tools || []).filter((name) => name in registry).map((name) => registry[name]())
}

// ============================================================================
// SubAgent Registry
// ============================================================================

/** 从数据库加载指定工作区下已启用的智能体定义 */
export async function loadSubAgentDefinitions(workspaceId: number): Promise<SubAgentConfig[]> {
  const { getEnabledSubAgentConfigs } = await import('../db/mapper/agent')
  return getEnabledSubAgentConfigs(workspaceId)
}
