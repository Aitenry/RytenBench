import React from 'react'
import { theme } from 'antd'
import { Card, Typography, Tag, Space, Divider } from 'antd' // 引入需要的 Ant Design 组件
import { EditOutlined, PushpinOutlined } from '@ant-design/icons'
import { RiBook2Line, RiQuillPenAiLine } from '@remixicon/react' // 引入图标

const { Title, Text } = Typography

// 定义笔记/知识库项的类型
interface ContentItem {
  id: string
  title: string
  type: 'note' | 'knowledge' // 区分笔记和知识库
  lastEdited: string // 例如 "2025-01-14 10:30"
  isPinned?: boolean // 是否置顶
  summary?: string // 内容摘要
  wordCount?: number // 字数
  noteCount?: number // 笔记数量（仅知识库类型）
}

// 模拟数据
const mockRecentItems: ContentItem[] = [
  {
    id: '1',
    title: '项目架构设计',
    type: 'knowledge',
    lastEdited: '2025-01-14 10:30',
    summary: '关于项目整体架构的初步设计...',
    wordCount: 1250,
    noteCount: 8
  },
  {
    id: '2',
    title: '今日会议纪要',
    type: 'note',
    lastEdited: '2025-01-13 16:45',
    summary: '讨论了下阶段的开发任务...',
    wordCount: 450
  },
  {
    id: '3',
    title: 'TypeScript 学习笔记',
    type: 'note',
    lastEdited: '2025-01-12 11:20',
    summary: '关于泛型和类型守卫的笔记...',
    wordCount: 890
  },
  {
    id: '4',
    title: '新的笔记',
    type: 'note',
    lastEdited: '2025-01-11 11:20',
    summary: '关于新的笔记的摘要...',
    wordCount: 230
  },
  {
    id: '5',
    title: '新的知识库',
    type: 'knowledge',
    lastEdited: '2025-01-10 11:20',
    summary: '关于新的知识库的摘要...',
    wordCount: 1500,
    noteCount: 5
  }
]

const mockPinnedItems: ContentItem[] = [
  {
    id: '6',
    title: '重要决策记录',
    type: 'note',
    lastEdited: '2025-01-10 09:15',
    isPinned: true,
    summary: '记录了几个关键的项目决策...',
    wordCount: 670
  },
  {
    id: '7',
    title: 'API 接口规范',
    type: 'knowledge',
    lastEdited: '2025-01-09 14:00',
    isPinned: true,
    summary: '项目统一的 API 设计规范...',
    wordCount: 2100,
    noteCount: 12
  }
]

// 用于渲染单个内容项的子组件
const ContentCard: React.FC<{ item: ContentItem }> = ({ item }) => {
  const { token } = theme.useToken()
  const typeColor = item.type === 'note' ? 'blue' : 'green' // 用不同颜色区分类型
  const typeText = item.type === 'note' ? '笔记' : '知识'

  return (
    <Card
      size="small"
      hoverable
      style={{
        // 移除了固定的 margin-bottom，由 grid 自己处理间距
        background: token.colorFillAlter, // 使用填充色作为背景，更柔和
        border: `1px solid ${token.colorBorderSecondary}`,
        height: '100%', // 让卡片高度撑满网格项
        display: 'flex',
        flexDirection: 'column' // 确保内容从上到下排列
      }}
      styles={{
        body: {
          padding: token.paddingSM, // 调整卡片内部间距
          flex: 1, // 让卡片 body 部分占据剩余空间
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Space align="start" style={{ display: 'flex', alignItems: 'center' }} size="small">
            <Tag
              color={typeColor}
              style={{ userSelect: 'none', display: 'flex', alignItems: 'center', margin: 0 }}
            >
              {item.type === 'note' ? <RiQuillPenAiLine size={12} /> : <RiBook2Line size={12} />}
              {typeText}
            </Tag>
            <Title level={5} style={{ margin: 0, color: token.colorTextHeading, flex: 1 }}>
              {item.title}
            </Title>
          </Space>
        </div>
      </div>
      {item.summary && (
        <Text type="secondary" style={{ marginTop: token.marginXS, flex: 1 }}>
          {item.summary}
        </Text>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <Tag>{item.lastEdited}</Tag>
        {item.wordCount !== undefined && <Tag>{item.wordCount}字</Tag>}
      </div>
    </Card>
  )
}

// 主内容区组件
const MainContent: React.FC = () => {
  const { token } = theme.useToken()

  // 定义 CSS Grid 样式
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', // 自动填充，最小宽度240px，最大为1fr（均分剩余空间）
    gap: token.marginSM, // 设置网格项之间的间距
    marginBottom: token.marginLG
  }

  return (
    <div
      className="overflow-x-hidden overflow-y-auto p-2 custom-scrollbar"
      style={{
        maxHeight: 'calc(100vh - 180px)',
        padding: token.paddingSM // 添加内边距
      }}
    >
      {/* 置顶内容标题 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: token.marginSM }}>
        <PushpinOutlined style={{ marginRight: token.marginXS, color: token.colorWarning }} />
        <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>
          置顶内容
        </Title>
      </div>
      {/* 置顶内容列表 - 使用 Grid 布局 */}
      <div style={gridStyle}>
        {mockPinnedItems.length > 0 ? (
          mockPinnedItems.map((item) => <ContentCard key={`pinned-${item.id}`} item={item} />)
        ) : (
          <Text type="secondary" italic>
            暂无置顶内容
          </Text>
        )}
      </div>

      <Divider style={{ margin: `${token.marginLG}px 0` }} />
      {/* 最近编辑标题 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: token.marginSM }}>
        <EditOutlined style={{ marginRight: token.marginXS, color: token.colorPrimary }} />
        <Title level={4} style={{ margin: 0, color: token.colorTextHeading }}>
          最近编辑
        </Title>
      </div>
      {/* 最近编辑内容列表 - 使用 Grid 布局 */}
      <div style={gridStyle}>
        {mockRecentItems.length > 0 ? (
          mockRecentItems.map((item) => <ContentCard key={`recent-${item.id}`} item={item} />)
        ) : (
          <Text type="secondary" italic>
            暂无最近编辑的内容
          </Text>
        )}
      </div>
    </div>
  )
}

export default MainContent
