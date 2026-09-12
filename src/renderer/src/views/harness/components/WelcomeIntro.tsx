import React from 'react'
import { useTypewriter, useCyclingTypewriter } from '../hooks/useTypewriter'

interface WelcomeIntroProps {
  colorText: string
  colorTextSecondary: string
}

const TITLE_TEXT = '你好，我是 Rita～'
const SUBTITLE_TEXTS = [
  '今天天气怎么样？要是还不错，我帮你把明天的日程也排了～',
  '我可以帮你分析文档，提取关键信息，理清它们之间的关系。',
  '有什么重要的事尽管说，我帮你记着，并形成代办事项。',
  '我可以帮你整理零散的文档，构建相应的知识库。'
]

/**
 * 空白会话欢迎语。
 *
 * 打字机是「每 40~60ms 一次 setState」的高频动画源，而循环打字机是**无限循环**的。
 * 因此这两个 hook 必须收敛在这个小组件内：若挂在 useHarnessHandlers 上，整个聊天视图
 * （消息区 / 输入框 / 侧边栏 / 搜索框）会被每秒重渲染约 25 次，永不停止。
 */
const WelcomeIntro: React.FC<WelcomeIntroProps> = ({ colorText, colorTextSecondary }) => {
  const { displayedText: titleDisplayed, isDone: titleDone } = useTypewriter(TITLE_TEXT, 100)
  const { displayedText: subtitleDisplayed, isDone: subtitleDone } = useCyclingTypewriter(
    SUBTITLE_TEXTS,
    60,
    40,
    2000,
    TITLE_TEXT.length * 100
  )

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <h1 className="text-2xl font-semibold mb-2 h-8" style={{ color: colorText }}>
        {titleDisplayed}
        {!titleDone && <span className="animate-pulse">|</span>}
      </h1>
      <p className="text-center max-w-md h-6" style={{ color: colorTextSecondary }}>
        {subtitleDisplayed}
        {titleDone && !subtitleDone && <span className="animate-pulse">|</span>}
      </p>
    </div>
  )
}

export default React.memo(WelcomeIntro)
