import { RiDiscLine, RiMusicLine } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import MusicSettings from './settings/MusicSettings'
import MusicMiniPlayer from './components/MusicMiniPlayer'

/**
 * music 插件：本地音乐播放器视图。
 * 注册点：route（懒加载视图 + 骨架屏）、menu（侧栏）、
 * settingsSection（音乐设置页）、globalComponent（底部栏迷你播放器）。
 * 停用后：路由/菜单/音乐设置页/迷你播放器全部即时消失（可逆效果回滚）。
 */
const plugin: Plugin = {
  manifest: {
    id: 'music',
    name: '音乐播放器',
    version: '0.1.0',
    description: '本地音乐播放器：歌单、播放控制与迷你播放器',
    builtin: true,
    inject: ['route', 'menu', 'settingsSection', 'globalComponent'],
    routes: [{ path: '/music', skeleton: 'music' }],
    menu: { key: 'music', labelKey: 'shell.menu.music', icon: 'RiDiscLine', order: 30 }
  },
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
    ctx.use('globalComponent').register({
      id: 'music-mini-player',
      slot: 'bottomBar',
      Component: MusicMiniPlayer
    })
  }
}

export default plugin
