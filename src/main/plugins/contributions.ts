/**
 * 主进程插件**多值贡献点**注册表（core 侧，插件之间经宿主交换而不互相 import）。
 *
 * 语义：
 * - **多值**：同一个 key 可以由多个插件分别贡献（例如 `harness.tool` 由
 *   planner / home / music 各贡献自己的工具），同一个插件也可以贡献多项；
 * - **拉取（pull）**：注册表不通知、不派发。消费方（例如 harness 组装工具集时）
 *   在**需要的那一刻**调 `listContributions(key)` 取当前全部贡献，
 *   **顺序无关**——谁的 install 先跑都能拿到全部；
 * - **随插件停用移除**：贡献以 pluginId 记账，插件停用时宿主调
 *   `removeContributions(pluginId)` 一次性清掉自己的全部贡献；
 *   下一次拉取就看不到它了（消费方无需感知「插件没了」这件事）；
 * - **按插件装载顺序保存**：值是数组，同 key 内保持贡献先后（消费方若要稳定输出
 *   应自己按 name 排序，不要依赖装载顺序）。
 *
 * 与渲染层 `plugin-host` 的插槽是同一套思路（多值、可回滚），只是主进程侧
 * 目前只有「贡献 → 宿主消费」这一种关系，因此不做单值 provide/use。
 */

/** 一条已挂载的贡献：谁的、值是什么 */
interface ContributionEntry {
  pluginId: string
  value: unknown
}

/** key → 按装载顺序排列的贡献列表 */
const registry = new Map<string, ContributionEntry[]>()

/** 挂载一条贡献（同一插件同一 key 可多次调用，各自入列） */
export function addContribution(pluginId: string, key: string, value: unknown): void {
  const list = registry.get(key)
  if (list) list.push({ pluginId, value })
  else registry.set(key, [{ pluginId, value }])
}

/**
 * 摘除某插件的**全部**贡献（停用/卸载时调用；幂等）。
 * 空 key 的列表一并删掉，避免注册表里留下无人消费的空槽。
 */
export function removeContributions(pluginId: string): void {
  for (const [key, list] of [...registry]) {
    const kept = list.filter((entry) => entry.pluginId !== pluginId)
    if (kept.length === 0) registry.delete(key)
    else if (kept.length !== list.length) registry.set(key, kept)
  }
}

/**
 * 读取某贡献点的全部贡献（拉取语义：调用时的快照，之后插件启停不会改写已取出的数组）。
 * 未注册的 key 返回空数组，**不抛错**——「没人贡献」是正常状态。
 */
export function listContributions<T>(key: string): T[] {
  return (registry.get(key) ?? []).map((entry) => entry.value as T)
}

/** 当前注册表里的贡献点 key（仅供日志/诊断，不含值） */
export function contributionKeys(): string[] {
  return [...registry.keys()]
}
