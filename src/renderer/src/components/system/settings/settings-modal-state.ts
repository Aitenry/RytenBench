import type { SettingsScope } from './SettingsModal'

/**
 * 设置弹窗的开合状态（模块级可订阅快照）。
 *
 * 为什么不放在 `CustomFrame` 的 useState 里：插件自己的 Provider 随插件装卸
 * （`ctx.use('appProvider')`），而 Provider 增删会让 `PluginProvidersShell` 之下的整棵
 * 外壳子树重挂（React 的类型调和语义，见 App.tsx 里 PluginProvidersShell 的注释）。
 * 状态留在组件里时，停用任意注册了 Provider 的插件（music / harness）都会把用户
 * 正在看的设置弹窗直接关掉——工装 verify-plugin-host 的「当前设置页所属插件被停用时
 * 回退到可用页签」断言的正是这个行为。
 *
 * 外置到模块级后：插件启停不再打断设置页；页签本身的回退（当前页所属插件被停用 →
 * 落到首个可用页签）仍由 SettingsModal 按注册表自行处理。
 */
export interface SettingsModalState {
  open: boolean
  /** 打开时希望聚焦的页签（undefined = 首个可用页签） */
  tab: string | undefined
  scope: SettingsScope
}

let state: SettingsModalState = { open: false, tab: undefined, scope: 'full' }
const listeners = new Set<() => void>()

export function getSettingsModalState(): SettingsModalState {
  return state
}

export function subscribeSettingsModalState(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function publish(patch: Partial<SettingsModalState>): void {
  state = { ...state, ...patch }
  for (const onChange of [...listeners]) {
    try {
      onChange()
    } catch (err) {
      console.error('[settings] 弹窗状态订阅回调异常:', err)
    }
  }
}

/** 打开设置弹窗（tab 缺省 = 首个可用页签；scope='assistant' = 只显示助手相关页） */
export function openSettingsModal(tab?: string, scope: SettingsScope = 'full'): void {
  publish({ open: true, tab, scope })
}

export function closeSettingsModal(): void {
  publish({ open: false })
}
