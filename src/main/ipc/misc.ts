import { ipcMain } from 'electron'
import logger from 'electron-log'
import { listAvailableTools } from '../harness'
import type { ToolInfo } from '../harness/types'
import { mainMessages } from '../i18n'

type ToolText = { label: string; description: string }

/**
 * 工具下拉的展示文案随界面语言。
 * `listAvailableTools()` 里的 label/description 是**界面元数据**（与各工具给模型看的
 * description 无关），所以在这里按当前语言覆盖后再下发；未收录的工具名保持原值。
 *
 * 清单本身每次请求时现取（本地工具 + 各插件当前的贡献），因此插件启停会立刻反映到设置页。
 */
function localizeTools(): ToolInfo[] {
  const dict: Record<string, ToolText> = mainMessages().tools
  return listAvailableTools().map((tool) => {
    const text = dict[tool.name]
    return text ? { ...tool, label: text.label, description: text.description } : tool
  })
}

/** 杂项 IPC：心跳、工具列表、初始化进度日志 */
export function registerMiscIpc(): void {
  ipcMain.on('ping', () => logger.info('pong'))

  ipcMain.handle('harness-get-tools', async () => {
    return localizeTools()
  })

  ipcMain.on('init-progress', (_event, data) => {
    logger.info('Init progress:', data)
  })
}
