import { BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import logger from 'electron-log'
import { settingsStore, streamAbortControllers, activeChatStreams } from '../context'
import { ChatService, buildTools } from '../chat'
import type { ToolCallDetail, SubAgentEvent, MemoryInjection } from '../chat/types'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { getProviderService } from '../provider/service'
import { getSubAgentDefs } from '../chat/preload-cache'
import { todoStore } from '../chat/runtime/todo'
import { ChatSettings } from '../types/settings'
import { createTopic, addDialogue, getDialoguesByTopicId } from '../database/mapper/chat'

/** 对话发送 / 流式输出 / 目录选择 / 技能列表 IPC */
export function registerChatIpc(): void {
  ipcMain.handle(
    'chat-send-message',
    async (
      _event,
      question: string,
      options?: {
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      // 加载主智能体默认配置（electron-store）
      const mainAgentDefaults = settingsStore.get('mainAgent') as
        { tools?: string[]; skills?: string[] } | undefined
      const tools = buildTools(mainAgentDefaults?.tools ?? [])
      logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)
      const model = await getProviderService().createModel(options?.providerId)
      const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

      // 技能优先级：chatSettings.enabledSkills > mainAgent.skills
      const effectiveSkills = chatSettings?.enabledSkills ?? mainAgentDefaults?.skills

      const chatService = new ChatService(
        model,
        tools,
        await getSubAgentDefs(chatSettings?.activeWorkspaceId ?? 0),
        getDialoguesByTopicId,
        chatSettings?.skillsPath || undefined,
        effectiveSkills,
        chatSettings?.workspacePath || undefined,
        chatSettings?.memoryPath || undefined,
        chatSettings?.activeWorkspaceId ?? 0
      )
      return await chatService.sendMessage(question, options)
    }
  )

  ipcMain.on(
    'chat-start-stream',
    (
      event,
      question: string,
      options?: {
        topicId?: number
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      // 跟踪进行中的流：应用退出时统一中止并等待数据保存完成
      const streamPromise = (async () => {
        // 加载主智能体默认配置（electron-store）
        const mainAgentDefaults = settingsStore.get('mainAgent') as
          { tools?: string[]; skills?: string[] } | undefined
        const tools = buildTools(mainAgentDefaults?.tools ?? [])
        logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)

        // 模型创建可能因供应商不存在、被禁用、模型名称为空等原因失败，需要捕获并通知前端
        let model: BaseChatModel
        try {
          model = await getProviderService().createModel(options?.providerId)
        } catch (modelErr) {
          const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr)
          logger.error('[Chat] Model creation failed:', errMsg)
          if (!event.sender.isDestroyed()) {
            try {
              event.sender.send('chat-stream-error', { error: errMsg, topicId: options?.topicId })
              event.sender.send('chat-stream-done', { topicId: options?.topicId ?? 0 })
            } catch (sendErr) {
              logger.warn('[Chat] Failed to send stream error/done (renderer disposed):', sendErr)
            }
          }
          return
        }

        const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

        // 创建 AbortController 用于取消流式输出
        const abortController = new AbortController()
        streamAbortControllers.set(event.sender.id, abortController)

        // 1. 确保话题存在
        let topicId = options?.topicId
        if (!topicId) {
          const title = question.slice(0, 50)
          const workspaceId = chatSettings?.activeWorkspaceId ?? 0
          try {
            topicId = await createTopic(
              workspaceId,
              title,
              undefined,
              mainAgentDefaults?.tools?.length ? JSON.stringify(mainAgentDefaults.tools) : undefined
            )
          } catch (err) {
            logger.error('Failed to create topic:', err)
            topicId = 0
          }
        }

        // 2. 保存用户消息（含图片和文档）
        try {
          const userBlocks: { type: string; image_url?: string; fileName?: string }[] = []
          if (options?.images?.length) {
            for (const img of options.images) {
              userBlocks.push({ type: 'image', image_url: img })
            }
          }
          if (options?.documents?.length) {
            for (const doc of options.documents) {
              userBlocks.push({ type: 'document', fileName: doc.fileName })
            }
          }
          await addDialogue({
            topic_id: topicId,
            role: 'user',
            content: question,
            blocks: JSON.stringify(userBlocks)
          })
        } catch (err) {
          logger.error('Failed to save user message:', err)
        }

        // 2.5. 历史对话上下文由 ChatService 内部从数据库加载（超长自动压缩）

        // 技能优先级：chatSettings.enabledSkills > mainAgent.skills
        const effectiveSkills = chatSettings?.enabledSkills ?? mainAgentDefaults?.skills

        const chatService = new ChatService(
          model,
          tools,
          await getSubAgentDefs(chatSettings?.activeWorkspaceId ?? 0),
          getDialoguesByTopicId,
          chatSettings?.skillsPath || undefined,
          effectiveSkills,
          chatSettings?.workspacePath || undefined,
          chatSettings?.memoryPath || undefined,
          chatSettings?.activeWorkspaceId ?? 0
        )
        const stream = chatService.sendMessageStream(question, {
          ...options,
          topicId,
          signal: abortController.signal
        })
        const accumulatedBlocks: {
          type: string
          text?: string
          tool?: ToolCallDetail
          reasoning?: string
          subAgent?: SubAgentEvent
          /** 本轮注入的热记忆（memoryInjected 类型；随 blocks 持久化，历史对话可恢复显示） */
          memory?: MemoryInjection
          children?: {
            type: string
            text?: string
            tool?: ToolCallDetail
            reasoning?: string
          }[]
        }[] = []
        let fullContent = ''
        let lastReasoning = ''

        try {
          for await (const chunk of stream) {
            if (abortController.signal.aborted) {
              logger.info('[Chat] Stream cancelled by user')
              break
            }
            // 本轮热记忆注入：置于消息块最顶部（首个 chunk 到达，仅累积一次，随 blocks 持久化）
            if (chunk.memoryInjected) {
              const exists = accumulatedBlocks.some((b) => b.type === 'memoryInjected')
              if (!exists) {
                accumulatedBlocks.unshift({
                  type: 'memoryInjected',
                  memory: chunk.memoryInjected
                })
              }
            }
            if (chunk.reasoning_content) {
              const rc = String(chunk.reasoning_content)
              // 兼容 provider 可能下发完整文本而非增量：若新内容是已有内容的前缀/后缀，则替换/忽略
              if (
                lastReasoning &&
                rc.startsWith(lastReasoning) &&
                rc.length > lastReasoning.length
              ) {
                const delta = rc.slice(lastReasoning.length)
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'reasoning') {
                  lastBlock.reasoning = (lastBlock.reasoning || '') + delta
                } else {
                  accumulatedBlocks.push({ type: 'reasoning', reasoning: delta })
                }
                lastReasoning = rc
              } else if (lastReasoning && lastReasoning.endsWith(rc)) {
                // 重复内容，忽略
              } else {
                lastReasoning = rc
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'reasoning') {
                  lastBlock.reasoning = (lastBlock.reasoning || '') + rc
                } else {
                  accumulatedBlocks.push({ type: 'reasoning', reasoning: rc })
                }
              }
            }
            if (chunk.content) {
              const c = String(chunk.content)
              // 兼容 provider 可能下发完整文本而非增量：若新内容是已有内容的前缀/后缀，则替换/忽略
              if (fullContent && c.startsWith(fullContent) && c.length > fullContent.length) {
                const delta = c.slice(fullContent.length)
                fullContent = c
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'text') {
                  lastBlock.text = (lastBlock.text || '') + delta
                } else {
                  accumulatedBlocks.push({ type: 'text', text: c })
                }
              } else if (fullContent && fullContent.endsWith(c)) {
                // 重复内容，忽略
              } else {
                fullContent += c
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'text') {
                  lastBlock.text = (lastBlock.text || '') + c
                } else {
                  accumulatedBlocks.push({ type: 'text', text: c })
                }
              }
            }
            if (chunk.tool) {
              if (chunk.tool.name === 'task') {
                // task 工具已由 service.ts 转换为 subAgent 事件下发，此处跳过
              } else {
                // 优先按 callId 精确匹配同一次调用；preparing 阶段没有 id 时按名称回退；
                // ID 来自不同来源可能不一致，同名未完成时也按名称回退
                const matchesTool = (t: ToolCallDetail): boolean => {
                  if (chunk.tool!.id) {
                    if (t.id === chunk.tool!.id) return true
                    if (!t.id && t.status === 'preparing' && t.name === chunk.tool!.name)
                      return true
                    if (t.id && t.status && t.status !== 'completed' && t.name === chunk.tool!.name)
                      return true
                    return false
                  }
                  return t.name === chunk.tool!.name || t.name === ''
                }
                if (chunk.tool.status === 'completed') {
                  // 匹配同一次调用的未完成工具块并更新
                  for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
                    const b = accumulatedBlocks[i]
                    if (
                      b.type === 'tool' &&
                      b.tool &&
                      b.tool.status !== 'completed' &&
                      matchesTool(b.tool)
                    ) {
                      b.tool.output = chunk.tool.output
                      b.tool.status = chunk.tool.status
                      b.tool.card = chunk.tool.card
                      break
                    }
                  }
                } else if (chunk.tool.status === 'preparing') {
                  // 模型开始构建工具参数；后续进度 chunk 仅用于保活，已存在则跳过。
                  // 若同一次调用已处于 executing/completed（事件乱序），也跳过，避免重复块。
                  const exists = accumulatedBlocks.some(
                    (b) => b.type === 'tool' && matchesTool(b.tool as ToolCallDetail)
                  )
                  if (!exists) {
                    accumulatedBlocks.push({
                      type: 'tool',
                      tool: {
                        name: chunk.tool.name,
                        input: {},
                        output: '',
                        status: 'preparing',
                        id: chunk.tool.id
                      }
                    })
                  }
                } else {
                  // executing：优先合并到同一次调用的 preparing 块
                  let merged = false
                  for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
                    const b = accumulatedBlocks[i]
                    if (
                      b.type === 'tool' &&
                      b.tool?.status === 'preparing' &&
                      matchesTool(b.tool)
                    ) {
                      b.tool.name = chunk.tool.name
                      b.tool.input = chunk.tool.input
                      b.tool.status = 'executing'
                      b.tool.id = b.tool.id ?? chunk.tool.id
                      merged = true
                      break
                    }
                  }
                  if (!merged) {
                    accumulatedBlocks.push({
                      type: 'tool',
                      tool: {
                        name: chunk.tool.name,
                        input: chunk.tool.input,
                        output: chunk.tool.output,
                        status: 'executing',
                        id: chunk.tool.id
                      }
                    })
                  }
                }
              }
            }
            if (chunk.subAgent) {
              const sa = chunk.subAgent

              // 注意：不把子智能体输出拼入 fullContent（主消息 content）。
              // 子智能体详情已持久化在 blocks 的 subAgent 块（含 children），
              // 历史重载按 blocks 渲染即可；若再拼入 content，会导致：
              // ① 复制消息/上下文注入时子智能体全文重复出现在主智能体发言中；
              // ② 主模型下一轮看到重复文本，进一步放大复述行为。
              // 子智能体块匹配逻辑见下：

              // 匹配智能体累积块：优先 causeId，回退 name
              const matchesSa = (b: (typeof accumulatedBlocks)[number]): boolean => {
                if (b.type !== 'subAgent' || !b.subAgent) return false
                if (sa.causeId && b.subAgent.causeId) return b.subAgent.causeId === sa.causeId
                return b.subAgent.name === sa.name
              }

              // 查找或创建同名智能体累积块
              let saBlock = accumulatedBlocks.find(matchesSa)
              if (!saBlock) {
                saBlock = {
                  type: 'subAgent',
                  subAgent: {
                    name: sa.name,
                    causeId: sa.causeId,
                    status: sa.status,
                    taskDescription: sa.taskDescription
                  },
                  children: []
                }
                accumulatedBlocks.push(saBlock)
              }

              if (sa.status === 'started') {
                saBlock.subAgent!.status = sa.status
                saBlock.subAgent!.taskDescription =
                  saBlock.subAgent!.taskDescription || sa.taskDescription
              } else if (sa.status === 'completed' || sa.status === 'error') {
                saBlock.subAgent!.status = sa.status
                saBlock.subAgent!.output = sa.output
                saBlock.subAgent!.error = sa.error
              } else if (sa.content || sa.reasoning_content || sa.tool) {
                if (
                  saBlock.subAgent!.status !== 'completed' &&
                  saBlock.subAgent!.status !== 'error'
                ) {
                  saBlock.subAgent!.status = 'running'
                }
                if (!saBlock.children) saBlock.children = []

                if (sa.reasoning_content) {
                  const lastChild = saBlock.children[saBlock.children.length - 1]
                  if (lastChild && lastChild.type === 'reasoning') {
                    lastChild.reasoning = (lastChild.reasoning || '') + sa.reasoning_content
                  } else {
                    saBlock.children.push({ type: 'reasoning', reasoning: sa.reasoning_content })
                  }
                }

                if (sa.content) {
                  const lastChild = saBlock.children[saBlock.children.length - 1]
                  if (lastChild && lastChild.type === 'text') {
                    lastChild.text = (lastChild.text || '') + sa.content
                  } else {
                    saBlock.children.push({ type: 'text', text: sa.content })
                  }
                }

                if (sa.tool) {
                  // 优先按 callId 精确匹配同一次调用；preparing 阶段没有 id 时按名称回退；
                  // ID 来自不同来源可能不一致，同名未完成时也按名称回退
                  const matchesTool = (t: ToolCallDetail): boolean => {
                    if (sa.tool!.id) {
                      if (t.id === sa.tool!.id) return true
                      if (!t.id && t.status === 'preparing' && t.name === sa.tool!.name) return true
                      if (t.id && t.status && t.status !== 'completed' && t.name === sa.tool!.name)
                        return true
                      return false
                    }
                    return t.name === sa.tool!.name || t.name === ''
                  }
                  if (sa.tool.status === 'completed') {
                    for (let i = saBlock.children.length - 1; i >= 0; i--) {
                      const c = saBlock.children[i]
                      if (
                        c.type === 'tool' &&
                        c.tool &&
                        c.tool.status !== 'completed' &&
                        matchesTool(c.tool)
                      ) {
                        c.tool.output = sa.tool.output
                        c.tool.status = 'completed'
                        c.tool.card = sa.tool.card
                        break
                      }
                    }
                  } else if (sa.tool.status === 'preparing') {
                    const exists = saBlock.children.some(
                      (c) =>
                        c.type === 'tool' && c.tool?.status === 'preparing' && matchesTool(c.tool)
                    )
                    if (!exists) {
                      saBlock.children.push({
                        type: 'tool',
                        tool: {
                          name: sa.tool.name,
                          input: {},
                          output: '',
                          status: 'preparing',
                          id: sa.tool.id
                        }
                      })
                    }
                  } else {
                    let merged = false
                    for (let i = saBlock.children.length - 1; i >= 0; i--) {
                      const c = saBlock.children[i]
                      if (
                        c.type === 'tool' &&
                        c.tool?.status === 'preparing' &&
                        matchesTool(c.tool)
                      ) {
                        c.tool.name = sa.tool.name
                        c.tool.input = sa.tool.input
                        c.tool.status = 'executing'
                        c.tool.id = c.tool.id ?? sa.tool.id
                        merged = true
                        break
                      }
                    }
                    if (!merged) {
                      saBlock.children.push({
                        type: 'tool',
                        tool: {
                          name: sa.tool.name,
                          input: sa.tool.input,
                          output: sa.tool.output || '',
                          status: 'executing',
                          id: sa.tool.id
                        }
                      })
                    }
                  }
                }
              }
            }
            if (!event.sender.isDestroyed()) {
              try {
                event.sender.send('chat-stream-chunk', { ...chunk, __topicId: topicId })
              } catch (sendErr) {
                logger.warn('[Chat] Failed to send stream chunk (renderer disposed):', sendErr)
                break
              }
            }
          }
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            logger.error('Error in chat stream:', error)
            const errMsg = error instanceof Error ? error.message : String(error)
            if (!event.sender.isDestroyed()) {
              try {
                event.sender.send('chat-stream-error', { error: errMsg, topicId })
              } catch (sendErr) {
                logger.warn('[Chat] Failed to send stream error (renderer disposed):', sendErr)
              }
            }
            // 流异常中断时不保存不完整的 AI 回复，直接跳到清理
            streamAbortControllers.delete(event.sender.id)
            if (!event.sender.isDestroyed()) {
              try {
                event.sender.send('chat-stream-done', { topicId })
              } catch (sendErr) {
                logger.warn('[Chat] Failed to send stream done (renderer disposed):', sendErr)
              }
            }
            return
          }
        }

        // 4. 保存完整的 AI 回复
        try {
          await addDialogue({
            topic_id: topicId,
            role: 'assistant',
            content: fullContent,
            blocks: JSON.stringify(accumulatedBlocks)
          })
        } catch (err) {
          logger.error('Failed to save AI message:', err)
        }

        // 5. 清理并通知渲染进程流式输出已完成
        streamAbortControllers.delete(event.sender.id)
        if (!event.sender.isDestroyed()) {
          try {
            event.sender.send('chat-stream-done', { topicId })
          } catch (sendErr) {
            logger.warn('[Chat] Failed to send stream done (renderer disposed):', sendErr)
          }
        }
      })()
      activeChatStreams.add(streamPromise)
      streamPromise.finally(() => activeChatStreams.delete(streamPromise))
    }
  )

  // 取消流式输出
  ipcMain.on('chat-cancel-stream', (event) => {
    const controller = streamAbortControllers.get(event.sender.id)
    if (controller) {
      controller.abort()
      streamAbortControllers.delete(event.sender.id)
    }
  })

  // 对话计划清单（write_todos）变更 → 广播到渲染进程（输入框上方的进行中任务卡片）
  todoStore.onChange = (topicId, todos) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('chat-todos-updated', { topicId, todos })
      }
    }
  }

  // 选择记忆（Memory）存储目录
  ipcMain.handle('chat-select-memory-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择记忆存储目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 选择技能（Skills）存储目录
  ipcMain.handle('chat-select-skills-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择技能存储目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 选择 AI 工作区目录（FilesystemBackend 挂载根目录）
  ipcMain.handle('chat-select-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择 AI 工作区目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 列出技能目录中的所有技能
  ipcMain.handle('chat-list-skills', async () => {
    try {
      const settings = settingsStore.store
      const skillsPath = (settings.chat as ChatSettings)?.skillsPath
      if (!skillsPath) return []

      const entries = fs.readdirSync(skillsPath, { withFileTypes: true })
      const skills: { id: string; name: string; description: string }[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillMdPath = join(skillsPath, entry.name, 'SKILL.md')
        try {
          fs.accessSync(skillMdPath, fs.constants.R_OK)
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
          let name = entry.name
          let description = ''
          if (fm) {
            const n = fm[1].match(/^name:\s*(.+)$/m)
            const d = fm[1].match(/^description:\s*(.+)$/m)
            if (n) name = n[1].trim()
            if (d) description = d[1].trim()
          }
          skills.push({ id: entry.name, name, description })
        } catch {
          // 目录中没有 SKILL.md，跳过
        }
      }
      return skills
    } catch (error) {
      logger.error('Error listing skills:', error)
      return []
    }
  })
}
