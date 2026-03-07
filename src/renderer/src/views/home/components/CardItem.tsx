import React, { useState } from 'react'
import { Card, Flex, Typography, Space, Button, Slider } from 'antd'
import {
  RiMapPin2Line,
  RiSunLine,
  RiPlayCircleFill,
  RiPauseCircleFill,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiUser3Line
} from '@remixicon/react'
import { theme } from 'antd'

const { Title, Text } = Typography

interface SidebarProps {
  weatherData: {
    city: string
    date: string
    temperature: string
    condition: string
    highLow: string
    feelsLike: string
    icon?: string
  }
  workTimeData: {
    today: string
    avgLastWeek: string
    thisWeek: string
    todayWorked: string
  }
  musicData: {
    title: string
    artist: string
    duration: string
    current: string
    cover: string
    isPlaying: boolean
  }
}

const CardItem: React.FC<SidebarProps> = ({ weatherData, workTimeData, musicData }) => {
  const {
    token: { borderRadiusLG }
  } = theme.useToken()
  const [isPlaying, setIsPlaying] = useState(musicData.isPlaying)

  // 模拟音乐播放控制
  const togglePlay = (): void => {
    setIsPlaying(!isPlaying)
  }

  return (
    <div className="h-full flex flex-col gap-2.5">
      {/* 天气卡片 */}
      <Card
        className="flex-1"
        style={{
          background: 'rgba(255, 255, 255, 0.8)',
          borderRadius: borderRadiusLG,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center' // 垂直居中内容
        }}
      >
        <Flex justify="space-between" align="center">
          <Space>
            <RiMapPin2Line size={20} /> {/* 地点图标 */}
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
            {/* <span style={{ fontSize: '32px' }}>{weatherData.icon}</span> */}
            {/* 你可以在这里使用更精确的天气图标，例如 RiSunLine, RiCloudyLine 等 */}
            <RiSunLine size={32} /> {/* 示例：晴天图标 */}
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
          background: 'rgba(255, 255, 255, 0.8)',
          borderRadius: borderRadiusLG,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center', // 垂直居中内容
          minHeight: '0' // 允许卡片在flex容器中收缩
        }}
      >
        <Flex justify="center" align="center" style={{ marginBottom: '12px' }}>
          <RiUser3Line size={28} style={{ marginRight: '8px' }} /> {/* 用户图标 */}
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

      {/* 音乐播放器卡片 */}
      <Card
        className="flex-1"
        style={{
          background: 'rgba(255, 255, 255, 0.8)',
          borderRadius: borderRadiusLG,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center', // 垂直居中内容
          minHeight: '0' // 允许卡片在flex容器中收缩
        }}
      >
        <Flex align="center" gap="middle" style={{ marginBottom: '12px' }}>
          <img
            src={musicData.cover}
            alt="Album Cover"
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '8px',
              objectFit: 'cover'
            }}
          />
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {musicData.title}
            </Title>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {musicData.artist}
            </Text>
          </div>
        </Flex>
        <Flex justify="space-between" align="center" style={{ marginBottom: '8px' }}>
          <Text style={{ fontSize: '12px' }}>{musicData.current}</Text>
          <Text style={{ fontSize: '12px' }}>{musicData.duration}</Text>
        </Flex>
        <Slider defaultValue={0} tooltip={{ formatter: null }} style={{ marginBottom: '12px' }} />
        <Flex justify="center" gap="large">
          <Button shape="circle" icon={<RiSkipBackFill size={15} />} size="small" type="text" />
          <Button
            shape="circle"
            onClick={togglePlay}
            icon={isPlaying ? <RiPauseCircleFill size={15} /> : <RiPlayCircleFill size={15} />}
            size="small"
            type="text"
          />
          <Button shape="circle" icon={<RiSkipForwardFill size={15} />} size="small" type="text" />
        </Flex>
      </Card>
    </div>
  )
}

export default CardItem
