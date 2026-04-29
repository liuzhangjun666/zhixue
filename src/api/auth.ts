import { request, unwrapData, AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from './http'

export interface AuthUser {
  id: number
  role: 'parent' | 'teacher'
  nickname: string
  phone: string
}

interface AuthResponse {
  user: AuthUser
  token: string
  tokenExpiresIn?: number
  tokenExpiresAt?: string
}

export const setAuthSession = (token: string, user: AuthUser) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
}

export const clearAuthSession = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  // Keep compatibility with legacy teacher token key.
  window.localStorage.removeItem('teacher_token')
}

export const getStoredUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const parentLogin = async (payload: { phone: string; password: string }) => {
  const res = await request('/api/auth/parent/login', { method: 'POST', body: payload })
  return unwrapData(res, {} as AuthResponse)
}

export const parentSendCode = async (phone: string) => {
  const res = await request('/api/auth/parent/send-code', { method: 'POST', body: { phone } })
  return unwrapData(res, { sent: false, ttlSeconds: 300, debugCode: '' as string | undefined })
}

export const parentRegister = async (payload: { phone: string; password: string; nickname: string; code: string }) => {
  const res = await request('/api/auth/parent/register', { method: 'POST', body: payload })
  return unwrapData(res, {} as AuthResponse)
}

export const teacherLogin = async (payload: { phone: string; password: string }) => {
  const res = await request('/api/teacher/auth/login', { method: 'POST', body: payload })
  return unwrapData(res, {} as AuthResponse)
}

export const teacherSendCode = async (phone: string) => {
  const res = await request('/api/teacher/auth/send-code', { method: 'POST', body: { phone } })
  return unwrapData(res, { sent: false, expireInSeconds: 300, debugCode: '' as string | undefined })
}

export const teacherRegister = async (payload: {
  phone: string
  password: string
  code: string
  nickname: string
  subject: string
  experience: string
  gender?: 'male' | 'female'
  teachingMethods?: string[]
  feeRange?: 'under_100' | '100_150' | '150_200' | 'over_200'
  school?: string
  inviteCode?: string
  certType?: 'teacher_license' | 'work_proof' | 'id_card'
  certUrl?: string
}) => {
  const res = await request('/api/teacher/auth/register', { method: 'POST', body: payload })
  return unwrapData(res, {} as AuthResponse)
}

export const getCurrentUser = async () => {
  const res = await request('/api/auth/me')
  return unwrapData(res, {} as AuthUser)
}

export const logout = async () => {
  try {
    await request('/api/auth/logout', { method: 'POST' })
  } finally {
    clearAuthSession()
  }
}
