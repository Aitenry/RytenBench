import { ipcMain } from 'electron'
import logger from 'electron-log'
import { availableTools } from '../harness'
import type { ToolInfo } from '../harness/types'
import { mainMessages } from '../i18n'

type ToolText = { label: string; description: string }

/**
 * 工具下拉的展示文案随界面语言。
 * `availableTools` 里的 label/description 是**界面元数据**（与各工具给模型看的
 * description 无关），所以在这里按当前语言覆盖后再下发；未收录的工具名保持原值。
 */
function localizeTools(): ToolInfo[] {
  const dict: Record<string, ToolText> = mainMessages().tools
  return availableTools.map((tool) => {
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
