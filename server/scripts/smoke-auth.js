const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

const suffix = String(Date.now() + Math.floor(Math.random() * 1000000)).slice(-9)
const parentPhone = `13${suffix.padStart(9, '0')}`.slice(0, 11)
const teacherPhone = `15${suffix.padStart(9, '9')}`.slice(0, 11)
const password = 'Pass1234'

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    ...options
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.message || `HTTP ${response.status}`
    throw new Error(`${path} failed: ${message}`)
  }
  if (payload?.code !== 0) {
    throw new Error(`${path} business failed: ${payload?.message || 'unknown'}`)
  }
  return payload
}

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
})

const run = async () => {
  console.log(`[smoke] API_BASE_URL=${API_BASE_URL}`)

  const parentSendCode = await requestJson('/api/auth/parent/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: parentPhone })
  })
  const parentCode = String(parentSendCode.data?.debugCode || '')
  if (!parentCode) throw new Error('parent debug code missing')
  console.log('[ok] parent send code')

  const parentRegister = await requestJson('/api/auth/parent/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: parentPhone, password, nickname: 'Smoke家长', code: parentCode })
  })
  console.log('[ok] parent register')

  const parentLogin = await requestJson('/api/auth/parent/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: parentPhone, password })
  })
  console.log('[ok] parent login')

  const parentToken = parentLogin.data?.token || parentRegister.data?.token
  if (!parentToken) throw new Error('parent token missing')

  await requestJson('/api/auth/me', { headers: authHeaders(parentToken) })
  console.log('[ok] parent me')

  await requestJson('/api/parent/profile', { headers: authHeaders(parentToken) })
  console.log('[ok] parent profile')

  const teacherSendCode = await requestJson('/api/teacher/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: teacherPhone })
  })
  const teacherCode = String(teacherSendCode.data?.debugCode || '')
  if (!teacherCode) throw new Error('teacher debug code missing')
  console.log('[ok] teacher send code')

  const teacherRegister = await requestJson('/api/auth/teacher/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: teacherPhone,
      password,
      code: teacherCode,
      nickname: 'Smoke老师',
      subject: '数学',
      experience: '2年'
    })
  })
  console.log('[ok] teacher register')

  const teacherLogin = await requestJson('/api/auth/teacher/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: teacherPhone, password })
  })
  console.log('[ok] teacher login')

  const teacherToken = teacherLogin.data?.token || teacherRegister.data?.token
  if (!teacherToken) throw new Error('teacher token missing')

  await requestJson('/api/auth/me', { headers: authHeaders(teacherToken) })
  console.log('[ok] teacher me')

  await requestJson('/api/teacher/profile', { headers: authHeaders(teacherToken) })
  console.log('[ok] teacher profile')

  console.log('[smoke] auth flow passed')
}

run().catch((error) => {
  console.error('[smoke] auth flow failed:', error.message)
  process.exit(1)
})
