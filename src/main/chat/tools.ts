import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import { ToolInfo } from './types'

/** Registry of all available tools */
const toolBuilders: Record<string, () => StructuredToolInterface> = {
  get_weather: () =>
    tool(() => Promise.resolve("It's sunny with clear skies, 22°C."), {
      name: 'get_weather',
      description: 'Get the current weather at a specified location.',
      schema: z.object({
        location: z.string().describe('The city or location to get the weather for')
      })
    }),
  get_time: () =>
    tool(() => Promise.resolve(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })), {
      name: 'get_time',
      description: 'Get the current date and time.',
      schema: z.object({})
    })
}

/** Tool info list for the frontend dropdown */
export const availableTools: ToolInfo[] = [
  {
    name: 'get_weather',
    label: '天气查询',
    description: '查询指定城市的天气信息',
    icon: 'RiSunCloudyLine',
    color: '#1677ff'
  },
  {
    name: 'get_time',
    label: '时间查询',
    description: '获取当前日期和时间',
    icon: 'RiTimeLine',
    color: '#52c41a'
  }
]

/** Build LangChain tool instances from selected tool names */
export function buildTools(toolNames: string[]): StructuredToolInterface[] {
  return toolNames.filter((name) => name in toolBuilders).map((name) => toolBuilders[name]())
}

export { toolBuilders }
