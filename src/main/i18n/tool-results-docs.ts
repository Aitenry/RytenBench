import { getMainLanguage } from './index'

/** 文档/知识库/图谱搜索工具的返回文案（会显示在工具卡片上，跟随界面语言）。 */
export const zhCNDocsToolTexts = {
  /** 文档之间的列表分隔符（中文顿号 / 英文逗号） */
  listSeparator: '、',

  // ----- manage_docs -----
  docs: {
    /* 条数短语单独抽出来做单复数：中文不变，英文 1 result / n results */
    searchCount_one: '共 {{count}} 条',
    searchCount_other: '共 {{count}} 条',
    searchHeader: '**搜索 "{{query}}"**（{{count}}）\n',
    searchEmpty: '没有找到匹配 "{{query}}" 的文档。',
    notFound: '未找到 ID 为 {{docId}} 的文档。',
    noContent: '文档 "{{title}}" 没有内容。',
    noHeadings: '文档 "{{title}}" 没有标题结构。',
    headingNotFound: '未找到标题 ID "{{headingId}}"。可用标题：{{headings}}',
    tagsLabel: '标签：{{tags}}',
    summaryLabel: '摘要：{{summary}}',
    hasImage: '有封面图片',
    tocCount_one: '共 {{count}} 个标题',
    tocCount_other: '共 {{count}} 个标题',
    tocHeader: '**{{title}}** 的目录结构（{{count}}）\n',
    created:
      '文档创建成功！ID: {{id}}, 标题: "{{title}}"。创建后可将其归档到知识库目录中' +
      '（使用 manage_wikis 的 archive 命令）。',
    noFieldsToUpdate: '没有需要更新的字段。',
    updated: '文档 [{{docId}}] "{{title}}" 更新成功。',
    deleted: '文档 [{{docId}}] "{{title}}" 已彻底删除。',
    unknownCommand: '未知命令：{{command}}。支持：search, toc, get, create, update, delete'
  },

  // ----- manage_wikis -----
  wikis: {
    listEmpty: '还没有创建任何知识库。',
    listHeader: '**知识库列表**（共 {{count}} 个）\n',
    tagsLabel: '标签：{{tags}}',
    descriptionLabel: '描述：{{summary}}',
    docCountLabel: '文档数：{{count}}',
    notFound: '未找到 ID 为 {{wikiId}} 的知识库。',
    wikiTagsLabel: '标签：{{tags}}',
    wikiDescriptionLabel: '描述：{{summary}}',
    wikiHasImage: '有封面图片',
    docTotalLabel: '文档总数：{{count}}',
    createdAtLabel: '创建时间：{{createdAt}}',
    updatedAtLabel: '更新时间：{{updatedAt}}',
    directoryCount_one: '共 {{count}} 个',
    directoryCount_other: '共 {{count}} 个',
    directoriesHeader: '**{{title}}** 的目录结构（{{count}}）\n',
    directoriesEmpty: '知识库 "{{title}}" 下还没有目录。',
    directoryDocCount: '（{{count}} 篇）',
    directoryEmpty: '（空）',
    directoryDocsEmpty: '该目录下还没有文档。',
    directoryDocsHeader: '**目录文档列表**（共 {{count}} 篇）\n',
    docTagsLabel: '标签：{{tags}}',
    docDescriptionLabel: '描述：{{summary}}',
    created: '知识库创建成功！ID: {{id}}, 标题: "{{title}}"',
    noFieldsToUpdate: '没有需要更新的字段。',
    updated: '知识库 [{{wikiId}}] "{{title}}" 更新成功。',
    deleted: '知识库 [{{wikiId}}] "{{title}}" 已删除。',
    parentNotFound: '父目录不存在或不属于知识库 [{{wikiId}}]，创建已取消。',
    directoryCreated: '目录创建成功！ID: {{id}}, 名称: "{{name}}", 所属知识库: "{{wikiTitle}}"',
    directoryUpdated: '目录 [{{directoryId}}] 已更新为 "{{name}}"。',
    directoryDeleted: '目录 [{{directoryId}}] 已删除。',
    archivedDoc: '  文档 [{{docId}}] 归档成功',
    archiveFailedDoc: '  文档 [{{docId}}] 归档失败（可能已存在）',
    archiveDone: '归档完成：\n{{results}}',
    docRemoved: '文档 [{{docId}}] 已从目录 [{{directoryId}}] 移除。',
    removeFailed: '移除失败：文档 [{{docId}}] 不在目录 [{{directoryId}}] 中。',
    unknownCommand:
      '未知命令：{{command}}。支持：list, get, directories, docs, create, update, delete, ' +
      'create_directory, update_directory, delete_directory, archive, remove_doc'
  },

  // ----- search_graph -----
  graph: {
    searchHeader: '**知识图谱搜索 "{{query}}"**\n',
    wikiLabel: '  Wiki [{{wikiId}}]：',
    aliasSuffix: '（别名：{{aliases}}）',
    confidenceSuffix: '（置信度 {{percent}}%）',
    searchEmpty: '未在知识图谱中找到与 "{{query}}" 相关的实体。'
  }
}

