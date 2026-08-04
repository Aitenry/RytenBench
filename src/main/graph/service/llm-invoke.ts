import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import logger from 'electron-log'
import { parseFromLLM } from 'json-llm-repair'
import type { z } from 'zod/v3'

export interface ServiceContext {
  model: BaseChatModel
  cache: Map<string, string>
  cachedInvoke: <T>(
    prompt: string,
    parser: StructuredOutputParser<z.ZodTypeAny>
  ) => Promise<T | null>
}

const CACHE_MAX_SIZE = 500

export function createCachedInvoke(model: BaseChatModel, cache: Map<string, string>) {
  return async function cachedStructuredInvoke<T>(
    prompt: string,
    parser: StructuredOutputParser<z.ZodTypeAny>
  ): Promise<T | null> {
    const cacheKey = prompt.slice(0, 200) + '|||' + prompt.slice(-200)
    const cached = cache.get(cacheKey)

    let rawContent: string
    if (cached !== undefined) {
      rawContent = cached
    } else {
      const response = await model.invoke(prompt)
      rawContent = typeof response.content === 'string' ? response.content : ''

      if (cache.size >= CACHE_MAX_SIZE) {
        const firstKey = cache.keys().next().value
        if (firstKey) cache.delete(firstKey)
      }
      cache.set(cacheKey, rawContent)
    }

    const attempt = <T>(fn: () => T | Promise<T>): Promise<T | null> =>
      Promise.resolve(fn()).catch(() => null)

    const parsed =
      (await attempt(() => parser.parse(rawContent) as T)) ??
      (await attempt(() => parseFromLLM(rawContent, { mode: 'repair' }) as T))

    if (parsed == null) {
      logger.warn('All parsing strategies failed for prompt')
    }

    return parsed as T
  }
}
