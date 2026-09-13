import { getMainLanguage } from './index'

/**
 * 天气工具（get_weather）的返回文案——**会渲染在聊天的工具调用卡片上**，因此跟随界面语言。
 *
 * 与 `messages.ts` 的 `weather` 分工：那边是底栏天气组件（主进程把缓存下发给渲染层前用它
 * 渲染 weatherDesc / label）；这里是工具把手里的结果告诉用户的话术，含天气码、风向、周几
 * 三张词表——`shared/weather-utils.ts` 的 weatherCodeMap / windDirectionLabel / weekdayLabel
 * 是这一路的旧中文表，只服务于主进程缓存的历史字段。
 *
 * 中文是源语言，`enUSWeatherToolTexts` 用 `typeof` 约束，缺键/多键都是编译期错误。
 * 插值统一 `{{name}}`，由 `mainFormat` 替换（中英句式不同，占位符顺序由词条决定）。
 */
export const zhCNWeatherToolTexts = {
  // ----- 地点 -----
  /** 地理编码没命中 */
  notFound: '未找到地点 "{{location}}" 的天气信息。',
  /** 首选地点显示名：中文用全角顿号与括号，英文用半角逗号与括号 */
  locationWithAdmin: '{{name}}，{{admin1}}（{{country}}）',
  location: '{{name}}（{{country}}）',
  /** 其他匹配地点（原本就是半角逗号，中英同形） */
  otherLocations: '\n**其他匹配地点：**',
  otherLocationWithAdmin: '  - {{name}}, {{admin1}}, {{country}}',
  otherLocation: '  - {{name}}, {{country}}',

  // ----- 当前实况 -----
  currentHeader: '**当前实况**',
  condition: '  天气：{{condition}}',
  temperature: '  气温：{{temp}}°C（体感 {{apparent}}°C）',
  humidity: '  湿度：{{humidity}}%',
  wind: '  风速：{{speed}} km/h {{direction}}',

  // ----- 未来预报 -----
  forecastHeader: '**未来 {{days}} 天预报**\n',
  today: '今天',
  daily:
    '  **{{date}} {{label}}**：{{condition}}，{{min}}～{{max}}°C（体感 {{feelsMin}}～{{feelsMax}}°C），降水量 {{precip}}mm（概率 {{prob}}%），风速 {{speed}}km/h {{direction}}',

  /** 天气码不在词表里时的兜底（weatherCodeLabel 用） */
  unknownCode: '天气码 {{code}}',

  /** WMO 天气码 → 描述（28 条，与 shared/weather-utils.ts 的 weatherCodeMap 同集） */
  codes: {
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
  },

  /** 16 方位缩写 → 风向描述 */
  windDirections: {
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
  },

  /** Date.getDay() 键（0 = 周日）→ 周几 */
  weekdays: {
    sun: '周日',
    mon: '周一',
    tue: '周二',
    wed: '周三',
    thu: '周四',
    fri: '周五',
    sat: '周六'
  }
}

export const enUSWeatherToolTexts: typeof zhCNWeatherToolTexts = {
  notFound: 'No weather information found for "{{location}}".',
  locationWithAdmin: '{{name}}, {{admin1}} ({{country}})',
  location: '{{name}} ({{country}})',
  otherLocations: '\n**Other matching locations:**',
  otherLocationWithAdmin: '  - {{name}}, {{admin1}}, {{country}}',
  otherLocation: '  - {{name}}, {{country}}',

  currentHeader: '**Current conditions**',
  condition: '  Condition: {{condition}}',
  temperature: '  Temperature: {{temp}}°C (feels like {{apparent}}°C)',
  humidity: '  Humidity: {{humidity}}%',
  wind: '  Wind: {{speed}} km/h {{direction}}',

  forecastHeader: '**{{days}}-day forecast**\n',
  today: 'Today',
  daily:
    '  **{{date}} {{label}}**: {{condition}}, {{min}}-{{max}}°C (feels like {{feelsMin}}-{{feelsMax}}°C), precipitation {{precip}}mm ({{prob}}% chance), wind {{speed}}km/h {{direction}}',

  unknownCode: 'Weather code {{code}}',

  codes: {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  },

  windDirections: {
    N: 'North',
    NNE: 'North-northeast',
    NE: 'Northeast',
    ENE: 'East-northeast',
    E: 'East',
    ESE: 'East-southeast',
    SE: 'Southeast',
    SSE: 'South-southeast',
    S: 'South',
    SSW: 'South-southwest',
    SW: 'Southwest',
    WSW: 'West-southwest',
    W: 'West',
    WNW: 'West-northwest',
    NW: 'Northwest',
    NNW: 'North-northwest'
  },

  weekdays: {
    sun: 'Sun',
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat'
  }
}

export function getWeatherToolTexts(): typeof zhCNWeatherToolTexts {
  return getMainLanguage() === 'en-US' ? enUSWeatherToolTexts : zhCNWeatherToolTexts
}
