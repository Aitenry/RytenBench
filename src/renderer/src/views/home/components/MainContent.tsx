import React, { useState } from 'react'
import { theme, Modal } from 'antd' // 增加 Modal, Button
import { Card, Typography, Tag, Space, Masonry, Flex, Image } from 'antd'
import { PushpinOutlined } from '@ant-design/icons'
import { RiBook2Line, RiQuillPenAiLine } from '@remixicon/react'
import MarkdownEditor from '../../../components/MarkdownEditor'
import { useMessage } from '@renderer/hooks/useMessage'

const { Title, Text } = Typography

// 定义笔记/知识库项的类型（增加 content 字段）
interface ContentItem {
  id: string
  title: string
  type: 'note' | 'knowledge'
  lastEdited: string
  isPinned?: boolean
  summary?: string
  wordCount?: number
  noteCount?: number
  coverImage?: string
  tags?: string[]
  category?: string
  content?: string // 新增：Markdown 正文内容
}

// 模拟数据（增加 content 字段）
const mockItems: ContentItem[] = [
  {
    id: '6',
    title: '重要决策记录',
    type: 'note',
    lastEdited: '2025-01-10 09:15',
    isPinned: true,
    summary: '记录了几个关键的项目决策，包括技术选型和架构设计。',
    wordCount: 670,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['决策', '重要', '记录'],
    category: '项目',
    content:
      '# 重要决策记录\n\n## 技术选型\n决定使用 React + TypeScript 作为前端技术栈。\n\n## 架构设计\n采用微前端架构，主应用负责路由分发。'
  },
  {
    id: '7',
    title: 'API 接口规范',
    type: 'knowledge',
    lastEdited: '2025-01-09 14:00',
    isPinned: true,
    summary: '项目统一的 API 设计规范，包括命名规则、错误处理和安全措施。',
    wordCount: 2100,
    noteCount: 12,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['API', '规范', '后端'],
    category: '技术',
    content:
      '# API 接口规范\n\n## 命名规则\n- 使用 RESTful 风格\n- 路径使用小写字母，单词间用连字符分隔\n\n## 错误处理\n统一返回 `{ code, message, data }` 格式。'
  },
  {
    id: '1',
    title: '项目架构设计',
    type: 'knowledge',
    lastEdited: '2025-01-14 10:30',
    summary: '关于项目整体架构的初步设计，包括前后端分离、微服务架构、数据库设计等关键决策。',
    wordCount: 1250,
    noteCount: 8,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['架构', '设计', '后端'],
    category: '技术',
    content:
      '# 项目架构设计\n\n## 技术选型\n- 前端：React + TypeScript\n- 后端：Node.js + Express\n- 数据库：PostgreSQL\n\n## 架构图\n\n```mermaid\nflowchart TD\n    A[客户端] --> B[API网关]\n    B --> C[服务A]\n    B --> D[服务B]\n```'
  },
  {
    id: '2',
    title: '今日会议纪要',
    type: 'note',
    lastEdited: '2025-01-13 16:45',
    summary: '讨论了下阶段的开发任务，确定了优先级和时间节点，明确了各团队的职责分工。',
    wordCount: 450,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['会议', '计划', '团队'],
    category: '工作',
    content:
      '# 今日会议纪要\n\n## 讨论内容\n1. 下阶段开发任务：完成用户模块和权限管理。\n2. 优先级：用户模块优先。\n3. 时间节点：两周内完成。\n\n## 分工\n- 前端：张三\n- 后端：李四'
  },
  {
    id: '3',
    title: 'TypeScript 学习笔记',
    type: 'note',
    lastEdited: '2025-01-12 11:20',
    summary: '关于泛型和类型守卫的深入学习笔记，包含实际代码示例和最佳实践。',
    wordCount: 890,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['TypeScript', '编程', '学习'],
    category: '技术',
    content:
      '# TypeScript 学习笔记\n\n## 泛型\n```typescript\nfunction identity<T>(arg: T): T {\n    return arg;\n}\n```\n\n## 类型守卫\n使用 `typeof`、`instanceof` 或自定义类型谓词。'
  },
  {
    id: '4',
    title: '新的笔记',
    type: 'note',
    lastEdited: '2025-01-11 11:20',
    summary: '关于新的笔记的摘要，记录了一些日常思考和灵感。',
    wordCount: 230,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['笔记', '思考'],
    category: '生活',
    content: '# 新的笔记\n\n今天想到一个创意：...'
  },
  {
    id: '5',
    title: '新的知识库',
    type: 'knowledge',
    lastEdited: '2025-01-10 11:20',
    summary: '关于新的知识库的摘要，整理了多个相关主题的知识点。',
    wordCount: 1500,
    noteCount: 5,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['知识库', '整理', '学习'],
    category: '学习',
    content: '# 新的知识库\n\n## 主题一\n...\n\n## 主题二\n...'
  }
]

// 根据内容类型获取图标
const getTypeIcon = (type: ContentItem['type']): React.ReactNode => {
  switch (type) {
    case 'note':
      return <RiQuillPenAiLine size={12} />
    case 'knowledge':
      return <RiBook2Line size={12} />
  }
}

// 根据内容类型获取颜色
const getTypeColor = (type: ContentItem['type']): string => {
  switch (type) {
    case 'note':
      return 'blue'
    case 'knowledge':
      return 'green'
  }
}

