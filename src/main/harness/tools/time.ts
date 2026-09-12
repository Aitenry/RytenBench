import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'

// ============================================================================
// Time Tool — 时间查询
// ============================================================================

export function buildGetTimeTool(): StructuredToolInterface {
  return tool(
    () => Promise.resolve(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })),
    {
      name: 'get_time',
      description: '获取当前日期和时间。',
      schema: z.object({})
    }
  )
}
