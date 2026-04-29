const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL
export const API_BASE_URL = (rawApiBaseUrl ?? (import.meta.env.DEV ? '/api' : '')).trim()
export const AUTH_TOKEN_STORAGE_KEY = 'zhixue_auth_token'
export const AUTH_USER_STORAGE_KEY = 'zhixue_auth_user'

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: RequestMethod
  body?: unknown
  headers?: Record<string, string>
}

const trimSlash = (value: string) => value.replace(/\/+$/, '')
const stripLeadingSlash = (value: string) => value.replace(/^\/+/, '')

export const buildApiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path

  const normalizedPath = path.startsWith('/') ? path : `/${stripLeadingSlash(path)}`
  if (!API_BASE_URL) return normalizedPath

  const base = trimSlash(API_BASE_URL)
  if (/^https?:\/\//i.test(base)) {
    return `${base}${normalizedPath}`
  }

  const basePrefix = base.startsWith('/') ? base : `/${base}`
  if (normalizedPath === basePrefix || normalizedPath.startsWith(`${basePrefix}/`)) {
    return normalizedPath
  }
  return `${basePrefix}${normalizedPath}`
}

const tryParseJson = (text: string) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const clearAuthStorage = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_USER_STORAGE_KEY)
}

const redirectForUnauthorized = (roleHint = '') => {
  if (typeof window === 'undefined') return

  const path = window.location.pathname || '/'
  const authPages = new Set(['/login', '/register', '/teacher-auth'])
  if (authPages.has(path)) return

  const fallbackTeacherPath = path.startsWith('/teacher') ? '/teacher-auth' : '/login'
  const target = roleHint === 'teacher' ? '/teacher-auth' : fallbackTeacherPath
  if (path !== target) {
    window.location.replace(target)
  }
}

export const unwrapData = <T>(payload: unknown, fallback: T): T => {
  if (!payload || typeof payload !== 'object') return fallback
  if ('data' in payload) return (payload as { data: T }).data ?? fallback
  return payload as T
}

export const request = async <T = unknown>(path: string, options: RequestOptions = {}) => {
  const method = options.method || 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers || {})
  }
  const token =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
      : ''
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(buildApiUrl(path), {
    method,
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body)
  })

  const text = await response.text()
  const payload = tryParseJson(text)

  if (!response.ok) {
    if (response.status === 401) {
      let roleHint = ''
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY)
          if (raw) roleHint = String(JSON.parse(raw)?.role || '')
        } catch {}
      }
      clearAuthStorage()
      redirectForUnauthorized(roleHint)
    }
    const message =
      (payload && typeof payload === 'object' && 'message' in payload && String((payload as { message: unknown }).message)) ||
      `请求失败 (${response.status})`
    throw new Error(message)
  }

  return (payload as T) ?? ({} as T)
}
