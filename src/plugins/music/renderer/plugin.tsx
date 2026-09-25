import { RiDiscLine, RiMusicLine } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import manifest from '../manifest'
import { musicLocales } from '../locales'
import { AudioProvider } from './audio/context'
import { getCurrentTrack, subscribeCurrentTrack } from './audio/store'
import MusicBottomTab from './components/MusicBottomTab'
import MusicMiniPlayer from './components/MusicMiniPlayer'
import MusicSettings from './settings/MusicSettings'

/**
 * music 插件（渲染层入口）。
 *
 * 注册点：route（懒加载视图 + 骨架屏）、menu（侧栏）、settingsSection（音乐设置页）、
 * appProvider（播放器状态，随插件装卸，core 的 App.tsx 不再挂 AudioProvider）、
 * bottomBar（底栏音乐条目插槽——外壳不 import 本插件任何模块）、i18n（词条随插件注册）。
 * 停用后：路由/菜单/设置页/底栏条目/播放器状态/词条全部即时消失（可逆效果回滚）。
 */
const plugin: Plugin = {
  // id/name/version/description 的单一真源在 ../manifest.ts（主进程 plugins-list 同源）
  manifest,
  install(ctx) {
    ctx.use('route').register({
      path: '/music',
      skeleton: 'music',
      load: () => import('./Index')
    })
    ctx.use('menu').register({
      key: 'music',
      labelKey: 'shell.menu.music',
      icon: <RiDiscLine size={16} />,
      order: 30
    })
    ctx.use('settingsSection').register({
      tabKey: 'music',
      labelKey: 'settings.nav.music',
      icon: <RiMusicLine size={16} />,
      group: 'general',
      order: 30,
      Component: MusicSettings
    })
    // 播放器状态随插件注册：Provider 增删即「插件启用/停用」的重构
    ctx.use('appProvider').register({ Provider: AudioProvider, order: 20 })
    // 底栏插槽：条目出现与否由 isVisible() 决定（有当前曲目才参与轮播），
    // 可见性变化经 subscribe 通知宿主重渲染
    ctx.use('bottomBar').register({
      id: 'music',
      order: 10,
      isVisible: () => Boolean(getCurrentTrack()),
      subscribe: subscribeCurrentTrack,
      Tab: MusicBottomTab,
      Popup: MusicMiniPlayer
    })
    // 词条随插件注册：停用即不再注册这些键（原先由中央 locales 无条件打包）
    ctx.use('i18n').addResources('translation', musicLocales)
  }
}

export default plugin
