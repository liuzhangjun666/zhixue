const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

const now = Date.now().toString()
const rand = Math.floor(Math.random() * 1000)
const suffix = `${now.slice(-7)}${rand}`.slice(0, 8)
const parentPhone = `13${suffix.padStart(9, '0')}`.slice(0, 11)
const teacherPhone = `15${suffix.padStart(9, '9')}`.slice(0, 11)
const password = 'Pass1234'

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.headers || {})
    },
    ...options
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

const assertOk = (result, path) => {
  if (result.status !== 200 || result.payload?.code !== 0) {
    throw new Error(`${path} expected success, got status=${result.status}, payload=${JSON.stringify(result.payload)}`)
  }
}

const assertUnauthorized = (result, path) => {
  const ok =
    result.status === 401 &&
    result.payload?.code === 401 &&
    result.payload?.message === 'Unauthorized' &&
    result.payload?.data === null
  if (!ok) {
    throw new Error(`${path} expected 401 Unauthorized format, got status=${result.status}, payload=${JSON.stringify(result.payload)}`)
  }
}

const assertForbidden = (result, path) => {
  const ok =
    result.status === 403 &&
    result.payload?.code === 403 &&
    result.payload?.message === 'Forbidden' &&
    result.payload?.data === null
  if (!ok) {
    throw new Error(`${path} expected 403 Forbidden format, got status=${result.status}, payload=${JSON.stringify(result.payload)}`)
  }
}

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
})

const run = async () => {
  console.log(`[smoke-core] API_BASE_URL=${API_BASE_URL}`)

  const parentRegister = await fetchJson('/api/auth/parent/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: parentPhone, password, nickname: 'Core家长' })
  })
  assertOk(parentRegister, '/api/auth/parent/register')
  console.log('[ok] parent register')

  const parentLogin = await fetchJson('/api/auth/parent/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: parentPhone, password })
  })
  assertOk(parentLogin, '/api/auth/parent/login')
  const parentToken = parentLogin.payload?.data?.token
  if (!parentToken) throw new Error('parent token missing after login')
  console.log('[ok] parent login')

  const parentMe = await fetchJson('/api/auth/me', { headers: authHeaders(parentToken) })
  assertOk(parentMe, '/api/auth/me (parent)')
  console.log('[ok] parent me')

  const parentProfile = await fetchJson('/api/parent/profile', { headers: authHeaders(parentToken) })
  assertOk(parentProfile, '/api/parent/profile')
  console.log('[ok] parent profile')

  const teacherRegister = await fetchJson('/api/auth/teacher/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: teacherPhone,
      password,
      nickname: 'Core老师',
      subject: '数学',
      experience: '2年'
    })
  })
  assertOk(teacherRegister, '/api/auth/teacher/register')
  console.log('[ok] teacher register')

  const teacherLogin = await fetchJson('/api/auth/teacher/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: teacherPhone, password })
  })
  assertOk(teacherLogin, '/api/auth/teacher/login')
  const teacherToken = teacherLogin.payload?.data?.token
  if (!teacherToken) throw new Error('teacher token missing after login')
  console.log('[ok] teacher login')

  const teacherMe = await fetchJson('/api/auth/me', { headers: authHeaders(teacherToken) })
  assertOk(teacherMe, '/api/auth/me (teacher)')
  console.log('[ok] teacher me')

  const teacherProfile = await fetchJson('/api/teacher/profile', { headers: authHeaders(teacherToken) })
  assertOk(teacherProfile, '/api/teacher/profile')
  console.log('[ok] teacher profile')

  const createRequest = await fetchJson('/api/parent/requests', {
    method: 'POST',
    headers: authHeaders(parentToken),
    body: JSON.stringify({
      title: 'Core 自动化请求',
      subject: '英语',
      grade: '三年级',
      budget: '200/小时',
      schedule: '周六上午'
    })
  })
  assertOk(createRequest, '/api/parent/requests [POST]')
  const requestId = Number(createRequest.payload?.data?.id || 0)
  if (!requestId) throw new Error('request id missing after create')
  console.log('[ok] parent create request')

  const requestList = await fetchJson('/api/parent/requests', { headers: authHeaders(parentToken) })
  assertOk(requestList, '/api/parent/requests [GET]')
  console.log('[ok] parent request list')

  const requestDetail = await fetchJson(`/api/parent/requests/${requestId}`, { headers: authHeaders(parentToken) })
  assertOk(requestDetail, '/api/parent/requests/:id')
  console.log('[ok] parent request detail')

  const meWithoutToken = await fetchJson('/api/auth/me')
  assertUnauthorized(meWithoutToken, '/api/auth/me without token')
  console.log('[ok] unauthorized check')

  const teacherAccessParent = await fetchJson('/api/parent/profile', { headers: authHeaders(teacherToken) })
  assertForbidden(teacherAccessParent, '/api/parent/profile with teacher token')
  console.log('[ok] teacher->parent forbidden check')

  const parentAccessTeacher = await fetchJson('/api/teacher/profile', { headers: authHeaders(parentToken) })
  assertForbidden(parentAccessTeacher, '/api/teacher/profile with parent token')
  console.log('[ok] parent->teacher forbidden check')

  console.log('[smoke-core] core flow passed')
}

run().catch((error) => {
  console.error('[smoke-core] core flow failed:', error.message)
  process.exit(1)
})
