import type { PluginManifest } from './types'

/**
 * 内置插件目录（只含静态元数据，三端共用）：
 * - 主进程：plugins-list 的启用态合并来源（内置默认启用）；
 * - 渲染层：plugin.tsx 的 manifest 与之一致（含 inject/routes/menu 等运行时扩展）。
 */
export const BUILTIN_PLUGIN_CATALOG: PluginManifest[] = [
  {
    id: 'home',
    name: '首页',
    version: '0.1.0',
    description: '文档树、待办、Wiki 与知识图谱首页',
    builtin: true
  },
  {
    id: 'planner',
    name: '任务规划',
    version: '0.1.0',
    description: '任务树、甘特图与列表视图',
    builtin: true
  },
  {
    id: 'music',
    name: '音乐播放器',
    version: '0.1.0',
    description: '本地音乐播放器：歌单、播放控制与迷你播放器',
    builtin: true
  },
  {
    id: 'harness',
    name: 'AI 助手',
    version: '0.1.0',
    description: 'AI Agent 工作台：话题、流式对话、代码编辑、文件差异与子代理',
    builtin: true
  }
]
