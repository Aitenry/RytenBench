import React from 'react'
import { RiLoader4Line } from '@remixicon/react'

interface LoadingMessageProps {
  colorTextSecondary: string
}

const LoadingMessage: React.FC<LoadingMessageProps> = ({ colorTextSecondary }) => (
  <div className="flex mb-6">
    <div className="max-w-[85%]">
      <div className="flex items-center gap-2" style={{ color: colorTextSecondary }}>
        <RiLoader4Line size={16} className="animate-spin" />
        <span>正在生成...</span>
      </div>
    </div>
  </div>
)

export default LoadingMessage
