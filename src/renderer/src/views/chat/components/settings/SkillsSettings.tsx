import React, { useState, useEffect, useCallback } from 'react'
import { theme, Button, Input, Switch, Space, Spin, Pagination } from 'antd'
import { LoadingOutlined, FolderOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'

interface SkillInfo {
  id: string
  name: string
  description: string
}

const SkillsSettings: React.FC = () => {
  const {
    token: { colorText, colorTextSecondary, colorTextTertiary, colorFillAlter }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [skillsPath, setSkillsPath] = useState('')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [savingPath, setSavingPath] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 5

  const enabledSkills = settings?.chat?.enabledSkills

  const loadSettings = useCallback(async () => {
    const msgKey = 'skills-settings-load'
    try {
      const result = await (window as unknown as Window).api.systemSettings.getAll()
      setSettings(result)
      setSkillsPath(result.chat?.skillsPath ?? '')
    } catch (error) {
      viewMessage(msgKey, 'error', `加载失败: ${error}`)
    }
  }, [viewMessage])

  useEffect(() => {
    loadSettings().then()
  }, [loadSettings])

  // 目录有效时加载技能列表
  useEffect(() => {
    if (!skillsPath) {
      setSkills([])
      return
    }
    setLoadingSkills(true)
    setCurrentPage(1)
    ;(window as unknown as Window).api.chat
      .listSkills()
      .then((list: SkillInfo[]) => setSkills(list))
      .catch(() => setSkills([]))
      .finally(() => setLoadingSkills(false))
  }, [skillsPath])

  const handleBrowsePath = async (): Promise<void> => {
    try {
      const path = await (window as unknown as Window).api.chat.selectSkillsDirectory()
      if (path) setSkillsPath(path)
    } catch (error) {
      viewMessage('skills-path', 'error', `选择目录失败: ${error}`)
    }
  }

  const handleSavePath = async (): Promise<void> => {
    const msgKey = 'skills-path'
    try {
      setSavingPath(true)
      const trimmed = skillsPath.trim()
      const nextChat: ChatSettings = {
        ...(settings?.chat ?? {
          maxIterations: 5,
          historyWindowSize: 10,
          toolCallWindowSize: 20
        }),
        skillsPath: trimmed || undefined
      }
      await (window as unknown as Window).api.systemSettings.update({ chat: nextChat })
      setSettings((prev) => (prev ? { ...prev, chat: nextChat } : prev))
      setSkillsPath(trimmed)
      viewMessage(msgKey, 'success', trimmed ? '技能目录已保存' : '已清空技能目录', 2)
    } catch (error) {
      viewMessage(msgKey, 'error', `保存失败: ${error}`)
    } finally {
      setSavingPath(false)
    }
  }

  const handleToggleSkill = async (skillId: string, checked: boolean): Promise<void> => {
    const msgKey = `skill-toggle-${skillId}`
    try {
      const current = settings?.chat
      if (!current) return

      let next: string[] | undefined
      if (checked) {
        // 启用：从 disabled 列表移除（如果没有 disabled 列表，说明全部启用，不操作）
        if (enabledSkills) {
          next = [...enabledSkills, skillId]
        }
        // enabledSkills 为 undefined 表示全部启用，无需操作
      } else {
        // 禁用：加入 disabled 列表
        if (enabledSkills) {
          next = enabledSkills.filter((s) => s !== skillId)
        } else {
          // 当前全部启用，需要生成完整列表（排除当前skill）
          next = skills.filter((s) => s.id !== skillId).map((s) => s.id)
        }
      }

      const nextChat: ChatSettings = { ...current, enabledSkills: next }
      await (window as unknown as Window).api.systemSettings.update({ chat: nextChat })
      setSettings((prev) => (prev ? { ...prev, chat: nextChat } : prev))
    } catch (error) {
      viewMessage(msgKey, 'error', `切换失败: ${error}`)
    }
  }

  // 分页
  const paginatedSkills = skills.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div>
      <h3 className="text-base font-semibold m-0" style={{ color: colorText }}>
        技能（Skills）
      </h3>
      <p className="text-sm mt-1 mb-4" style={{ color: colorTextSecondary }}>
        配置技能存储目录后，子文件夹将作为独立技能加载；可单独启停每个技能。留空则不启用。
      </p>

      {/* 目录选择 */}
      <div className="p-4 rounded-lg mb-4" style={{ background: colorFillAlter }}>
        <div className="flex items-center gap-2 mb-3">
          <FolderOutlined style={{ color: colorTextSecondary }} />
          <span className="font-medium" style={{ color: colorText }}>
            技能存储目录
          </span>
        </div>
        <div className="text-xs mb-3" style={{ color: colorTextSecondary }}>
          每个含 SKILL.md 的子目录即为一个技能
        </div>
        <Space.Compact style={{ width: '100%', maxWidth: 560 }}>
          <Input
            value={skillsPath}
            onChange={(e) => setSkillsPath(e.target.value)}
            placeholder="例如：D:\skills（留空不启用）"
            allowClear
          />
          <Button onClick={handleBrowsePath}>浏览…</Button>
          <Button
            type="primary"
            loading={savingPath}
            disabled={skillsPath.trim() === (settings?.chat?.skillsPath ?? '')}
            onClick={handleSavePath}
          >
            保存
          </Button>
        </Space.Compact>
        {settings?.chat?.skillsPath && (
          <p className="text-xs mt-2 m-0" style={{ color: colorTextTertiary }}>
            当前已生效：{settings.chat.skillsPath}
          </p>
        )}
      </div>

      {/* 技能列表 */}
      {loadingSkills ? (
        <div
          className="p-6 rounded-lg flex items-center justify-center"
          style={{ background: colorFillAlter }}
        >
          <Spin
            indicator={<LoadingOutlined spin style={{ fontSize: 20, color: colorTextTertiary }} />}
          />
        </div>
      ) : skills.length > 0 ? (
        <div className="p-4 rounded-lg" style={{ background: colorFillAlter }}>
          <div className="font-medium mb-2" style={{ color: colorText }}>
            已发现的技能（{skills.length}）
          </div>
          <div className="flex flex-col">
            {paginatedSkills.map((skill, idx) => {
              const isEnabled = !enabledSkills || enabledSkills.includes(skill.id)
              return (
                <div
                  key={skill.id}
                  className="flex items-center justify-between py-2.5 gap-3"
                  style={{
                    borderBottom:
                      idx < skills.length - 1 ? `1px solid ${colorTextTertiary}` : 'none'
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: colorText }}>
                      {skill.name}
                    </div>
                    {skill.description && (
                      <div
                        className="text-xs mt-0.5 line-clamp-2"
                        style={{ color: colorTextSecondary }}
                      >
                        {skill.description}
                      </div>
                    )}
                  </div>
                  <Switch
                    checked={isEnabled}
                    onChange={(checked) => handleToggleSkill(skill.id, checked)}
                    size="small"
                  />
                </div>
              )
            })}
          </div>
          {skills.length > PAGE_SIZE && (
            <div className="mt-3 flex justify-center">
              <Pagination
                current={currentPage}
                total={skills.length}
                pageSize={PAGE_SIZE}
                onChange={(page) => setCurrentPage(page)}
                size="small"
              />
            </div>
          )}
        </div>
      ) : settings?.chat?.skillsPath ? (
        <div className="p-6 rounded-lg text-center" style={{ background: colorFillAlter }}>
          <p className="text-sm m-0" style={{ color: colorTextSecondary }}>
            此目录中未发现任何技能，请确保子目录中包含 SKILL.md 文件
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default SkillsSettings
