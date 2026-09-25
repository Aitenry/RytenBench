/**
 * 外部插件主进程入口（CJS）：注册 plugin:<插件命名空间>: 前缀的 IPC 通道。
 *
 * install(ctx) 的逆操作由宿主统一执行：ctx.effect 登记的效果按 LIFO 回滚，
 * ctx.registerIpc 注册的通道在停用/卸载时一并摘除。
 *
 * 命名空间 = 插件 id 去掉开头的 `plugin.` 段：本插件 id 为 `plugin.demo` → `plugin:demo:*`。
 */
module.exports = {
  install(ctx) {
    ctx.registerIpc({
      'plugin:demo:ping': () => 'pong'
    })
  }
}
