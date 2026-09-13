import type { zhCNMusicSettings } from '../zh-CN/musicSettings'

export const enUSMusicSettings: typeof zhCNMusicSettings = {
  pageTitle: 'Music',
  pageDescription: 'Set the music root folder; its subfolders are loaded as playlists',
  sectionTitle: 'Music storage folder',
  sectionDescription: 'Subfolders are automatically detected as playlists once set',
  placeholder: 'Not set',
  browse: 'Browse…',
  saved: 'Music folder saved',
  cleared: 'Music folder cleared',
  selectFailed: 'Failed to select the folder: {{reason}}',
  current: 'Currently in use: {{path}}'
}
