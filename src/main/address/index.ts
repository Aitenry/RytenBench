import axios from 'axios'

interface IpApiResponse {
  status: string
  country: string
  countryCode: string
  region: string
  regionName: string
  city: string
  zip: string
  lat: number
  lon: number
  timezone: string
  isp: string
  org: string
  as: string
  query: string
}

export const getIp = async (): Promise<IpApiResponse> => {
  try {
    const response = await axios.get('http://ip-api.com/json/?lang=zh-CN', {
      timeout: 3000
    })
    return response.data
  } catch (error) {
    console.error('Error fetching IP data:', error)
    throw error
  }
}
