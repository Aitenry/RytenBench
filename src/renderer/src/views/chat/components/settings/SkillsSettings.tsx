import React, { useState, useEffect, useCallback } from 'react'
import { theme, Button, Input, Switch, Spin, Pagination } from 'antd'
import { LoadingOutlined, FolderOutlined } from '@ant-design/icons'
import { useMessage } from '@renderer/hooks/useMessage'
import { Window } from '../../../../../resource/types/window'
import type { SystemSettings, ChatSettings } from '@renderer/types/settings'
import {
  SettingsPageHeader,
  SettingsSection,
  SettingRow
} from '../../../../components/system/settings/settings-ui'

interface SkillInfo {
  id: string
  name: string
  description: string
}

const SkillsSettings: React.FC = () => {
  const {
    token: { colorTextTertiary }
  } = theme.useToken()

  const { viewMessage } = useMessage()

  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [skillsPath, setSkillsPath] = useState('')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [savingPath, setSavingPath] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
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
  }, [skillsPath, skillsRefreshKey])

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
          historyWindowSize: 10
        }),
        skillsPath: trimmed || undefined
      }
      await (window as unknown as Window).api.systemSettings.update({ chat: nextChat })
      setSettings((prev) => (prev ? { ...prev, chat: nextChat } : prev))
      setSkillsPath(trimmed)
      setSkillsRefreshKey((k) => k + 1)
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
      <SettingsPageHeader
        title="技能（Skills）"
        description="配置全局技能存储目录，子文件夹将作为独立技能加载；可单独启停每个技能。留空则不启用。"
      />

      {/* 目录选择 */}
      <SettingsSection
        title="技能存储目录"
        icon={<FolderOutlined size={14} />}
        description="每个含 SKILL.md 的子目录即为一个技能"
        bodyPadding={16}
      >
        <div style={{ display: 'flex', gap: 8, maxWidth: 560 }}>
          <Input
            value={skillsPath}
            onChange={(e) => setSkillsPath(e.target.value)}
            placeholder="例如：D:\skills（留空不启用）"
            allowClear
            style={{ flex: 1 }}
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
        </div>
        {settings?.chat?.skillsPath && (
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12,
              opacity: 0.65,
              wordBreak: 'break-all'
            }}
          >
            当前已生效：{settings.chat.skillsPath}
          </p>
        )}
      </SettingsSection>

      {/* 技能列表 */}
      {loadingSkills ? (
        <div className="flex items-center justify-center" style={{ padding: '40px 0' }}>
          <Spin
            indicator={<LoadingOutlined spin style={{ fontSize: 20, color: colorTextTertiary }} />}
          />
        </div>
      ) : skills.length > 0 ? (
        <SettingsSection title={`已发现的技能（${skills.length}）`}>
          {paginatedSkills.map((skill) => {
            const isEnabled = !enabledSkills || enabledSkills.includes(skill.id)
            return (
              <SettingRow
                key={skill.id}
                title={skill.name}
                description={skill.description || undefined}
                control={
                  <Switch
                    checked={isEnabled}
                    onChange={(checked) => handleToggleSkill(skill.id, checked)}
                    size="small"
                  />
                }
              />
            )
          })}
          {skills.length > PAGE_SIZE && (
            <div className="flex justify-center" style={{ padding: '10px 0' }}>
              <Pagination
                current={currentPage}
                total={skills.length}
                pageSize={PAGE_SIZE}
                onChange={(page) => setCurrentPage(page)}
                size="small"
              />
            </div>
          )}
        </SettingsSection>
      ) : settings?.chat?.skillsPath ? (
        <div
          style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: colorTextTertiary }}
        >
          此目录中未发现任何技能，请确保子目录中包含 SKILL.md 文件
        </div>
      ) : null}
    </div>
  )
}

export default SkillsSettings
