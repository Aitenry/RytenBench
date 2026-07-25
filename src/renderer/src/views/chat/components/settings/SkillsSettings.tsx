import React, { useState, useEffect } from 'react'
import { theme, Button, Input, Space } from 'antd'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { ChatSettings } from '@renderer/types/settings'

const SkillsSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorTextTertiary }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null)
  const [skillsPath, setSkillsPath] = useState('')
  const [savedSkillsPath, setSavedSkillsPath] = useState('')
  const [savingSkills, setSavingSkills] = useState(false)

  useEffect(() => {
    ;(window as unknown as Window).api.systemSettings
      .getAll()
      .then((settings) => {
        const chat = settings.chat ?? null
        setChatSettings(chat)
        const path = chat?.skillsPath ?? ''
        setSkillsPath(path)
        setSavedSkillsPath(path)
      })
      .catch((error) => console.error('Failed to load chat settings:', error))
  }, [])

  const handleBrowseSkillsPath = async (): Promise<void> => {
    try {
      const path = await (window as unknown as Window).api.chat.selectSkillsDirectory()
      if (path) setSkillsPath(path)
    } catch (error) {
      viewMessage('skills-path', 'error', `选择目录失败: ${error}`)
    }
  }

  const handleSaveSkillsPath = async (): Promise<void> => {
    const msgKey = 'skills-path'
    try {
      setSavingSkills(true)
      const trimmed = skillsPath.trim()
      const nextChat: ChatSettings = {
        ...(chatSettings ?? { maxIterations: 5, historyWindowSize: 10, toolCallWindowSize: 20 }),
        skillsPath: trimmed || undefined
      }
      await (window as unknown as Window).api.systemSettings.update({ chat: nextChat })
      setChatSettings(nextChat)
      setSkillsPath(trimmed)
      setSavedSkillsPath(trimmed)
      viewMessage(
        msgKey,
        'success',
        trimmed ? '技能目录已保存' : '已清空技能目录，技能功能已停用',
        2
      )
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    } finally {
      setSavingSkills(false)
    }
  }

  return (
    <div>
      <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
        技能（Skills）
      </h3>
      <p className="text-sm mt-1 mb-3" style={{ color: colorTextSecondary }}>
        配置技能存储目录后，对话时将自动加载其中的技能。每个技能为一个子目录，内含带
        name/description 前置信息的 SKILL.md 文件；留空则不启用。
      </p>
      <div className="mb-3">
        <Space.Compact style={{ width: 560, maxWidth: '100%' }}>
          <Input
            value={skillsPath}
            onChange={(e) => setSkillsPath(e.target.value)}
            placeholder="例如：D:\skills（留空不启用）"
            allowClear
          />
          <Button onClick={handleBrowseSkillsPath}>浏览…</Button>
          <Button
            type="primary"
            loading={savingSkills}
            disabled={skillsPath.trim() === savedSkillsPath}
            onClick={handleSaveSkillsPath}
          >
            保存
          </Button>
        </Space.Compact>
      </div>
      {savedSkillsPath && (
        <p className="text-xs mt-2 m-0" style={{ color: colorTextTertiary }}>
          当前已生效：{savedSkillsPath}
        </p>
      )}
    </div>
  )
}

export default SkillsSettings
