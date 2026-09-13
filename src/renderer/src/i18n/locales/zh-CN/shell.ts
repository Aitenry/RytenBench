/* 应用外壳（主窗口框架、路由骨架、构建进度通知）词条。
   注意 errorBoundary.eyebrow 与 routing.loading 是**等宽全大写的装饰性标签**，
   按项目字体规则（等宽只给拉丁与数字）两种语言都保持拉丁大写，不译中文——
   中文落进等宽族会回退成宋体，和页面其它中文不是一套字。 */
export const zhCNShell = {
  menu: {
    home: '首页',
    planner: '计划',
    music: '音乐',
    harness: '助手'
  },
  titleBar: {
    minimize: '最小化',
    maximize: '最大化',
    restore: '还原',
    close: '关闭'
  },
  rightBar: {
    messages: '消息',
    settings: '设置'
  },
  unlock: {
    title: '系统已锁屏',
    prompt: '请输入密码解锁',
    hint: '输入 6 位数字解锁',
    success: '解锁成功',
    failed: '解锁密码错误',
    verifyFailed: '解锁验证失败'
  },
  errorBoundary: {
    eyebrow: 'RUNTIME ERROR',
    title: '界面渲染时发生了一个未预期的错误',
    reload: '重新加载'
  },
  notificationList: {
    empty: '暂无消息',
    completed: '已完成'
  },
  miniPlayer: {
    idle: '未在播放'
  },
  bottomBar: {
    music: '音乐',
    weather: '天气',
    refreshWeather: '刷新天气',
    weatherUnavailable: '暂无天气数据',
    apparentTemp: '体感 {{temp}}°C',
    humidity: '湿度 {{percent}}%',
    windSpeed: '风速 {{speed}}km/h'
  },
  routing: {
    loading: 'LOADING'
  },
  build: {
    initializing: '初始化',
    initializingMessage: '初始化...',
    unknownWiki: '知识库 #{{id}}',
    progressSummary: '{{phase}} {{percent}}% — {{message}}',
    completedSummary: '{{entityCount}} 实体, {{relationCount}} 关系',
    completedSummary_one: '{{entityCount}} 实体, {{relationCount}} 关系',
    completedSummary_other: '{{entityCount}} 实体, {{relationCount}} 关系'
  }
}
