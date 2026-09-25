/**
 * music 插件词条（简体中文 = 源语言）。
 *
 * 顶层键与原中央词条保持**完全一致**（`music` 播放器界面 / `musicSettings` 设置页），
 * 只是从 `src/renderer/src/i18n/locales/` 搬到了插件目录：插件停用即不再注册这些键。
 */
export const musicZhCN = {
  /* 「音乐」播放器界面词条。 */
  music: {
    playlist: {
      sectionTitle: '歌单',
      createTooltip: '新建歌单',
      createTitle: '新建歌单',
      editTitle: '编辑歌单',
      deleteTitle: '删除歌单',
      deleteConfirm: '确定要删除此歌单吗？',
      nameLabel: '歌单名称',
      namePlaceholder: '输入歌单名称',
      descriptionLabel: '描述',
      descriptionPlaceholder: '歌单描述（可选）',
      menuAddTracks: '添加歌曲',
      menuEdit: '编辑歌单',
      menuDelete: '删除歌单',
      empty: '点击右上角 + 创建歌单',
      unnamed: '未选择歌单',
      noDescription: '暂无描述',
      trackCount_one: '共 <mono>{{count}}</mono> 项',
      trackCount_other: '共 <mono>{{count}}</mono> 项',
      recentlyPlayedName: '最近播放',
      recentlyPlayedDescription: '最近播放过的歌曲',
      likedName: '我喜欢',
      likedDescription: '收藏的歌曲',
      likedDescriptionSelected: '你收藏的歌曲',
      created: '歌单已创建',
      updated: '歌单已更新',
      loadTracksFailed: '加载曲目失败',
      coverUpdated: '封面已更新',
      coverChange: '更换封面',
      coverAdd: '添加封面',
      addedCount_one: '已添加 <mono>{{count}}</mono> 首歌曲',
      addedCount_other: '已添加 <mono>{{count}}</mono> 首歌曲',
      skippedCount_one: '，<mono>{{count}}</mono> 首已存在被跳过',
      skippedCount_other: '，<mono>{{count}}</mono> 首已存在被跳过'
    },
    player: {
      notPlaying: '未播放',
      playTooltip: '播放',
      pauseTooltip: '暂停',
      likeTooltip: '喜欢',
      prevTooltip: '上一曲',
      nextTooltip: '下一曲',
      playlistTooltip: '播放列表',
      addToPlaylistTooltip: '添加到歌单',
      lyricsTooltip: '歌词',
      /* 按钮里的徽标：36px 圆钮放不下整词，用极短标记，完整词走 tooltip/aria-label */
      lyricsBadge: '词',
      volumeTooltip: '音量',
      volumeLabel: '音量调节',
      moreTooltip: '更多',
      lossless: '无损',
      repeatAll: '列表循环',
      repeatOne: '单曲循环',
      repeatShuffle: '随机播放'
    },
    track: {
      columnTitle: '标题',
      columnArtist: '艺术家',
      columnAlbum: '专辑',
      columnDuration: '时长',
      editTitle: '编辑歌曲信息',
      editSuccess: '歌曲信息已更新',
      unliked: '已取消收藏',
      empty: '暂无音乐',
      emptyHint: '选择歌单后开始播放',
      tableEmpty: '暂无曲目'
    }
  },
  /* 音乐设置页词条。 */
  musicSettings: {
    pageTitle: '音乐设置',
    pageDescription: '设置音乐文件根目录，子文件夹将作为歌单加载',
    sectionTitle: '音乐存储目录',
    sectionDescription: '设置后子文件夹将自动作为歌单识别',
    placeholder: '未设置',
    browse: '浏览…',
    saved: '音乐目录已保存',
    cleared: '已清空音乐目录',
    selectFailed: '选择目录失败: {{reason}}',
    current: '当前已生效：{{path}}'
  }
}
