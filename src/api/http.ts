export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
).trim()
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
  if (!API_BASE_URL) return path
  return `${trimSlash(API_BASE_URL)}/${stripLeadingSlash(path)}`
}

const tryParseJson = (text: string) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
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
    const message =
      (payload && typeof payload === 'object' && 'message' in payload && String((payload as { message: unknown }).message)) ||
      `请求失败 (${response.status})`
    throw new Error(message)
  }

  return (payload as T) ?? ({} as T)
}
