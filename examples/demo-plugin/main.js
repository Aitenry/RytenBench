/**
 * 外部插件主进程入口（CJS）：注册 plugin:<id>: 前缀的 IPC 通道。
 * install(ctx) 返回 dispose（宿主卸载时执行）。
 */
module.exports = {
  install(ctx) {
    return ctx.registerIpc(['plugin:demo:ping'], {
      'plugin:demo:ping': () => 'pong'
    })
  }
}