export const enUSDocsToolTexts: typeof zhCNDocsToolTexts = {
  listSeparator: ', ',

  docs: {
    searchCount_one: '{{count}} result',
    searchCount_other: '{{count}} results',
    searchHeader: '**Search "{{query}}"** ({{count}})\n',
    searchEmpty: 'No documents match "{{query}}".',
    notFound: 'Document {{docId}} not found.',
    noContent: 'Document "{{title}}" has no content.',
    noHeadings: 'Document "{{title}}" has no heading structure.',
    headingNotFound: 'Heading ID "{{headingId}}" not found. Available headings: {{headings}}',
    tagsLabel: 'Tags: {{tags}}',
    summaryLabel: 'Summary: {{summary}}',
    hasImage: 'Has a cover image',
    tocCount_one: '{{count}} heading',
    tocCount_other: '{{count}} headings',
    tocHeader: "**{{title}}**'s table of contents ({{count}})\n",
    created:
      'Document created! ID: {{id}}, title: "{{title}}". You can archive it into a wiki ' +
      'directory afterwards (use the archive command of manage_wikis).',
    noFieldsToUpdate: 'No fields to update.',
    updated: 'Document [{{docId}}] "{{title}}" updated.',
    deleted: 'Document [{{docId}}] "{{title}}" permanently deleted.',
    unknownCommand:
      'Unknown command: {{command}}. Supported: search, toc, get, create, update, delete'
  },

  wikis: {
    listEmpty: 'No wikis have been created yet.',
    listHeader: '**Knowledge bases** ({{count}} total)\n',
    tagsLabel: 'Tags: {{tags}}',
    descriptionLabel: 'Description: {{summary}}',
    docCountLabel: 'Documents: {{count}}',
    notFound: 'Wiki {{wikiId}} not found.',
    wikiTagsLabel: 'Tags: {{tags}}',
    wikiDescriptionLabel: 'Description: {{summary}}',
    wikiHasImage: 'Has a cover image',
    docTotalLabel: 'Total documents: {{count}}',
    createdAtLabel: 'Created: {{createdAt}}',
    updatedAtLabel: 'Updated: {{updatedAt}}',
    directoryCount_one: '{{count}} directory',
    directoryCount_other: '{{count}} directories',
    directoriesHeader: "**{{title}}**'s directory tree ({{count}})\n",
    directoriesEmpty: 'Wiki "{{title}}" has no directories yet.',
    directoryDocCount: '({{count}} docs)',
    directoryEmpty: '(empty)',
    directoryDocsEmpty: 'This directory has no documents yet.',
    directoryDocsHeader: '**Directory documents** ({{count}} total)\n',
    docTagsLabel: 'Tags: {{tags}}',
    docDescriptionLabel: 'Description: {{summary}}',
    created: 'Wiki created! ID: {{id}}, title: "{{title}}"',
    noFieldsToUpdate: 'No fields to update.',
    updated: 'Wiki [{{wikiId}}] "{{title}}" updated.',
    deleted: 'Wiki [{{wikiId}}] "{{title}}" deleted.',
    parentNotFound:
      'The parent directory does not exist or does not belong to wiki [{{wikiId}}]; ' +
      'creation cancelled.',
    directoryCreated: 'Directory created! ID: {{id}}, name: "{{name}}", wiki: "{{wikiTitle}}"',
    directoryUpdated: 'Directory [{{directoryId}}] renamed to "{{name}}".',
    directoryDeleted: 'Directory [{{directoryId}}] deleted.',
    archivedDoc: '  Document [{{docId}}] archived',
    archiveFailedDoc: '  Document [{{docId}}] failed to archive (it may already be there)',
    archiveDone: 'Archive complete:\n{{results}}',
    docRemoved: 'Document [{{docId}}] removed from directory [{{directoryId}}].',
    removeFailed: 'Remove failed: document [{{docId}}] is not in directory [{{directoryId}}].',
    unknownCommand:
      'Unknown command: {{command}}. Supported: list, get, directories, docs, create, update, ' +
      'delete, create_directory, update_directory, delete_directory, archive, remove_doc'
  },

  graph: {
    searchHeader: '**Knowledge graph search "{{query}}"**\n',
    wikiLabel: '  Wiki [{{wikiId}}]:',
    aliasSuffix: ' (aliases: {{aliases}})',
    confidenceSuffix: ' (confidence {{percent}}%)',
    searchEmpty: 'No entities related to "{{query}}" were found in the knowledge graph.'
  }
}

export function getDocsToolTexts(): typeof zhCNDocsToolTexts {
  return getMainLanguage() === 'en-US' ? enUSDocsToolTexts : zhCNDocsToolTexts
}
