import type { zhCNGraphSettings } from '../zh-CN/graphSettings'

export const enUSGraphSettings: typeof zhCNGraphSettings = {
  pageTitle: 'Graph building',
  pageDescription: 'Configure knowledge graph building parameters and default models',
  build: {
    sectionTitle: 'Build parameters',
    maxConcurrencyTitle: 'Max concurrent LLM calls',
    maxConcurrencyDescription:
      'Number of parallel LLM requests while building the graph. Higher is faster, but puts more pressure on the API.',
    gleaningTitle: 'Gleaning second pass',
    gleaningDescription:
      'Scan again after entity extraction so missed entities are still picked up',
    gleaningThresholdTitle: 'Gleaning document threshold',
    gleaningThresholdDescription:
      'Gleaning only runs when the knowledge base has no more documents than this. Above it, the pass is skipped to save time.',
    chunkSizeTitle: 'Text chunk size',
    chunkSizeDescription:
      'Maximum characters per chunk when splitting Markdown text by heading level'
  },
  model: {
    sectionTitle: 'Default models',
    graphModelTitle: 'Model used for graph building',
    graphModelDescription:
      'The default model for building the knowledge graph. Leave empty to use the provider default.',
    graphModelPlaceholder: 'Use the provider default',
    embeddingTitle: 'Embedding model',
    embeddingDescription:
      'The model used for text vector embeddings; only providers tagged as embedding are listed',
    embeddingPlaceholder: 'No embedding model set',
    embeddingEmpty: 'No embedding model yet — add one in model settings first'
  }
}
