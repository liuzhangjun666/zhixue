import { request, unwrapData } from './http'

export type TeachingMode = 'online' | 'offline' | 'both'

export interface DiscoverTeacherDTO {
  id: number
  teacherId: number
  name: string
  nickname: string
  avatar: string
  city: string
  district: string
  subjects: string[]
  grades: string[]
  experienceYears: number
  teachingMode: TeachingMode
  availableTimeText: string
  hourlyPriceMin: number | null
  hourlyPriceMax: number | null
  ratingAvg: number
  ratingCount: number
  intro: string
  gender?: 'male' | 'female'
  level?: 'gold' | 'silver' | 'bronze' | 'free'
  levelLabel?: string
  verified: boolean
  isActive: boolean
  updatedAt: string
  score: number
  reviewSummary?: {
    ratingAvg: number
    ratingCount: number
  }
}

export interface DiscoverTeacherQuery {
  keyword?: string
  subject?: string
  grade?: string
  city?: string
  gender?: string
  min_price?: string | number
  max_price?: string | number
  mode?: string
  min_rating?: string | number
  sort?: string
  page?: number
  page_size?: number
}

export interface DiscoverTeacherListDTO {
  list: DiscoverTeacherDTO[]
  total: number
  page: number
  pageSize: number
}

const toQueryString = (params: DiscoverTeacherQuery) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      search.set(key, String(value))
    }
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

const normalizeTeacher = (raw: Record<string, any>): DiscoverTeacherDTO => ({
  id: Number(raw.id || raw.teacherId || 0),
  teacherId: Number(raw.teacherId || raw.id || 0),
  name: String(raw.name || raw.teacherName || raw.nickname || '老师'),
  nickname: String(raw.nickname || ''),
  avatar: String(raw.avatar || ''),
  city: String(raw.city || ''),
  district: String(raw.district || ''),
  subjects: Array.isArray(raw.subjects) ? raw.subjects.map(String) : [],
  grades: Array.isArray(raw.grades) ? raw.grades.map(String) : [],
  experienceYears: Number(raw.experienceYears || 0),
  teachingMode: String(raw.teachingMode || 'both') as TeachingMode,
  availableTimeText: String(raw.availableTimeText || ''),
  hourlyPriceMin: raw.hourlyPriceMin === null || raw.hourlyPriceMin === undefined ? null : Number(raw.hourlyPriceMin),
  hourlyPriceMax: raw.hourlyPriceMax === null || raw.hourlyPriceMax === undefined ? null : Number(raw.hourlyPriceMax),
  ratingAvg: Number(raw.ratingAvg || 0),
  ratingCount: Number(raw.ratingCount || 0),
  intro: String(raw.intro || ''),
  gender: String(raw.gender || 'male') === 'female' ? 'female' : 'male',
  level: String(raw.level || 'free') as 'gold' | 'silver' | 'bronze' | 'free',
  levelLabel: String(raw.levelLabel || ''),
  verified: Boolean(raw.verified),
  isActive: raw.isActive !== false,
  updatedAt: String(raw.updatedAt || ''),
  score: Number(raw.score || 0),
  reviewSummary: raw.reviewSummary
})

export const discoverApi = {
  async getTeachers(params: DiscoverTeacherQuery = {}) {
    const payload = await request(`/api/discover/teachers${toQueryString(params)}`)
    const data = unwrapData(payload, { list: [], total: 0, page: 1, pageSize: 12 } as any)
    return {
      list: Array.isArray(data.list) ? data.list.map(normalizeTeacher) : [],
      total: Number(data.total || 0),
      page: Number(data.page || 1),
      pageSize: Number(data.pageSize || data.page_size || 12)
    } as DiscoverTeacherListDTO
  },

  async getTeacherDetail(teacherId: number) {
    const payload = await request(`/api/discover/teachers/${teacherId}`)
    return normalizeTeacher(unwrapData(payload, {} as Record<string, any>))
  },

  async contactTeacher(teacherId: number) {
    const payload = await request(`/api/discover/teachers/${teacherId}/contact`, { method: 'POST' })
    return unwrapData(payload, {
      conversationId: 0,
      teacherId,
      remainingUnlock: 0,
      unlimitedUnlock: false,
      contact: { phone: '', wechat: '', nickname: '' }
    } as {
      conversationId: number
      teacherId: number
      remainingUnlock: number
      unlimitedUnlock: boolean
      contact: { phone: string; wechat: string; nickname: string }
    })
  }
}
