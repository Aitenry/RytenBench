import { ipcMain } from 'electron'
import logger from 'electron-log'
import { fetchWeatherApi } from 'openmeteo'
import { settingsStore } from './context'
import { getMainWindow } from './windows/window-manager'
import { getIp } from './address'
import { weatherCodeMap, formatDate, weekdayLabel } from './shared/weather-utils'

const DEFAULT_REFRESH_MIN = 60
let weatherTimer: ReturnType<typeof setInterval> | null = null

async function fetchWeatherData(
  lat: number,
  lon: number,
  locationName: string
): Promise<Record<string, unknown>> {
  const params = {
    latitude: [lat],
    longitude: [lon],
    current:
      'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,apparent_temperature',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: 3,
    timezone: 'auto'
  }
  const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', params)
  const response = responses[0]

  const current = response.current()
  const daily = response.daily()

  const result: Record<string, unknown> = {
    location: locationName,
    current: {},
    daily: [] as Record<string, unknown>[]
  }

  if (current) {
    result.current = {
      temp: current.variables(0)!.value().toFixed(2),
      weatherCode: Math.round(current.variables(1)!.value()),
      weatherDesc: weatherCodeMap[Math.round(current.variables(1)!.value())] ?? '未知',
      windSpeed: current.variables(2)!.value().toFixed(2),
      humidity: Math.round(current.variables(4)!.value()),
      apparentTemp: current.variables(5)!.value().toFixed(2)
    }
  }

  if (daily) {
    const wc = daily.variables(0)!.valuesArray()!
    const tMax = daily.variables(1)!.valuesArray()!
    const tMin = daily.variables(2)!.valuesArray()!
    const pProb = daily.variables(3)!.valuesArray()!
    const startTime = Number(daily.time())
    const dayInterval = daily.interval()
    const todayStr = formatDate(new Date())

    for (let i = 0; i < wc.length; i++) {
      const dayTime = new Date((startTime + i * dayInterval) * 1000)
      const dateStr = formatDate(dayTime)
      ;(result.daily as Record<string, unknown>[]).push({
        label: dateStr === todayStr ? '今天' : weekdayLabel(dayTime),
        weatherDesc: weatherCodeMap[Math.round(wc[i])] ?? '未知',
        tempMax: tMax[i].toFixed(0),
        tempMin: tMin[i].toFixed(0),
        precipProb: pProb[i] ?? 0
      })
    }
  }

  settingsStore.set('weatherLastFetched', Date.now())
  settingsStore.set('weatherData', result)
  return result
}

/** 天气自动刷新（创建主窗口后调用） */
export function startWeatherAutoRefresh(): void {
  const ip = settingsStore.get('ip') as Record<string, unknown> | undefined
  if (!ip) return

  const lat = ip.lat as number | undefined
  const lon = ip.lon as number | undefined
  const city = (ip.city as string) || (ip.regionName as string) || ''
  if (!lat || !lon) return

  const refreshMin = (settingsStore.get('weatherRefreshInterval') as number) || DEFAULT_REFRESH_MIN
  const lastFetched = settingsStore.get('weatherLastFetched') as number | undefined

  // 先推送缓存数据
  const cached = settingsStore.get('weatherData') as Record<string, unknown> | undefined
  const mainWindow = getMainWindow()
  if (cached && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('weather-update', cached)
  }

  const doFetch = async (): Promise<void> => {
    try {
      const data = await fetchWeatherData(lat, lon, city)
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('weather-update', data)
      }
    } catch (err) {
      logger.error('Weather auto-refresh failed:', err)
    }
  }

  // 启动时检查是否需要立即拉取
  const shouldFetchNow = !lastFetched || Date.now() - lastFetched > 3 * 60 * 60 * 1000
  if (shouldFetchNow) {
    doFetch()
  }

  // 定时器
  if (weatherTimer) clearInterval(weatherTimer)
  weatherTimer = setInterval(doFetch, refreshMin * 60 * 1000)
}

/** 注册天气 IPC（手动刷新） */
export function registerWeatherIpc(): void {
  ipcMain.handle(
    'weather-get',
    async (_event, force?: boolean): Promise<Record<string, unknown>> => {
      if (!force) {
        const cached = settingsStore.get('weatherData') as Record<string, unknown> | undefined
        if (cached) return cached
      }

      let ip = settingsStore.get('ip') as Record<string, unknown> | undefined
      // 如果 IP 数据在初始化时没取到，尝试现场获取
      if (!ip) {
        try {
          ip = (await getIp()) as unknown as Record<string, unknown> | undefined
          if (ip) settingsStore.set('ip', ip)
        } catch {
          // getIp 失败（超时等），静默处理
        }
        if (!ip) return {}
      }
      const lat = ip.lat as number | undefined
      const lon = ip.lon as number | undefined
      const city = (ip.city as string) || (ip.regionName as string) || ''
      if (!lat || !lon) return {}
      return await fetchWeatherData(lat, lon, city)
    }
  )
}

/** 注册天气 IPC 并启动自动刷新（与 createMainWindow 原调用位置保持一致） */
export function setupWeather(): void {
  registerWeatherIpc()
  startWeatherAutoRefresh()
}
