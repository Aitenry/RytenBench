/* 设置模块（弹窗外壳 + 通用设置页）词条。 */
export const zhCNSettings = {
  title: '设置',
  nav: {
    groupGeneral: '常规',
    groupAssistant: '助手',
    general: '通用',
    model: '模型',
    music: '音乐',
    graph: '图谱',
    system: '系统',
    agents: '智能体',
    skills: '技能',
    memory: '记忆',
    plugins: '插件'
  },
  plugins: {
    pageTitle: '插件管理',
    pageDescription: '卸载/安装插件，或临时停用某项功能',
    listTitle: '已安装插件',
    listDescription: '停用后对应功能会立即从应用移除，重新启用即时恢复',
    builtinBadge: '内置',
    externalBadge: '第三方',
    switchFail: '插件状态切换失败',
    install: '安装第三方插件',
    reinstall: '安装',
    reinstallDone: '插件已重新安装',
    uninstall: '卸载',
    installFail: '插件安装失败',
    uninstallFail: '插件卸载失败',
    uninstallDone: '插件已卸载',
    uninstallConfirmTitle: '卸载「{{name}}」',
    uninstallConfirmContent:
      '卸载会删除该插件的全部数据（例如音乐曲库记录与应用托管的歌单目录），此操作不可撤销。' +
      '若想保留数据，请选择「取消」并改用停用开关。',
    uninstallPurgeOk: '不保留数据并卸载',
    availableTitle: '可安装的内置插件',
    availableDescription: '随应用分发，卸载后可随时装回来'
  },
  general: {
    pageTitle: '通用设置',
    pageDescription: '管理应用的界面语言、主题与安全配置',
    language: {
      sectionTitle: '界面语言',
      sectionDescription: '切换后立即生效，无需重启应用',
      rowTitle: '显示语言',
      rowDescription: '简体中文 / English'
    },
    theme: {
      sectionTitle: '主题模式',
      sectionDescription: '自动模式下，6:00 ~ 18:00 为亮色主题，其余时间为暗色主题',
      rowTitle: '外观',
      rowDescription: '亮色 / 暗色 / 跟随时间段自动切换',
      light: '亮色',
      dark: '暗色',
      auto: '自动'
    },
    tray: {
      sectionTitle: '系统托盘',
      sectionDescription: '关闭窗口时的后台驻留行为',
      rowTitle: '关闭到系统托盘',
      rowDescription:
        '开启后关闭窗口将隐藏到系统托盘继续运行，可随时从托盘图标恢复或退出；关闭后关闭窗口将直接退出应用'
    },
    lock: {
      sectionTitle: '锁屏设置',
      enableTitle: '启用锁屏',
      enableDescription: '关闭后锁屏功能将失效',
      passwordTitle: '锁屏密码',
      passwordDescription: '6 位纯数字密码，修改后旧密码将失效',
      changePassword: '修改密码'
    },
    passwordModal: {
      title: '修改锁屏密码',
      oldPassword: '原密码',
      newPassword: '新密码',
      confirmPassword: '确认新密码',
      oldPasswordRequired: '请输入原密码',
      newPasswordRequired: '请输入新密码',
      confirmPasswordRequired: '请再次输入新密码',
      sixDigits: '密码必须为 6 位纯数字',
      mismatch: '两次输入的密码不一致',
      wrongOldPassword: '原密码错误'
    }
  }
}
