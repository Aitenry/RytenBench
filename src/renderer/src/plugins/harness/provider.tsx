import type { AppProviderRegistration } from '@renderer/plugin-host/types'
import { HarnessProvider } from './contexts/HarnessContext'

/**
 * harness 的 appProvider 注册载荷：
 * 把 HarnessProvider 从 App.tsx 静态组合中抽离，改由插件安装时动态挂到 Provider 层。
 * 停用 harness 后该 Provider 立即从组合树中摘除。
 *
 * 注：HarnessContext 本体随视图迁移（M4），此处为迁移期的再导出。
 */
export const harnessAppProvider: Omit<AppProviderRegistration, 'pluginId'> = {
  Provider: HarnessProvider,
  order: 0
}
