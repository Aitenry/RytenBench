import type { zhCNSkillsSettings } from '../zh-CN/skillsSettings'

export const enUSSkillsSettings: typeof zhCNSkillsSettings = {
  pageTitle: 'Skills',
  pageDescription:
    'Configure the global Skills storage directory. Each subfolder is loaded as a separate Skill, and you can enable or disable Skills individually. Leave it empty to disable Skills.',
  dirSectionTitle: 'Skills storage directory',
  dirSectionDescription: 'Every subdirectory containing a SKILL.md file counts as one Skill',
  dirPlaceholder: 'e.g. D:\\skills (leave empty to disable)',
  dirCurrent: 'Currently active: {{path}}',
  listTitle: 'Discovered skills ({{count}})',
  listTitle_one: 'Discovered skill ({{count}})',
  listTitle_other: 'Discovered skills ({{count}})',
  emptyDescription:
    'No Skills found in this directory. Make sure each subdirectory contains a {{filename}} file.',
  savedDir: 'Skills directory saved',
  clearedDir: 'Skills directory cleared'
}
