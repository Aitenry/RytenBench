import { HumanMessage } from '@langchain/core/messages'
import * as fs from 'fs'
import logger from 'electron-log'

/**
 * 构建 HumanMessage，支持多模态（图片 + 文本）及文档附件
 */
export function buildHumanMessage(
  text: string,
  images?: string[],
  documents?: { fileName: string; filePath: string }[]
): HumanMessage {
  let fullText = text

  // 将文档内容拼接到消息文本中
  if (documents && documents.length > 0) {
    for (const doc of documents) {
      try {
        const content = fs.readFileSync(doc.filePath, 'utf-8')
        // 截断过大的文件（限制 5KB，避免超出 token 上限）
        const truncated =
          content.length > 5000 ? content.slice(0, 5000) + '\n...(内容已截断)' : content
        fullText += `\n\n--- 附件文档: ${doc.fileName} ---\n${truncated}\n--- 文档结束 ---`
      } catch (err) {
        logger.warn(`Failed to read document ${doc.fileName}:`, err)
        fullText += `\n\n[无法读取文件: ${doc.fileName}]`
      }
    }
  }

  if (!images || images.length === 0) {
    return new HumanMessage(fullText)
  }

  // 多模态消息：文本 + 图片
  const content: { type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }[] = [
    { type: 'text', text: fullText }
  ]

  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: { url: img }
    })
  }

  return new HumanMessage({ content })
}