// 用于渲染单个内容项的子组件（增加 onClick 属性）
const ContentCard: React.FC<{ item: ContentItem; onClick?: () => void }> = ({ item, onClick }) => {
  const { token } = theme.useToken()
  const typeColor = getTypeColor(item.type)
  const typeMapping = {
    note: '笔记',
    knowledge: '知识',
    code: '代码',
    image: '图片',
    document: '文档'
  }
  const typeText = typeMapping[item.type]

  return (
    <Card
      size="small"
      hoverable
      onClick={onClick} // 绑定点击事件
      style={{
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        cursor: 'pointer' // 添加手型光标
      }}
      styles={{
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1
        }
      }}
    >
      {/* 置顶图标 */}
      {item.isPinned && (
        <div
          style={{
            position: 'absolute',
            top: token.paddingSM,
            right: token.paddingSM,
            zIndex: 1,
            backgroundColor: token.colorWarning,
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <PushpinOutlined style={{ fontSize: 12, color: 'white' }} />
        </div>
      )}

      {/* 封面图片 */}
      {item.coverImage && (
        <div style={{ position: 'relative' }}>
          <Image
            src={item.coverImage}
            alt={item.title}
            preview={false}
            width="100%"
            height={120}
            style={{ objectFit: 'cover' }}
          />
          <Tag
            color={typeColor}
            style={{
              position: 'absolute',
              top: token.paddingSM,
              left: token.paddingSM,
              margin: 0,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {getTypeIcon(item.type)}
            {typeText}
          </Tag>
        </div>
      )}

      {/* 内容区域 */}
      <div style={{ padding: token.paddingSM, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Space align="start" style={{ display: 'flex', alignItems: 'center' }} size="small">
              {!item.coverImage && (
                <Tag
                  color={typeColor}
                  style={{ userSelect: 'none', display: 'flex', alignItems: 'center', margin: 0 }}
                >
                  {getTypeIcon(item.type)}
                  {typeText}
                </Tag>
              )}
              <Title level={5} style={{ margin: 0, color: token.colorTextHeading, flex: 1 }}>
                {item.title}
              </Title>
            </Space>
          </div>
        </div>

        {item.summary && (
          <Text
            type="secondary"
            style={{ marginTop: token.marginXS, flex: 1, fontSize: token.fontSizeSM }}
          >
            {item.summary}
          </Text>
        )}

        {/* 标签行 */}
        {item.tags && item.tags.length > 0 && (
          <div
            style={{
              marginTop: token.marginXS,
              display: 'flex',
              flexWrap: 'wrap',
              gap: token.marginXS / 2
            }}
          >
            {item.tags.slice(0, 3).map((tag, index) => (
              <Tag
                key={index}
                color="processing"
                style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}
              >
                {tag}
              </Tag>
            ))}
            {item.tags.length > 3 && (
              <Tag color="default" style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>
                +{item.tags.length - 3}
              </Tag>
            )}
          </div>
        )}

        {/* 底部信息栏 */}
        <div
          style={{ display: 'flex', justifyContent: 'space-between', marginTop: token.marginXS }}
        >
          <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>{item.lastEdited}</Tag>
          <div style={{ display: 'flex', gap: token.marginXS / 2 }}>
            {item.wordCount !== undefined && (
              <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>{item.wordCount}字</Tag>
            )}
            {item.noteCount !== undefined && (
              <Tag style={{ margin: 0, fontSize: token.fontSizeSM - 2 }}>{item.noteCount}篇</Tag>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// 主内容区组件
const MainContent: React.FC = () => {
  // 模态框状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentItem, setCurrentItem] = useState<ContentItem | null>(null)

  const { viewMessage } = useMessage()
  // 分离置顶和非置顶项目
  const pinnedItems = mockItems.filter((item) => item.isPinned)
  const recentItems = mockItems.filter((item) => !item.isPinned)

  // 合并数组，置顶项目在前
  const allItems = [...pinnedItems, ...recentItems]

  // 处理卡片点击
  const handleCardClick = (item: ContentItem): void => {
    setCurrentItem(item)
    setIsModalOpen(true)
  }

  // 编辑器保存回调（示例：打印新内容，实际应更新数据源或调用 API）
  const handleEditorSave = (newContent: string): void => {
    console.log('保存的内容：', newContent)
    // 这里可以更新 mockItems 中对应项的内容，但出于演示，仅打印
    // 实际项目可能需要调用 API 或更新状态管理
    // 例如：找到 currentItem 并更新其 content
    if (currentItem) {
      // 更新本地数据（仅示例，实际可能用状态管理）
      const updatedItem = { ...currentItem, content: newContent }
      // 如果需要更新 mockItems，可以在这里实现，但注意 mockItems 是常量
      // 更合适的做法是将 mockItems 提升为 useState 或使用状态管理库
      console.log(updatedItem)
      viewMessage('unlock-success', 'success', '保存成功！')
    }
    // 可选：关闭模态框
    // setIsModalOpen(false)
  }

  return (
    <>
      <div style={{ padding: '12px 6px' }}>
        <div
          className="overflow-x-hidden overflow-y-auto custom-scrollbar"
          style={{
            maxHeight: 'calc(100vh - 40px)',
            padding: '0 6px'
          }}
        >
          <Flex vertical gap={16}>
            {/* 所有内容列表 - 使用 Masonry 布局 */}
            <Masonry
              columns={3}
              gutter={16}
              items={allItems.map((item, index) => ({
                key: item.id,
                column: index % 3,
                data: item
              }))}
              itemRender={(record) => (
                <ContentCard item={record.data} onClick={() => handleCardClick(record.data)} />
              )}
            />
          </Flex>
        </div>
      </div>

      {/* 编辑器模态框 */}
      <Modal
        title={currentItem?.title || '编辑内容'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        width="80%"
        style={{ top: 20 }}
        footer={null} // 编辑器内部自带保存按钮，所以隐藏默认底部
      >
        {currentItem && (
          <MarkdownEditor initialValue={currentItem.content || ''} onSave={handleEditorSave} />
        )}
      </Modal>
    </>
  )
}

export default MainContent
