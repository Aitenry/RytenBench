/* 「planner」模块词条：计划视图（工具栏 / 任务树 / 列表 / 甘特图 / 任务弹窗）。
   命名约定：t('planner.<group>.<key>')，键名一律 camelCase，不写中文。
   说明：甘特图时间轴日期交给 dayjs 本地化，格式串本身随语言取 gantt.axisDateFormat。 */
export const zhCNPlanner = {
  toolbar: {
    listView: '列表视图',
    ganttView: '甘特图视图',
    newProject: '新建项目'
  },
  gantt: {
    /* dayjs 格式串：中文用「1月5」这种紧凑写法，英文用 Jan 5 */
    axisDateFormat: 'M月D'
  },
  type: {
    project: '项目',
    phase: '阶段',
    task: '任务'
  },
  action: {
    addChild: '添加子任务',
    createFirstProject: '创建第一个项目'
  },
  empty: {
    noProjects: '暂无项目'
  },
  confirm: {
    deleteTitle: '删除任务',
    deleteWithChildren: '确定删除「{{name}}」及其所有子任务吗？'
  },
  modal: {
    newProjectTitle: '新建项目',
    editTitle: '编辑任务',
    nameLabel: '名称',
    namePlaceholder: '输入名称',
    typeLabel: '类型',
    progressLabel: '进度 ({{progress}}%)',
    workHoursLabel: '工时',
    priorityLabel: '优先级',
    priorityPlaceholder: '请选择优先级',
    dateRangeLabel: '时间范围',
    startTimePlaceholder: '开始时间',
    endTimePlaceholder: '结束时间'
  },
  validation: {
    nameRequired: '名称不能为空。',
    typeRequired: '类型不能为空。',
    workHoursRequired: '工时不能为空或为 0。',
    priorityRequired: '优先级不能为空。',
    dateRangeRequired: '时间范围不能为空。',
    workHoursExceeded: '时间范围跨越 {{days}} 天，工时最大仅允许 {{maxHours}} 小时',
    startBeforeParent: '开始日期不能早于父级开始日期（{{date}}）',
    endAfterParent: '结束日期不能晚于父级结束日期（{{date}}）',
    phaseHoursBelowChildren:
      '阶段总工时（{{workHours}}h）不能小于其下所有任务工时之和（{{childHours}}h）',
    projectHoursBelowPhases:
      '项目总工时（{{workHours}}h）不能小于其下所有阶段工时之和（{{phaseHours}}h）',
    exceedPhaseHours: '该阶段下所有任务工时之和（{{total}}h）将超过阶段总工时（{{parentHours}}h）',
    exceedProjectHours:
      '该项目下所有阶段工时之和（{{total}}h）将超过项目总工时（{{parentHours}}h）',
    childOutOfRange: '子任务「{{title}}」（{{date}}）超出新的时间范围，无法保存'
  },
  tree: {
    colName: '任务名称',
    colWorkHours: '工时'
  },
  list: {
    colName: '任务名称',
    colType: '类型',
    colProgress: '进度',
    colWorkHours: '工时',
    colPriority: '优先级',
    colDate: '日期',
    colDependency: '依赖',
    dependencyTooltip_one: '依赖 {{count}} 个任务',
    dependencyTooltip_other: '依赖 {{count}} 个任务'
  }
}
