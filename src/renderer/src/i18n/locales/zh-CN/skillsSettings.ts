/* 技能设置页词条（由技能设置页负责填充）。 */
export const zhCNSkillsSettings = {
  pageTitle: '技能（Skills）',
  pageDescription:
    '配置全局技能存储目录，子文件夹将作为独立技能加载；可单独启停每个技能。留空则不启用。',
  dirSectionTitle: '技能存储目录',
  dirSectionDescription: '每个含 SKILL.md 的子目录即为一个技能',
  dirPlaceholder: '例如：D:\\skills（留空不启用）',
  dirCurrent: '当前已生效：{{path}}',
  listTitle: '已发现的技能（{{count}}）',
  listTitle_one: '已发现的技能（{{count}}）',
  listTitle_other: '已发现的技能（{{count}}）',
  emptyDescription: '此目录中未发现任何技能，请确保子目录中包含 {{filename}} 文件',
  savedDir: '技能目录已保存',
  clearedDir: '已清空技能目录'
}
