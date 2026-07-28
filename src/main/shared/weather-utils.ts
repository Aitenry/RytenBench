// ============================================================================
// 天气工具公共模块 — weatherCodeMap、风向、地理编码、日期格式化
// 用于 chat tool (weather.ts) 和 widget (index.ts) 共享
// ============================================================================

/**
 * WMO 天气码 → 中文描述
 * @see https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 * @see https://github.com/symfony/ai-open-meteo-tool (官方实现参考)
 */
export const weatherCodeMap: Record<number, string> = {
  0: '晴天',
  1: '大部晴朗',
  2: '局部多云',
  3: '多云',
  45: '有雾',
  48: '冰雾',
  51: '小毛毛雨',
  53: '中毛毛雨',
  55: '大毛毛雨',
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

/** 度数 → 中文风向描述 */
export function windDirectionLabel(degrees: number): string {
  const codes = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
  ]
  const map: Record<string, string> = {
    N: '北风', NNE: '北东北风', NE: '东北风', ENE: '东东北风',
    E: '东风', ESE: '东东南风', SE: '东南风', SSE: '南东南风',
    S: '南风', SSW: '南西南风', SW: '西南风', WSW: '西西南风',
    W: '西风', WNW: '西西北风', NW: '西北风', NNW: '北西北风'
  }
  return map[codes[Math.round(degrees / 22.5) % 16]] ?? `${degrees.toFixed(0)}°`
}

/** 地理编码：地点名 → 经纬度候选列表 */
export async function geocodeLocation(
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

/** Date → "YYYY-MM-DD" */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Date → 周几中文 */
export function weekdayLabel(date: Date): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}
