import React from 'react'
import { Card, Flex, Typography, Space, theme } from 'antd'
import { RiMapPin2Line, RiSunLine, RiUser3Line } from '@remixicon/react'
import type { CardItemProps } from '@renderer/types/components'
import MusicMiniCard from './MusicMiniCard'

const { Title, Text } = Typography

const CardItem: React.FC<CardItemProps> = ({ weatherData, workTimeData }) => {
  const {
    token: { borderRadiusLG, colorFillAlter }
  } = theme.useToken()

  return (
    <div className="h-full flex flex-col gap-2.5">
      {/* 天气卡片 */}
      <Card
        className="flex-1"
        style={{
          background: colorFillAlter,
          borderRadius: borderRadiusLG,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}
      >
        <Flex justify="space-between" align="center">
          <Space>
            <RiMapPin2Line size={20} />
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {weatherData.city}
              </Title>
              <Text type="secondary">{weatherData.date}</Text>
            </div>
          </Space>
        </Flex>
        <Flex justify="space-between" align="center" style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RiSunLine size={32} />
            <Title level={3} style={{ margin: 0 }}>
              {weatherData.temperature}
            </Title>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Text>{weatherData.condition}</Text>
            <br />
            <Text type="secondary">{weatherData.highLow}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {weatherData.feelsLike}
            </Text>
          </div>
        </Flex>
      </Card>

      {/* 工作时长卡片 */}
      <Card
        className="flex-1"
        style={{
          background: colorFillAlter,
          borderRadius: borderRadiusLG,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: '0'
        }}
      >
        <Flex justify="center" align="center" style={{ marginBottom: '12px' }}>
          <RiUser3Line size={28} style={{ marginRight: '8px' }} />
          <Title level={4} style={{ margin: 0 }}>
            0 小时 0 分钟
          </Title>
        </Flex>
        <Text
          type="secondary"
          style={{ fontSize: '12px', display: 'block', textAlign: 'center', marginBottom: '8px' }}
        >
          每日平均工作时间
        </Text>
        <Flex justify="center" align="center" style={{ marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', color: '#faad14' }}>▲</span>
          <Text type="secondary" style={{ fontSize: '12px', marginLeft: '4px' }}>
            {workTimeData.avgLastWeek}
          </Text>
        </Flex>
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <Text style={{ fontSize: '14px' }}>{workTimeData.thisWeek}</Text>
          <br />
          <Text style={{ fontSize: '14px', fontWeight: 'bold' }}>{workTimeData.todayWorked}</Text>
        </div>
      </Card>

      <MusicMiniCard />
    </div>
  )
}

export default CardItem
