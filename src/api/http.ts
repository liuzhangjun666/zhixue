const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
).trim()

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: RequestMethod
  body?: unknown
  headers?: Record<string, string>
}

const trimSlash = (value: string) => value.replace(/\/+$/, '')
const stripLeadingSlash = (value: string) => value.replace(/^\/+/, '')

const buildUrl = (path: string) => {
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

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (!isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(buildUrl(path), {
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
