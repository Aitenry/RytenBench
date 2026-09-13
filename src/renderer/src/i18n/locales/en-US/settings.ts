import type { zhCNSettings } from '../zh-CN/settings'

export const enUSSettings: typeof zhCNSettings = {
  title: 'Settings',
  nav: {
    groupGeneral: 'General',
    groupAssistant: 'Assistant',
    general: 'General',
    model: 'Models',
    music: 'Music',
    graph: 'Graph',
    system: 'System',
    agents: 'Agents',
    skills: 'Skills',
    memory: 'Memory'
  },
  general: {
    pageTitle: 'General',
    pageDescription: 'Manage the interface language, theme and security options',
    language: {
      sectionTitle: 'Interface language',
      sectionDescription: 'Takes effect immediately, no restart required',
      rowTitle: 'Display language',
      rowDescription: 'Simplified Chinese / English'
    },
    theme: {
      sectionTitle: 'Theme',
      sectionDescription: 'In auto mode the light theme runs from 6:00 to 18:00, dark otherwise',
      rowTitle: 'Appearance',
      rowDescription: 'Light / Dark / Switch automatically by time of day',
      light: 'Light',
      dark: 'Dark',
      auto: 'Auto'
    },
    tray: {
      sectionTitle: 'System tray',
      sectionDescription: 'What happens when the window is closed',
      rowTitle: 'Close to tray',
      rowDescription:
        'When enabled, closing the window keeps the app running in the system tray — restore or quit from the tray icon at any time. When disabled, closing the window exits the app.'
    },
    lock: {
      sectionTitle: 'Lock screen',
      enableTitle: 'Enable lock screen',
      enableDescription: 'Turning this off disables the lock screen entirely',
      passwordTitle: 'Lock screen passcode',
      passwordDescription: 'A 6-digit numeric passcode; changing it invalidates the old one',
      changePassword: 'Change passcode'
    },
    passwordModal: {
      title: 'Change lock screen passcode',
      oldPassword: 'Current passcode',
      newPassword: 'New passcode',
      confirmPassword: 'Confirm new passcode',
      oldPasswordRequired: 'Please enter the current passcode',
      newPasswordRequired: 'Please enter a new passcode',
      confirmPasswordRequired: 'Please enter the new passcode again',
      sixDigits: 'The passcode must be exactly 6 digits',
      mismatch: 'The two passcodes do not match',
      wrongOldPassword: 'The current passcode is incorrect'
    }
  }
}
