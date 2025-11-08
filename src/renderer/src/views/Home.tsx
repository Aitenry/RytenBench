import React, { useState } from 'react'
import { theme, Card, Flex, Typography, Space, Button, Slider } from 'antd'
import {
  RiMapPin2Line,
  RiSunLine,
  RiPlayCircleFill,
  RiPauseCircleFill,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiUser3Line
} from '@remixicon/react'

import Music from '../assets/music.png'

const { Title, Text } = Typography

const Home: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()
  const [isPlaying, setIsPlaying] = useState(false)
  // 模拟数据
  const weatherData = {
    city: '广州市',
    date: '02月19日 星期一 10:04:36',
    temperature: '23°',
    condition: '多云',
    highLow: '27/21°C',
    feelsLike: '体感温度 22.8°C',
    icon: '☁️' // 天气图标，可以替换为对应的 RemixIcon
  }

  const workTimeData = {
    today: '0 小时 0 分钟',
    avgLastWeek: '比上周的每日平均值多 0 小时 0 分钟',
    thisWeek: '本周已工作：0 小时 0 分钟',
    todayWorked: '今天已工作：2 分钟'
  }

  const musicData = {
    title: 'Hypnotized',
    artist: 'Purple Disco Machine',
    duration: '03:15',
    current: '00:00',
    cover: Music, // 占位图
    isPlaying: isPlaying
  }

  return (
    <div className="h-full flex-1 flex flex-row mx-2.5 gap-2.5">
      {/* 左侧边栏 - 包含三个卡片 */}
      <aside
        className="w-6/24 flex flex-col gap-2.5"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          padding: '16px'
        }}
      >
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
            justifyContent: 'center' // 垂直居中内容
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
            justifyContent: 'center' // 垂直居中内容
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
              onClick={() => {
                setIsPlaying(!isPlaying)
              }}
              icon={
                musicData.isPlaying ? (
                  <RiPauseCircleFill size={15} />
                ) : (
                  <RiPlayCircleFill size={15} />
                )
              }
              size="small"
              type="text"
            />
            <Button
              shape="circle"
              icon={<RiSkipForwardFill size={15} />}
              size="small"
              type="text"
            />
          </Flex>
        </Card>
      </aside>

      {/* 主内容区 */}
      <main
        className="w-12/24"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      ></main>

      {/* 右侧边栏 */}
      <aside
        className="w-6/24"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      />
    </div>
  )
}

export default Home
