import React from 'react'
import { theme } from 'antd'
import { Card, Typography, Tag, Space, Masonry, Flex, Image } from 'antd' // 引入需要的 Ant Design 组件
import { PushpinOutlined } from '@ant-design/icons'
import {
  RiBook2Line,
  RiQuillPenAiLine,
  RiCodeBoxLine,
  RiImageLine,
  RiFileTextLine
} from '@remixicon/react' // 引入图标

const { Title, Text } = Typography

// 定义笔记/知识库项的类型
interface ContentItem {
  id: string
  title: string
  type: 'note' | 'knowledge' | 'image' | 'code' | 'document' // 区分笔记、知识库、图片、代码、文档
  lastEdited: string // 例如 "2025-01-14 10:30"
  isPinned?: boolean // 是否置顶
  summary?: string // 内容摘要
  wordCount?: number // 字数
  noteCount?: number // 笔记数量（仅知识库类型）
  coverImage?: string // 封面图片 URL
  tags?: string[] // 标签数组
  category?: string // 分类
}

// 模拟数据
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
    category: '项目'
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
    category: '技术'
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
    category: '技术'
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
    category: '工作'
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
    category: '技术'
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
    category: '生活'
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
    category: '学习'
  },
  {
    id: '8',
    title: '代码片段收藏',
    type: 'code',
    lastEdited: '2025-01-09 15:30',
    summary: '收集了一些常用的代码片段和最佳实践，方便快速复用。',
    wordCount: 680,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['代码', '片段', '工具'],
    category: '开发'
  },
  {
    id: '9',
    title: '风景摄影集',
    type: 'image',
    lastEdited: '2025-01-08 18:45',
    summary: '最近拍摄的一些风景照片，记录了美好的瞬间。',
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['摄影', '风景', '艺术'],
    category: '生活'
  },
  {
    id: '10',
    title: '项目需求文档',
    type: 'document',
    lastEdited: '2025-01-07 14:20',
    summary: '详细的需求文档，包括功能描述、用户故事和验收标准。',
    wordCount: 2100,
    coverImage: 'https://dummyimage.com/300x200',
    tags: ['文档', '需求', '产品'],
    category: '产品'
  }
]

// 根据内容类型获取图标
const getTypeIcon = (type: ContentItem['type']): React.ReactNode => {
  switch (type) {
    case 'note':
      return <RiQuillPenAiLine size={12} />
    case 'knowledge':
      return <RiBook2Line size={12} />
    case 'code':
      return <RiCodeBoxLine size={12} />
    case 'image':
      return <RiImageLine size={12} />
    case 'document':
      return <RiFileTextLine size={12} />
    default:
      return <RiQuillPenAiLine size={12} />
  }
}

// 根据内容类型获取颜色
const getTypeColor = (type: ContentItem['type']): string => {
  switch (type) {
    case 'note':
      return 'blue'
    case 'knowledge':
      return 'green'
    case 'code':
      return 'purple'
    case 'image':
      return 'orange'
    case 'document':
      return 'geekblue'
    default:
      return 'blue'
  }
}

// 用于渲染单个内容项的子组件
const ContentCard: React.FC<{ item: ContentItem }> = ({ item }) => {
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
      style={{
        background: token.colorFillAlter, // 使用填充色作为背景，更柔和
        border: `1px solid ${token.colorBorderSecondary}`,
        minHeight: 200, // 设置最小高度以适应不同内容长度
        display: 'flex',
        flexDirection: 'column',
        position: 'relative' // 为置顶图标定位
      }}
      styles={{
        body: {
          padding: 0, // 图片卡片通常需要从顶部开始
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
          {/* 类型标签覆盖在图片上 */}
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
              {!item.coverImage && ( // 如果没有封面图片，显示标签在顶部
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
  // 分离置顶和非置顶项目
  const pinnedItems = mockItems.filter((item) => item.isPinned)
  const recentItems = mockItems.filter((item) => !item.isPinned)

  // 合并数组，置顶项目在前
  const allItems = [...pinnedItems, ...recentItems]

  return (
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
              data: item // 修改这里：使用data而不是item
            }))}
            itemRender={(record) => <ContentCard item={record.data} />} // 修改这里：从record.data获取item
          />
        </Flex>
      </div>
    </div>
  )
}

export default MainContent
