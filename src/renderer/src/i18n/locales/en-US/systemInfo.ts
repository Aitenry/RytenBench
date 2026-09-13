import type { zhCNSystemInfo } from '../zh-CN/systemInfo'

export const enUSSystemInfo: typeof zhCNSystemInfo = {
  pageTitle: 'System info',
  pageDescription: 'Runtime environment of the current system',
  sectionTitle: 'Runtime environment',
  ipTitle: 'Local IP',
  locationTitle: 'Location',
  ispTitle: 'ISP',
  encryptionTitle: 'API key encryption',
  encryptionValue: 'AES-256-GCM (machine-unique key)',
  unavailable: 'Unavailable'
}
