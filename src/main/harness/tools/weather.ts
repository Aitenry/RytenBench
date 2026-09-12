import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { fetchWeatherApi } from 'openmeteo'
import * as z from 'zod/v4'
import {
  weatherCodeMap,
  windDirectionLabel,
  geocodeLocation,
  formatDate,
  weekdayLabel
} from '../../shared/weather-utils'

// ============================================================================
// Weather Tool — 天气查询
// ============================================================================

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
        .int()
        .min(1)
        .max(16)
        .optional()
        .default(3)
        .describe('预报天数（1-16），默认 3 天。问"今天"或"当前"=1，"明天"=2，"这周"=7')
    })
  })
}
