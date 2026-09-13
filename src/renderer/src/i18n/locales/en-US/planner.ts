import type { zhCNPlanner } from '../zh-CN/planner'

export const enUSPlanner: typeof zhCNPlanner = {
  toolbar: {
    listView: 'List view',
    ganttView: 'Gantt view',
    newProject: 'New project'
  },
  gantt: {
    axisDateFormat: 'MMM D'
  },
  type: {
    project: 'Project',
    phase: 'Phase',
    task: 'Task'
  },
  action: {
    addChild: 'Add subtask',
    createFirstProject: 'Create your first project'
  },
  empty: {
    noProjects: 'No projects yet'
  },
  confirm: {
    deleteTitle: 'Delete task',
    deleteWithChildren: 'Delete "{{name}}" and all its subtasks?'
  },
  modal: {
    newProjectTitle: 'New project',
    editTitle: 'Edit task',
    nameLabel: 'Name',
    namePlaceholder: 'Enter a name',
    typeLabel: 'Type',
    progressLabel: 'Progress ({{progress}}%)',
    workHoursLabel: 'Work hours',
    priorityLabel: 'Priority',
    priorityPlaceholder: 'Select a priority',
    dateRangeLabel: 'Date range',
    startTimePlaceholder: 'Start time',
    endTimePlaceholder: 'End time'
  },
  validation: {
    nameRequired: 'Name cannot be empty.',
    typeRequired: 'Type cannot be empty.',
    workHoursRequired: 'Work hours cannot be empty or 0.',
    priorityRequired: 'Priority cannot be empty.',
    dateRangeRequired: 'Date range cannot be empty.',
    workHoursExceeded: 'Date range spans {{days}} days; work hours are capped at {{maxHours}}',
    startBeforeParent: 'Start date cannot be earlier than the parent start date ({{date}})',
    endAfterParent: 'End date cannot be later than the parent end date ({{date}})',
    phaseHoursBelowChildren:
      'Phase hours ({{workHours}}h) cannot be less than the total hours of its tasks ({{childHours}}h)',
    projectHoursBelowPhases:
      'Project hours ({{workHours}}h) cannot be less than the total hours of its phases ({{phaseHours}}h)',
    exceedPhaseHours:
      'Total hours of all tasks under this phase ({{total}}h) would exceed the phase hours ({{parentHours}}h)',
    exceedProjectHours:
      'Total hours of all phases under this project ({{total}}h) would exceed the project hours ({{parentHours}}h)',
    childOutOfRange:
      'Subtask "{{title}}" ({{date}}) is outside the new date range and cannot be saved'
  },
  tree: {
    colName: 'Task name',
    colWorkHours: 'Work hours'
  },
  list: {
    colName: 'Task name',
    colType: 'Type',
    colProgress: 'Progress',
    colWorkHours: 'Work hours',
    colPriority: 'Priority',
    colDate: 'Date',
    colDependency: 'Dependencies',
    dependencyTooltip_one: 'Depends on {{count}} task',
    dependencyTooltip_other: 'Depends on {{count}} tasks'
  }
}
