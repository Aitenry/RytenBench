import * as crypto from 'crypto'
import * as os from 'os'
import { app } from 'electron'
import logger from 'electron-log'
import _Store from 'electron-store'

const Store = _Store['default'] || _Store
const keystore = new Store({ name: 'provider-keystore' })

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const PBKDF2_ITERATIONS = 600000
const KEY_LENGTH = 32 // 256 bits
const SALT = 'ryten-bench-provider-salt-v1' // 固定盐值，与机器属性混合

/**
 * 机器密钥缓存：单次会话内 hostname / username / userData 不会变化，
 * 60 万次迭代的 PBKDF2 只派生一次（约 200~500ms，同步阻塞主进程）。
 * 此前每加解密一个 API Key 都重新派生，批量场景（如 29 个模型逐行解密）
 * 会累计阻塞数秒，导致模型设置树加载卡死。
 */
let cachedMachineKey: Buffer | null = null

/**
 * 从当前机器属性派生加密密钥
 * 基于 hostname + username + userData 路径组合，每台电脑唯一
 */
function deriveMachineKey(): Buffer {
  if (cachedMachineKey) return cachedMachineKey
  const hostname = os.hostname()
  const username = os.userInfo().username
  const userDataPath = app.getPath('userData')

  // 组合机器唯一标识
  const machineFingerprint = `${hostname}:${username}:${userDataPath}`

  cachedMachineKey = crypto.pbkdf2Sync(
    machineFingerprint,
    SALT,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha512'
  )
  return cachedMachineKey
}

/**
 * 验证机器密钥是否与存储中的验证令牌一致
 * 用于检测机器环境变化（如系统重装、用户名变更）
 */
function verifyMachineKey(): boolean {
  const storedToken = keystore.get('key_verification_token') as string | undefined
  if (!storedToken) return true

  const currentKey = deriveMachineKey()
  const currentToken = crypto.createHash('sha256').update(currentKey).digest('hex')

  return currentToken === storedToken
}

/**
 * 初始化加密模块：生成验证令牌（首次运行或验证失败时重新生成）
 * 注意：如果验证令牌不一致，说明机器环境已变化，已加密的数据将无法解密
 */
function initKeystore(): void {
  const storedToken = keystore.get('key_verification_token') as string | undefined

  if (!storedToken) {
    const machineKey = deriveMachineKey()
    const token = crypto.createHash('sha256').update(machineKey).digest('hex')
    keystore.set('key_verification_token', token)
    logger.info('Provider keystore initialized with machine-specific key')
  } else if (!verifyMachineKey()) {
    logger.warn(
      'Machine fingerprint changed! Encrypted provider keys may be unreadable. ' +
        'If you recently changed your system, re-enter your API keys.'
    )
  }
}

/**
 * 加密 API Key
 * 使用 AES-256-GCM 认证加密，返回 Base64 编码的密文
 * 格式: iv (16 bytes) + authTag (16 bytes) + ciphertext → Base64
 */
function encryptApiKey(plaintext: string): string {
  const key = deriveMachineKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // 拼接: iv + authTag + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

/**
 * 解密 API Key
 * 从 Base64 编码的密文中还原明文
 */
function decryptApiKey(encryptedBase64: string): string {
  if (!encryptedBase64) return ''

  try {
    const key = deriveMachineKey()
    const combined = Buffer.from(encryptedBase64, 'base64')

    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    logger.error('Failed to decrypt API key:', error)
    throw new Error(
      'Failed to decrypt API key. The machine environment may have changed. ' +
        'Please re-enter your API keys in provider settings.'
    )
  }
}

export { initKeystore, encryptApiKey, decryptApiKey, verifyMachineKey }
