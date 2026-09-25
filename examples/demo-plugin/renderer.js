/**
 * 外部插件渲染入口（自包含 ESM bundle；react/antd/图标经 externalize 后运行时取宿主实例）。
 * 最小示例：注册菜单 + 路由页面，页面按钮经 ctx.use('api').invoke 调主进程 ping。
 */
export default function install(ctx) {
  const React = ctx.require('react')
  const { useState } = React
  const Icons = ctx.require('@remixicon/react')

  // 注册本插件命名空间的文案（宿主导航按当前语言求值）
  ctx.use('i18n').addResources('translation', {
    'zh-CN': {
      demo: {
        menu: { title: '示例插件' },
        page: { title: '外部插件演示', ping: 'Ping 主进程', idle: '还未调用' }
      }
    },
    'en-US': {
      demo: {
        menu: { title: 'Demo' },
        page: { title: 'External Plugin Demo', ping: 'Ping main process', idle: 'Not invoked yet' }
      }
    }
  })

  const api = ctx.use('api')

  function DemoView() {
    const [result, setResult] = useState(null)
    return React.createElement(
      'div',
      { style: { padding: 28 } },
      React.createElement('h2', null, 'Demo Plugin'),
      React.createElement(
        'button',
        {
          onClick: () =>
            api
              .invoke('plugin:demo:ping')
              .then(setResult)
              .catch((e) => setResult(String(e)))
        },
        'Ping'
      ),
      React.createElement('div', { style: { marginTop: 12 } }, result ?? '(not invoked)')
    )
  }

  ctx.use('menu').register({
    key: 'demo',
    labelKey: 'demo.menu.title',
    icon: React.createElement(Icons.RiPlugLine, { size: 16 }),
    order: 50
  })
  ctx.use('route').register({
    path: '/demo',
    skeleton: 'generic',
    Component: DemoView
  })
}
