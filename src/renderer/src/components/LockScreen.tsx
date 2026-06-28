import React, { useState } from 'react'
import { Modal, Input } from 'antd'

interface LockScreenProps {
  onUnlock: (password: string) => void
}

const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('')
  const [inputValue, setInputValue] = useState('')

  const handleOk = (): void => {
    onUnlock(password)
  }

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      handleOk()
    }
  }

  const handlePasswordChange = (value: string): void => {
    setInputValue(value)
    setPassword(value)
  }

  return (
    <Modal
      open={true}
      onOk={handleOk}
      onCancel={() => {}}
      footer={null}
      closable={false}
      mask={{ closable: false }}
      width={400}
      centered
      rootClassName="lock-screen-modal"
    >
      <div className="text-center p-8">
        <h2 className="text-xl font-semibold mb-4">系统已锁屏</h2>
        <p className="text-gray-600 mb-6">请输入密码解锁</p>

        <Input.OTP
          length={6}
          value={inputValue}
          onChange={handlePasswordChange}
          formatter={(str) => str.replace(/\D/g, '')}
          mask
          autoFocus
          inputMode="numeric"
          style={{ width: '100%', marginBottom: '16px' }}
          onKeyUp={handleKeyPress}
        />

        <div className="text-sm text-gray-500">输入6位数字解锁</div>
      </div>
    </Modal>
  )
}

export default LockScreen
