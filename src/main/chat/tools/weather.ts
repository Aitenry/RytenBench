import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { fetchWeatherApi } from 'openmeteo'
import * as z from 'zod/v4'

// ============================================================================
// Weather Tool — 天气查询
// ============================================================================

/** WMO 天气码 → 中文描述 */
const weatherCodeMap: Record<number, string> = {
  0: '晴天',
  1: '大部晴朗',
  2: '局部多云',
  3: '多云',
  45: '有雾',
  48: '雾凇',
  51: '小毛毛雨',
  52: '中毛毛雨',
  53: '大毛毛雨',
  56: '小冻毛毛雨',
  57: '大冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '小冻雨',
  67: '大冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '中阵雨',
  82: '大阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷暴',
  96: '小冰雹雷暴',
  99: '大冰雹雷暴'
}

function windDirectionLabel(degrees: number): string {
  const codes = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW'
  ]
  const map: Record<string, string> = {
    N: '北风',
    NNE: '北东北风',
    NE: '东北风',
    ENE: '东东北风',
    E: '东风',
    ESE: '东东南风',
    SE: '东南风',
    SSE: '南东南风',
    S: '南风',
    SSW: '南西南风',
    SW: '西南风',
    WSW: '西西南风',
    W: '西风',
    WNW: '西西北风',
    NW: '西北风',
    NNW: '北西北风'
  }
  return map[codes[Math.round(degrees / 22.5) % 16]] ?? `${degrees.toFixed(0)}°`
}

async function geocodeLocation(
  location: string
): Promise<Array<{ lat: number; lon: number; name: string; admin1?: string; country: string }>> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=5&language=zh&format=json`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    if (!json.results?.length) return []
    return json.results.map(
      (r: {
        latitude: number
        longitude: number
        name: string
        admin1?: string
        country: string
      }) => ({
        lat: r.latitude,
        lon: r.longitude,
        name: r.name,
        admin1: r.admin1,
        country: r.country
      })
    )
  } catch {
    return []
  }
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function weekdayLabel(date: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

async function fetchWeather(location: string, forecastDays: number): Promise<string> {
  const results = await geocodeLocation(location)
  if (!results.length) return `未找到地点 "${location}" 的天气信息。`
  const geo = results[0]
  const locationName = geo.admin1
    ? `${geo.name}，${geo.admin1}（${geo.country}）`
    : `${geo.name}（${geo.country}）`

  const params = {
    latitude: [geo.lat],
    longitude: [geo.lon],
    current:
      'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,apparent_temperature',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant',
    forecast_days: Math.max(forecastDays, 1),
    timezone: 'auto'
  }
  const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', params)
  const response = responses[0]
  const utcOffset = response.utcOffsetSeconds() ?? 0
  const parts: string[] = [`**${locationName}**\n`]

  const current = response.current()
  if (current) {
    const temp = current.variables(0)!.value()
    const code = current.variables(1)!.value()
    const wSpeed = current.variables(2)!.value()
    const wDir = current.variables(3)!.value()
    const humidity = current.variables(4)!.value()
    const apparent = current.variables(5)!.value()
    parts.push('**当前实况**')
    parts.push(`  天气：${weatherCodeMap[code] ?? `天气码 ${code}`}`)
    parts.push(`  气温：${temp.toFixed(1)}°C（体感 ${apparent.toFixed(1)}°C）`)
    parts.push(`  湿度：${humidity}%`)
    parts.push(`  风速：${wSpeed.toFixed(1)} km/h ${windDirectionLabel(wDir)}`)
    parts.push('')
  }
  const daily = response.daily()
  if (daily) {
    const wc = daily.variables(0)!.valuesArray()!
    const tMax = daily.variables(1)!.valuesArray()!
    const tMin = daily.variables(2)!.valuesArray()!
    const aMax = daily.variables(3)!.valuesArray()!
    const aMin = daily.variables(4)!.valuesArray()!
    const precip = daily.variables(5)!.valuesArray()!
    const pProb = daily.variables(6)!.valuesArray()!
    const wMax = daily.variables(7)!.valuesArray()!
    const wDir = daily.variables(8)!.valuesArray()!
    const startTime = Number(daily.time())
    const interval = daily.interval()
    const todayStr = formatDate(new Date())
    parts.push(`**未来 ${wc.length} 天预报**\n`)
    for (let i = 0; i < wc.length; i++) {
      const dayTime = new Date((startTime + i * interval + utcOffset) * 1000)
      const dateStr = formatDate(dayTime)
      const label = dateStr === todayStr ? '今天' : weekdayLabel(dayTime)
      const desc = weatherCodeMap[Math.round(wc[i])] ?? `天气码 ${Math.round(wc[i])}`
      parts.push(
        `  **${dateStr} ${label}**：${desc}，${tMin[i].toFixed(0)}～${tMax[i].toFixed(0)}°C（体感 ${aMin[i].toFixed(0)}～${aMax[i].toFixed(0)}°C），降水量 ${precip[i].toFixed(1)}mm（概率 ${pProb[i] ?? 0}%），风速 ${wMax[i].toFixed(1)}km/h ${windDirectionLabel(wDir[i])}`
      )
    }
  }
  if (results.length > 1) {
    parts.push('\n**其他匹配地点：**')
    for (let i = 1; i < results.length; i++) {
      const r = results[i]
      parts.push(
        `  - ${r.admin1 ? `${r.name}, ${r.admin1}, ${r.country}` : `${r.name}, ${r.country}`}`
      )
    }
  }
  return parts.join('\n')
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildGetWeatherTool(): StructuredToolInterface {
  return tool(async ({ location, forecast_days }) => fetchWeather(location, forecast_days ?? 3), {
    name: 'get_weather',
    description:
      '查询指定地点的当前天气和未来每日天气预报。返回当前实况（温度、体感温度、湿度、风速风向、天气状况）和每日预报。支持城市名、区县名，如 "Beijing"、"广州天河区"、"Tokyo"。',
    schema: z.object({
      location: z
        .string()
        .describe('地点名称。支持中英文城市名、区县名，如 "Beijing"、"广州"、"Tokyo"'),
      forecast_days: z
        .number()
        .optional()
        .default(3)
        .describe('预报天数（1-16），默认 3 天。问"今天"或"当前"=1，"明天"=2，"这周"=7')
    })
  })
}
