import { pluginUrl } from '@shared/plugin/protocol'

/**
 * **插件自带的样式表**（`plugin://<id>/plugin.css`）的注入与摘除。
 *
 * 为什么需要它（2026-09-26 用户实测：外部插件装进来后界面「内容都变形了」）：
 * 宿主自己的 Tailwind 是在**构建期**扫描源码生成 CSS 的，它只覆盖 `src/plugins/**`
 * （随应用分发的内置插件）。运行期才装进 `userData/plugins/<id>/` 的外部插件，
 * 源码不在宿主的扫描范围里——实测 task-planner / music-player 用到的 124 个类名里有
 * 49 个（39% / 18%）在宿主产物 CSS 里没有任何规则，`w-[280px]` / `grid-cols-2` /
 * `bottom-full` / `hover:scale-105` 这类布局关键类全缺，于是布局塌掉。
 *
 * 所以约定：**插件包自带一份编译好的 `plugin.css`**（插件仓库的构建脚本用 Tailwind
 * 扫自己的源码生成），宿主在装载插件时把它注入 `<head>`，停用/卸载时摘掉。
 * 插件因此不依赖宿主的扫描范围，第三方插件也能自洽。
 *
 * 细节：
 * - 用 `fetch` + 内联 `<style>`（CSP 里 `style-src 'self' 'unsafe-inline'` 允许），
 *   而不是 `<link rel="stylesheet" href="plugin://...">`（那要求 `style-src plugin:`）；
 * - 包里没有 `plugin.css` 时**静默跳过**（旧包、或纯 JS 样式的插件），只留一条 debug 日志；
 * - 同一个 id 重复注入时先移除旧的（幂等），停用后 `document` 里不留痕迹。
 */

const STYLE_ATTR = 'data-plugin-css'

/** 取该插件已注入的样式节点 */
function existingStyle(id: string): HTMLStyleElement | null {
  return document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}="${id}"]`)
}

/**
 * 注入插件样式（没有 plugin.css 就什么都不做）。
 *
 * 失败不抛：样式缺失只该表现为「界面不好看」，不该让插件装载失败（也就不会白屏）。
 */
export async function installPluginCss(id: string): Promise<boolean> {
  removePluginCss(id)
  try {
    const res = await fetch(pluginUrl(id, 'plugin.css'))
    if (!res.ok) {
      console.debug(`[plugin:${id}] 没有 plugin.css（HTTP ${res.status}），跳过样式注入`)
      return false
    }
    const css = await res.text()
    if (css.trim() === '') return false
    const style = document.createElement('style')
    style.setAttribute(STYLE_ATTR, id)
    style.textContent = css
    document.head.appendChild(style)
    console.info(`[plugin:${id}] 已注入插件样式 plugin.css（${(css.length / 1024).toFixed(1)}KB）`)
    return true
  } catch (err) {
    console.warn(`[plugin:${id}] 注入 plugin.css 失败（忽略，不影响插件功能）:`, err)
    return false
  }
}

/** 摘除插件样式（停用/卸载；幂等） */
export function removePluginCss(id: string): void {
  existingStyle(id)?.remove()
}
