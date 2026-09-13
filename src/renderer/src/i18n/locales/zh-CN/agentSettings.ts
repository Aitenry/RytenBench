/* 智能体设置页词条（由智能体设置页负责填充）。
   命名约定：t('agentSettings.<group>.<key>')，键名一律 camelCase，不写中文。 */
export const zhCNAgentSettings = {
  pageTitle: '智能体',
  pageDescription: '配置主智能体的默认工具与技能，以及可委托任务的子智能体',
  sections: {
    mainAgent: '主智能体',
    subagents: '子智能体'
  },
  main: {
    defaultTools: '默认工具',
    defaultToolsDescription: '选择主智能体可用的系统工具',
    defaultToolsPlaceholder: '选择工具',
    defaultSkills: '默认技能',
    defaultSkillsDescription: '选择主智能体可用的技能',
    defaultSkillsPlaceholder: '选择技能（不选则无技能）',
    saved: '主智能体已保存'
  },
  list: {
    description_one: '共 {{count}} 个，只有开启的智能体才会在对话中生效',
    description_other: '共 {{count}} 个，只有开启的智能体才会在对话中生效',
    newAgent: '新建',
    toolCount_one: '{{count}} 工具',
    toolCount_other: '{{count}} 工具',
    skillCount_one: '{{count}} 技能',
    skillCount_other: '{{count}} 技能'
  },
  form: {
    createTitle: '新建智能体',
    editTitle: '编辑智能体: {{name}}',
    chineseName: '中文名称',
    chineseNamePlaceholder: '如 研究代理（可选）',
    identifier: '英文标识名',
    identifierPlaceholder: '如 research-agent',
    identifierRequired: '请输入英文标识名',
    identifierPattern: '只能包含小写字母、数字和连字符',
    enabled: '启用',
    description: '功能描述',
    descriptionPlaceholder: '描述智能体的功能，主智能体据此决定何时委托任务',
    descriptionRequired: '请输入功能描述',
    systemPrompt: '系统提示词',
    systemPromptPlaceholder: '智能体的系统角色和行为规范',
    systemPromptRequired: '请输入系统提示词',
    tools: '可用工具',
    toolsPlaceholder: '选择智能体可用的系统工具（不选则无工具）',
    model: '模型（可选）',
    modelTooltip: '覆盖主智能体的模型，留空则使用主智能体模型。仅显示非 Embedding 模型',
    modelPlaceholder: '使用主智能体默认模型',
    skills: '技能（可选）',
    skillsTooltip: '从已加载的技能目录中选择智能体可用的技能',
    skillsPlaceholder: '选择智能体可用的技能（不选则无技能）',
    skillsNotConfigured: '未找到技能，请先在技能设置中配置目录',
    skillsNoMatch: '无匹配技能'
  },
  messages: {
    agentUpdated: '智能体已更新',
    agentCreated: '智能体已创建',
    opened: '已开启',
    closed: '已关闭',
    toggleFailedWithReason: '切换失败: {{reason}}',
    deleted: '已删除',
    deleteConfirmTitle: '确认删除智能体"{{name}}"？',
    importEmptyFile: '文件内容为空',
    importInvalidJson: 'JSON 格式错误，请检查',
    importNotArray: 'JSON 内容必须是一个数组',
    importEmptyContent: '导入内容为空',
    importFailedWithReason: '导入过程出错: {{reason}}',
    importStrippedSkippedName: '(缺少 name)',
    importMissingTool: '{{name}}: 工具 [{{items}}] 不存在，已移除',
    importMissingSkill: '{{name}}: 技能 [{{items}}] 不存在，已移除',
    importMissingModel: '{{name}}: 模型 "{{model}}" 不存在，已移除',
    importSummaryImported_one: '成功导入 {{count}} 个智能体',
    importSummaryImported_other: '成功导入 {{count}} 个智能体',
    importSummarySkipped_one: '{{count}} 个被跳过',
    importSummarySkipped_other: '{{count}} 个被跳过',
    importSummaryNone: '未导入任何智能体',
    importSummarySeparator: '，',
    importStrippedTitle: '以下字段已自动剔除不存在的项',
    readFileFailed: '读取文件失败'
  },
  empty: {
    noAgents: '暂无智能体，点击右上角「新建」创建'
  }
}
