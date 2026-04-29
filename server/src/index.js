import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import pool from './db.js'

const app = express()
const httpServer = createServer(app)

const PORT = Number(process.env.PORT || 8000)
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'zhixue-dev-secret-change-me'
const AUTH_TOKEN_EXPIRES_IN_SECONDS = Number(process.env.AUTH_TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 7)
const TEACHER_SMS_CODE_EXPIRES_MS = Number(process.env.TEACHER_SMS_CODE_EXPIRES_MS || 5 * 60 * 1000)
const teacherSmsCodeStore = new Map()

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
})

app.use(express.json({ limit: '2mb' }))

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Access-Control-Allow-Credentials', 'true')
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

const ok = (res, data) => res.json({ code: 0, message: 'ok', data })
const fail = (res, status, message) => res.status(status).json({ code: status, message })

const toBase64Url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const fromBase64Url = (input) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : ''
  return Buffer.from(normalized + padding, 'base64').toString('utf8')
}

const signTokenPayload = (payloadBase64) =>
  toBase64Url(crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payloadBase64).digest())

const createAuthToken = (user) => {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    id: user.id,
    role: user.role,
    exp: now + AUTH_TOKEN_EXPIRES_IN_SECONDS
  }
  const payloadBase64 = toBase64Url(JSON.stringify(payload))
  const signature = signTokenPayload(payloadBase64)
  return `${payloadBase64}.${signature}`
}

const verifyAuthToken = (token) => {
  if (!token || typeof token !== 'string') return null
  const [payloadBase64, signature] = token.split('.')
  if (!payloadBase64 || !signature) return null

  const expected = signTokenPayload(payloadBase64)
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) return null
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null

  try {
    const payload = JSON.parse(fromBase64Url(payloadBase64))
    if (!payload?.id || !payload?.role || !payload?.exp) return null
    const now = Math.floor(Date.now() / 1000)
    if (now >= Number(payload.exp)) return null
    return { id: Number(payload.id), role: String(payload.role) }
  } catch {
    return null
  }
}

const getBearerToken = (req) => {
  const value = req.headers.authorization || ''
  if (!value.toLowerCase().startsWith('bearer ')) return ''
  return value.slice(7).trim()
}

const authRequired = (requiredRole = '') => (req, res, next) => {
  const token = getBearerToken(req)
  const user = verifyAuthToken(token)
  if (!user) return fail(res, 401, 'Unauthorized')
  if (requiredRole && user.role !== requiredRole) return fail(res, 403, 'Forbidden')
  req.user = user
  next()
}

const adminRequired = (req, res, next) => {
  const token = getBearerToken(req)
  const user = verifyAuthToken(token)
  if (!user) return fail(res, 401, 'Unauthorized')

  const adminKey = String(process.env.ADMIN_REVIEW_KEY || '')
  const headerKey = String(req.headers['x-admin-key'] || '')
  if ((adminKey && headerKey === adminKey) || Number(user.id) === 1) {
    req.user = user
    return next()
  }
  return fail(res, 403, 'Forbidden')
}

const parseArrayField = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return value
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

const parseObjectField = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

const getUserById = async (id) => {
  const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
  return users[0] || null
}

const getUnreadMessageCount = async (userId) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE (c.parent_id = ? OR c.teacher_id = ?)
       AND m.sender_id != ?
       AND m.is_read = FALSE`,
    [userId, userId, userId]
  )
  return Number(rows[0]?.count || 0)
}

const emitUnreadMessageCount = async (userId) => {
  const count = await getUnreadMessageCount(userId)
  io.to(`user_${Number(userId)}`).emit('messages:unread-count', { count })
  return count
}

const getTeacherInfo = async (userId) => {
  const user = await getUserById(userId)
  if (!user || user.role !== 'teacher') return null
  return user
}

const getTeacherComplaintNotices = async (teacherUserId) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, content, status, result, appeal_status, appealed_at, created_at, updated_at
       FROM complaints
       WHERE respondent_id = ?
       ORDER BY COALESCE(updated_at, created_at) DESC
       LIMIT 50`,
      [teacherUserId]
    )
    return rows.map((item) => {
      const appealStatus = String(item.appeal_status || 'none')
      const status = String(item.status || 'pending')
      const hasAppealed = Boolean(item.appealed_at) || appealStatus !== 'none'
      return {
        id: Number(item.id),
        title: '收到投诉',
        type: String(item.type || 'other'),
        status,
        result: String(item.result || ''),
        appealStatus,
        hasAppealed,
        appealable: !hasAppealed && ['processing', 'resolved', 'rejected'].includes(status),
        content: String(item.content || ''),
        createdAt: item.updated_at ? new Date(item.updated_at).toISOString() : new Date(item.created_at).toISOString()
      }
    })
  } catch (error) {
    if (String(error?.code || '') === 'ER_NO_SUCH_TABLE') return []
    throw error
  }
}

const buildAuthPayload = (user) => ({
  user: {
    id: user.id,
    role: user.role,
    nickname: user.nickname,
    phone: user.phone
  },
  token: createAuthToken(user)
})

const normalizePhone = (value) => String(value || '').trim()
const isValidMainlandPhone = (value) => /^1\d{10}$/.test(value)

const generateSmsCode = () => String(Math.floor(Math.random() * 900000) + 100000)
const generateInviteCode = () => `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`

const issueTeacherSmsCode = (phone) => {
  const code = generateSmsCode()
  const now = Date.now()
  teacherSmsCodeStore.set(phone, { code, expiresAt: now + TEACHER_SMS_CODE_EXPIRES_MS })
  return code
}

const verifyTeacherSmsCode = (phone, code) => {
  const record = teacherSmsCodeStore.get(phone)
  if (!record) return { ok: false, reason: '请先获取验证码' }
  if (Date.now() > Number(record.expiresAt || 0)) {
    teacherSmsCodeStore.delete(phone)
    return { ok: false, reason: '验证码已过期，请重新获取' }
  }
  if (String(record.code || '') !== String(code || '').trim()) {
    return { ok: false, reason: '验证码错误' }
  }
  teacherSmsCodeStore.delete(phone)
  return { ok: true, reason: '' }
}

const parseExperienceYears = (value) => {
  const text = String(value || '')
  const matched = text.match(/\d+/)
  if (!matched) return 0
  return Math.max(0, Number(matched[0] || 0))
}

const parseBudgetRange = (budgetText) => {
  const nums = String(budgetText || '')
    .match(/\d+(?:\.\d+)?/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
  if (!nums || nums.length === 0) return { min: 0, max: Number.POSITIVE_INFINITY }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) }
}

const getCurrentWeekNumber = () => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), 0, 1)
  const dayOffset = Math.floor((now - firstDay) / (24 * 60 * 60 * 1000))
  return Math.ceil((dayOffset + firstDay.getDay() + 1) / 7)
}

const feeRangeToBudgetRange = (feeRange) => {
  const map = {
    under_100: { min: 0, max: 100 },
    '100_150': { min: 100, max: 150 },
    '150_200': { min: 150, max: 200 },
    over_200: { min: 200, max: Number.POSITIVE_INFINITY }
  }
  return map[String(feeRange || '')] || { min: 100, max: 150 }
}

const hasIntersection = (arrA, arrB) => {
  const setA = new Set((arrA || []).map((item) => String(item)))
  return (arrB || []).some((item) => setA.has(String(item)))
}

const normalizeStyle = (text) => String(text || '').trim().toLowerCase()

const styleSimilarityScore = (teacherStyle, parentStyle) => {
  const a = normalizeStyle(teacherStyle)
  const b = normalizeStyle(parentStyle)
  if (!a || !b) return 50
  if (a === b) return 100
  const nearby = [
    ['strict', 'guiding'],
    ['gentle', 'guiding'],
    ['flexible', 'guiding']
  ]
  if (nearby.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) return 50
  return 0
}

const normalizeCityKeyword = (value) =>
  String(value || '')
    .replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔|自治州|地区|盟/g, '')
    .trim()

const getCityPrefix = (value) => normalizeCityKeyword(value).slice(0, 2)

const evaluateCandidate = (ctx) => {
  const {
    request,
    parentProfile,
    teacherProfile,
    strictStyle = true,
    strictCity = true
  } = ctx

  const requestBudgetRange = parseBudgetRange(request.budget || '')
  const teacherBudgetRange = feeRangeToBudgetRange(teacherProfile.fee_range || '')

  const parentCity = String(parentProfile?.city || '')
  const teacherCity = String(teacherProfile.city || '')
  const parentDistrict = String(parentProfile?.district || '')
  const teacherDistrict = String(teacherProfile.district || '')

  const sameCity = Boolean(parentCity && teacherCity && parentCity === teacherCity)
  const samePrefecture = Boolean(parentCity && teacherCity && getCityPrefix(parentCity) === getCityPrefix(teacherCity))
  const districtMatched = Boolean(parentDistrict && teacherDistrict && parentDistrict === teacherDistrict)

  const cityMatched = strictCity ? sameCity : sameCity || samePrefecture
  const cityScore = districtMatched ? 100 : cityMatched ? 70 : 0
  const subjectScore = hasIntersection(parseArrayField(teacherProfile.subjects), [request.subject]) ? 100 : 0
  const gradeScore = hasIntersection(parseArrayField(teacherProfile.grades), [request.grade]) ? 100 : 0

  const parentStyle = String(parentProfile?.teaching_style_preference || '')
  const rawStyleScore = styleSimilarityScore(teacherProfile.teaching_style, parentStyle)
  const styleScore = strictStyle ? rawStyleScore : Math.max(rawStyleScore, 50)

  const genderPref = String(parentProfile?.teacher_gender_preference || 'any')
  const genderMatched = genderPref === 'any' || !genderPref || genderPref === String(teacherProfile.gender || 'male')
  const genderScore = genderMatched ? 100 : 0

  const budgetMatched = teacherBudgetRange.max >= requestBudgetRange.min && teacherBudgetRange.min <= requestBudgetRange.max
  const budgetScore = budgetMatched ? 100 : 0

  const score =
    cityScore * 0.25 +
    subjectScore * 0.25 +
    gradeScore * 0.15 +
    styleScore * 0.15 +
    genderScore * 0.1 +
    budgetScore * 0.1

  const tips = []
  if (!budgetMatched) tips.push('预算需协商')
  if (!genderMatched) tips.push('性别不符')

  return {
    score: Math.round(score * 100) / 100,
    tips
  }
}

const computeMatchScore = (ctx) => evaluateCandidate(ctx).score

const buildCandidatesForLevel = ({ request, parentProfile, teachers, strictStyle, strictCity, includeZeroScore = false }) =>
  teachers
    .map((teacher) => {
      const evaluated = evaluateCandidate({
        request,
        parentProfile,
        teacherProfile: teacher,
        strictStyle,
        strictCity
      })
      return {
        teacher,
        score: evaluated.score,
        tips: evaluated.tips
      }
    })
    .filter((item) => (includeZeroScore ? item.score >= 0 : item.score > 0))
    .sort((a, b) => b.score - a.score)

const selectMatchCandidates = ({ request, parentProfile, teachers }) => {
  const strictCandidates = buildCandidatesForLevel({
    request,
    parentProfile,
    teachers,
    strictStyle: true,
    strictCity: true
  })
  if (strictCandidates.length >= 2) {
    return strictCandidates.slice(0, 3).map((item) => ({ ...item, degradeLevel: 0, tips: item.tips }))
  }

  const styleRelaxedCandidates = buildCandidatesForLevel({
    request,
    parentProfile,
    teachers,
    strictStyle: false,
    strictCity: true
  })
  if (styleRelaxedCandidates.length >= 2) {
    return styleRelaxedCandidates.slice(0, 3).map((item) => ({ ...item, degradeLevel: 1, tips: item.tips }))
  }

  const cityRelaxedCandidates = buildCandidatesForLevel({
    request,
    parentProfile,
    teachers,
    strictStyle: false,
    strictCity: false,
    includeZeroScore: true
  })

  return cityRelaxedCandidates.slice(0, 2).map((item) => ({
    ...item,
    degradeLevel: 2,
    tips: Array.from(new Set([...item.tips, '当前区域匹配对象较少']))
  }))
}

const saveMatchCandidates = async ({ request, weekNumber, candidates }) => {
  let generated = 0
  for (const item of candidates) {
    await pool.query(
      `INSERT INTO matches
       (teacher_id, parent_id, request_id, match_score, status, parent_accept_status, teacher_accept_status, unlock_granted, feedback_submitted, rematch_count, feedback_reason, degrade_level, match_tips, week_number)
       VALUES (?, ?, ?, ?, 'new', 'pending', 'pending', 0, 0, 0, '', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         match_score = VALUES(match_score),
         status = 'new',
         parent_accept_status = 'pending',
         teacher_accept_status = 'pending',
         unlock_granted = 0,
         feedback_submitted = 0,
         feedback_reason = '',
         degrade_level = VALUES(degrade_level),
         match_tips = VALUES(match_tips),
         last_feedback_at = NULL,
         matched_at = NOW()`,
      [
        Number(item.teacher.user_id),
        Number(request.parent_id),
        Number(request.id),
        Number(item.score),
        Number(item.degradeLevel || 0),
        JSON.stringify(Array.isArray(item.tips) ? item.tips : []),
        weekNumber
      ]
    )
    generated += 1
  }
  return generated
}

const runWeeklyMatching = async () => {
  const weekNumber = getCurrentWeekNumber()
  const [requests] = await pool.query(
    `SELECT r.id, r.parent_id, r.subject, r.grade, r.budget
     FROM requests r
     WHERE r.status IN ('pending', 'matching')`
  )
  const [teachers] = await pool.query(
    `SELECT u.id AS user_id, u.city AS user_city, tp.*
     FROM users u
     JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE u.role = 'teacher' AND COALESCE(tp.verify_status, 'pending') = 'approved'`
  )
  let parents = []
  try {
    const [parentRows] = await pool.query(
      `SELECT user_id, city, district, teaching_style_preference, teacher_gender_preference
       FROM parent_profiles`
    )
    parents = parentRows
  } catch (error) {
    if (String(error?.code || '') !== 'ER_NO_SUCH_TABLE') throw error
  }
  const parentProfileMap = parents.reduce((acc, item) => {
    acc[Number(item.user_id)] = item
    return acc
  }, {})

  let generated = 0
  for (const reqRow of requests) {
    const parentProfile = parentProfileMap[Number(reqRow.parent_id)] || {}
    const selectedCandidates = selectMatchCandidates({
      request: reqRow,
      parentProfile,
      teachers
    })
    generated += await saveMatchCandidates({
      request: reqRow,
      weekNumber,
      candidates: selectedCandidates
    })
  }

  return { weekNumber, requestCount: requests.length, generated }
}

const generateMatchesForRequest = async (requestId, opts = {}) => {
  const excludedTeacherIds = Array.isArray(opts.excludedTeacherIds) ? opts.excludedTeacherIds.map((id) => Number(id)) : []
  const weekNumber = getCurrentWeekNumber()
  const [requests] = await pool.query(
    `SELECT r.id, r.parent_id, r.subject, r.grade, r.budget
     FROM requests r
     WHERE r.id = ?
     LIMIT 1`,
    [Number(requestId)]
  )
  if (!requests.length) return { generated: 0 }
  const reqRow = requests[0]

  const [teachers] = await pool.query(
    `SELECT u.id AS user_id, u.city AS user_city, tp.*
     FROM users u
     JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE u.role = 'teacher' AND COALESCE(tp.verify_status, 'pending') = 'approved'`
  )
  const availableTeachers = teachers.filter((item) => !excludedTeacherIds.includes(Number(item.user_id)))
  let parents = []
  try {
    const [parentRows] = await pool.query(
      `SELECT user_id, city, district, teaching_style_preference, teacher_gender_preference
       FROM parent_profiles
       WHERE user_id = ?`,
      [Number(reqRow.parent_id)]
    )
    parents = parentRows
  } catch (error) {
    if (String(error?.code || '') !== 'ER_NO_SUCH_TABLE') throw error
  }
  const parentProfile = parents[0] || {}

  const selectedCandidates = selectMatchCandidates({
    request: reqRow,
    parentProfile,
    teachers: availableTeachers
  })

  const generated = await saveMatchCandidates({
    request: reqRow,
    weekNumber,
    candidates: selectedCandidates
  })

  return { generated }
}

const registerTeacherAccount = async (payload) => {
  const phone = normalizePhone(payload?.phone)
  const password = String(payload?.password || '')
  const nickname = String(payload?.nickname || '').trim()
  const subject = String(payload?.subject || '').trim()
  const experience = String(payload?.experience || '').trim()
  const city = String(payload?.city || '').trim()
  const code = String(payload?.code || '').trim()
  const certType = String(payload?.certType || '').trim()
  const certUrl = String(payload?.certUrl || '').trim()
  const gender = String(payload?.gender || 'male').trim() === 'female' ? 'female' : 'male'
  const teachingMethods = Array.isArray(payload?.teachingMethods) ? payload.teachingMethods : []
  const feeRange = ['under_100', '100_150', '150_200', 'over_200'].includes(String(payload?.feeRange || ''))
    ? String(payload?.feeRange || '')
    : '100_150'
  const school = String(payload?.school || '').trim()
  const inviteCode = String(payload?.inviteCode || '').trim().toUpperCase()

  if (!phone || !password || !nickname) {
    return { ok: false, status: 400, message: 'phone, password and nickname are required' }
  }
  if (!isValidMainlandPhone(phone)) {
    return { ok: false, status: 400, message: '请输入正确的手机号' }
  }
  if (password.length < 6) {
    return { ok: false, status: 400, message: 'password must be at least 6 chars' }
  }
  if (!code) {
    return { ok: false, status: 400, message: 'code is required' }
  }
  const codeCheck = verifyTeacherSmsCode(phone, code)
  if (!codeCheck.ok) {
    return { ok: false, status: 400, message: codeCheck.reason }
  }

  const [exists] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone])
  if (exists.length) {
    return { ok: false, status: 409, message: '手机号已注册' }
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const preferredSubjects = subject ? [subject] : []
  const [result] = await pool.query(
    `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects, wechat)
     VALUES ('teacher', ?, ?, ?, ?, ?, '', ?, '')`,
    [nickname, phone, passwordHash, city, experience, JSON.stringify(preferredSubjects)]
  )

  const userId = result.insertId
  await pool.query(
    `INSERT INTO teacher_profiles
     (user_id, real_name, gender, city, district, subjects, grades, experience_years, teaching_methods, fee_range, school, teaching_style, student_type, areas, intro, verified, verify_status, verify_remark)
     VALUES (?, ?, ?, ?, '', ?, '[]', ?, ?, ?, ?, '', '', '[]', ?, 0, 'pending', '')`,
    [
      userId,
      nickname,
      gender,
      city,
      JSON.stringify(preferredSubjects),
      parseExperienceYears(experience),
      JSON.stringify(teachingMethods),
      feeRange,
      school,
      experience
    ]
  )

  if (certType && certUrl && ['teacher_license', 'work_proof', 'id_card'].includes(certType)) {
    await pool.query(
      `INSERT INTO teacher_verifications (user_id, cert_type, cert_url, status, review_remark)
       VALUES (?, ?, ?, 'pending', '')`,
      [userId, certType, certUrl]
    )
  }

  if (inviteCode) {
    try {
      await pool.query(
        `UPDATE invite_records
         SET invitee_id = ?, status = 'verified'
         WHERE invite_code = ? AND role = 'teacher' AND (invitee_id IS NULL OR invitee_id = ?)`,
        [userId, inviteCode, userId]
      )
    } catch (error) {
      if (String(error?.code || '') !== 'ER_NO_SUCH_TABLE') throw error
    }
  }

  return {
    ok: true,
    status: 200,
    data: {
      reviewStatus: 'pending',
      userId,
      submittedAt: new Date().toISOString()
    },
    message: '入驻资料已提交，等待审核'
  }
}

const loginTeacherAccount = async (payload) => {
  const phone = normalizePhone(payload?.phone)
  const password = String(payload?.password || '')
  if (!phone || !password) {
    return { ok: false, status: 400, message: 'phone and password are required' }
  }
  if (!isValidMainlandPhone(phone)) {
    return { ok: false, status: 400, message: '请输入正确的手机号' }
  }

  const [users] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = ? LIMIT 1', [phone, 'teacher'])
  const user = users[0]
  if (!user) return { ok: false, status: 401, message: '手机号或密码错误' }

  const matched = await bcrypt.compare(password, user.password_hash || '')
  if (!matched) return { ok: false, status: 401, message: '手机号或密码错误' }

  const [profiles] = await pool.query('SELECT verify_status FROM teacher_profiles WHERE user_id = ? LIMIT 1', [user.id])
  const verifyStatus = String(profiles[0]?.verify_status || '')
  if (verifyStatus === 'rejected') {
    return { ok: false, status: 403, message: '认证未通过，请补充资料后重新提交' }
  }
  if (verifyStatus && verifyStatus !== 'approved') {
    return { ok: false, status: 403, message: '资料审核中，预计 1-3 个工作日' }
  }

  return { ok: true, status: 200, data: buildAuthPayload(user), message: '登录成功' }
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    ok(res, { status: 'up', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    fail(res, 500, 'Database connection failed')
  }
})

app.post('/api/auth/parent/register', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const nickname = String(req.body?.nickname || '').trim()
  if (!phone || !password || !nickname) return fail(res, 400, 'phone, password and nickname are required')
  if (password.length < 6) return fail(res, 400, 'password must be at least 6 chars')

  try {
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone])
    if (exists.length) return fail(res, 409, '手机号已注册')

    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
       VALUES ('parent', ?, ?, ?, '', '', '', '[]')`,
      [nickname, phone, passwordHash]
    )

    const user = await getUserById(result.insertId)
    ok(res, buildAuthPayload(user), '注册成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/parent/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  if (!phone || !password) return fail(res, 400, 'phone and password are required')

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = ? LIMIT 1', [phone, 'parent'])
    const user = users[0]
    if (!user) return fail(res, 401, '手机号或密码错误')

    const matched = await bcrypt.compare(password, user.password_hash || '')
    if (!matched) return fail(res, 401, '手机号或密码错误')
    ok(res, buildAuthPayload(user), '登录成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/teacher/register', async (req, res) => {
  try {
    const result = await registerTeacherAccount(req.body || {})
    if (!result.ok) return fail(res, result.status, result.message)
    ok(res, result.data, result.message)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/teacher/login', async (req, res) => {
  try {
    const result = await loginTeacherAccount(req.body || {})
    if (!result.ok) return fail(res, result.status, result.message)
    ok(res, result.data, result.message)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/auth/me', authRequired(), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) return fail(res, 404, 'User not found')
    ok(
      res,
      {
        id: user.id,
        role: user.role,
        nickname: user.nickname,
        phone: user.phone,
        city: user.city,
        bio: user.bio,
        avatar: user.avatar || ''
      },
      'ok'
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/logout', (_req, res) => {
  ok(res, { success: true }, '退出成功')
})

app.post('/api/teacher/auth/send-code', async (req, res) => {
  const phone = normalizePhone(req.body?.phone)
  if (!phone) return fail(res, 400, 'phone is required')
  if (!isValidMainlandPhone(phone)) return fail(res, 400, '请输入正确的手机号')

  const code = issueTeacherSmsCode(phone)
  const data = {
    sent: true,
    expireInSeconds: Math.floor(TEACHER_SMS_CODE_EXPIRES_MS / 1000)
  }
  if (process.env.NODE_ENV !== 'production') {
    data.debugCode = code
  }
  ok(res, data, '验证码已发送')
})

app.post('/api/teacher/auth/register', async (req, res) => {
  try {
    const result = await registerTeacherAccount(req.body || {})
    if (!result.ok) return fail(res, result.status, result.message)
    ok(res, result.data, result.message)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/auth/login', async (req, res) => {
  try {
    const result = await loginTeacherAccount(req.body || {})
    if (!result.ok) return fail(res, result.status, result.message)
    ok(res, result.data, result.message)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/auth/logout', authRequired('teacher'), (_req, res) => {
  ok(res, { success: true }, '退出成功')
})

app.get('/api/teacher/auth/me', authRequired('teacher'), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) return fail(res, 404, 'Teacher not found')
    ok(res, {
      id: user.id,
      role: user.role,
      nickname: user.nickname,
      phone: user.phone,
      city: user.city,
      bio: user.bio,
      avatar: user.avatar || ''
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/profile', authRequired('parent'), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) return fail(res, 404, 'User not found')

    const [children] = await pool.query('SELECT * FROM children WHERE parent_id = ?', [req.user.id])

    ok(res, {
      parentName: user.nickname,
      phone: user.phone,
      city: user.city,
      bio: user.bio,
      avatar: user.avatar,
      preferredGrade: user.preferred_grade,
      preferredSubjects: parseArrayField(user.preferred_subjects),
      children: children.map((c) => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        targetSubject: c.target_subject
      }))
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/profile', authRequired('parent'), async (req, res) => {
  const payload = req.body || {}
  if (!payload.parentName || !payload.phone) return fail(res, 400, 'parentName and phone are required')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.query(
      'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=? WHERE id=?',
      [
        payload.parentName,
        payload.phone,
        payload.city || '',
        payload.bio || '',
        payload.preferredGrade || '小学',
        payload.preferredGrade || '小学',
        JSON.stringify(payload.preferredSubjects || []),
        req.user.id
      ]
    )

    await conn.query('DELETE FROM children WHERE parent_id=?', [req.user.id])
    if (Array.isArray(payload.children) && payload.children.length > 0) {
      const childrenData = payload.children.map((c) => [req.user.id, c.name, c.grade || '', c.targetSubject || ''])
      await conn.query('INSERT INTO children (parent_id, name, grade, target_subject) VALUES ?', [childrenData])
    }

    await conn.commit()
    ok(res, { updated: true })
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

app.post('/api/parent/avatar', authRequired('parent'), async (req, res) => {
  const avatar = String(req.body?.avatar || '')
  if (!avatar) return fail(res, 400, 'Missing avatar data')
  try {
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id])
    ok(res, { avatar })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/requests', authRequired('parent'), async (req, res) => {
  try {
    const [requests] = await pool.query('SELECT * FROM requests WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
    ok(
      res,
      requests.map((r) => ({
        id: r.id,
        title: r.title,
        subject: r.subject,
        grade: r.grade,
        budget: r.budget,
        schedule: r.schedule,
        status: r.status,
        teacherName: r.teacher_name,
        createdAt: new Date(r.created_at).toISOString().slice(0, 10)
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/requests/:id', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid request id')
  try {
    const [rows] = await pool.query('SELECT * FROM requests WHERE id = ? AND parent_id = ? LIMIT 1', [id, req.user.id])
    if (!rows.length) return fail(res, 404, 'Request not found')
    const item = rows[0]
    ok(res, {
      id: item.id,
      title: item.title,
      subject: item.subject,
      grade: item.grade,
      budget: item.budget,
      schedule: item.schedule,
      status: item.status,
      teacherName: item.teacher_name || '',
      description: item.description || '',
      createdAt: new Date(item.created_at).toISOString().slice(0, 10)
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/requests', authRequired('parent'), async (req, res) => {
  const payload = req.body || {}
  const title = String(payload.title || '').trim()
  if (!title) return fail(res, 400, 'title is required')

  try {
    const [result] = await pool.query(
      `INSERT INTO requests (parent_id, title, subject, grade, budget, schedule, status, teacher_name)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', '')`,
      [
        req.user.id,
        title,
        String(payload.subject || ''),
        String(payload.grade || ''),
        String(payload.budget || ''),
        String(payload.schedule || '')
      ]
    )
    ok(res, { id: result.insertId })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.patch('/api/parent/requests/:id/status', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body?.status || '')
  if (!['pending', 'matching', 'scheduled', 'completed', 'cancelled'].includes(status)) {
    return fail(res, 400, 'Invalid status')
  }
  try {
    const [result] = await pool.query('UPDATE requests SET status = ? WHERE id = ? AND parent_id = ?', [
      status,
      id,
      req.user.id
    ])
    if (result.affectedRows === 0) return fail(res, 404, 'Request not found')
    ok(res, { id, status })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/matches', authRequired('parent'), async (req, res) => {
  const status = String(req.query?.status || '').trim()
  const allowed = new Set(['new', 'viewed', 'unlocked', 'accepted', 'rejected', 'expired'])
  if (status && !allowed.has(status)) return fail(res, 400, 'Invalid status')
  try {
    const params = [req.user.id]
    const statusSql = status ? ' AND m.status = ?' : ''
    if (status) params.push(status)
    const [rows] = await pool.query(
      `SELECT m.*, u.nickname AS teacher_name, tp.real_name, tp.teaching_style, tp.experience_years, tp.fee_range
       FROM matches m
       JOIN users u ON u.id = m.teacher_id
       LEFT JOIN teacher_profiles tp ON tp.user_id = m.teacher_id
       WHERE m.parent_id = ?${statusSql}
       ORDER BY m.matched_at DESC`,
      params
    )
    ok(
      res,
      rows.map((item) => ({
        id: Number(item.id),
        teacherId: Number(item.teacher_id),
        requestId: Number(item.request_id),
        teacherName: String(item.real_name || item.teacher_name || '老师'),
        teachingStyle: String(item.teaching_style || ''),
        experienceYears: Number(item.experience_years || 0),
        feeRange: String(item.fee_range || '100_150'),
        matchScore: Number(item.match_score || 0),
        status: String(item.status || 'new'),
        parentAcceptStatus: String(item.parent_accept_status || 'pending'),
        teacherAcceptStatus: String(item.teacher_accept_status || 'pending'),
        unlockGranted: Boolean(item.unlock_granted),
        degradeLevel: Number(item.degrade_level || 0),
        matchTips: parseArrayField(item.match_tips),
        matchedAt: item.matched_at ? new Date(item.matched_at).toISOString() : ''
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/matches/:id/accept', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return fail(res, 400, 'Invalid match id')
  try {
    const [rows] = await pool.query('SELECT teacher_accept_status FROM matches WHERE id = ? AND parent_id = ? LIMIT 1', [id, req.user.id])
    if (!rows.length) return fail(res, 404, 'Match not found')
    const teacherAccepted = String(rows[0].teacher_accept_status || '') === 'accepted'
    await pool.query(
      `UPDATE matches
       SET parent_accept_status = 'accepted',
           unlock_granted = ?,
           status = ?
       WHERE id = ? AND parent_id = ?`,
      [teacherAccepted ? 1 : 0, teacherAccepted ? 'accepted' : 'viewed', id, req.user.id]
    )
    ok(res, { accepted: true, unlockGranted: teacherAccepted })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/matches/:id/reject', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return fail(res, 400, 'Invalid match id')
  try {
    const [result] = await pool.query(
      `UPDATE matches
       SET parent_accept_status = 'rejected',
           status = 'rejected',
           unlock_granted = 0
       WHERE id = ? AND parent_id = ?`,
      [id, req.user.id]
    )
    if (!result.affectedRows) return fail(res, 404, 'Match not found')
    ok(res, { rejected: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/matches/:id/feedback', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const reason = String(req.body?.reason || '').trim()
  if (!id) return fail(res, 400, 'Invalid match id')
  if (!reason) return fail(res, 400, 'reason is required')
  try {
    const [rows] = await pool.query(
      'SELECT id, request_id, teacher_id, rematch_count FROM matches WHERE id = ? AND parent_id = ? LIMIT 1',
      [id, req.user.id]
    )
    if (!rows.length) return fail(res, 404, 'Match not found')
    const current = rows[0]
    const rematchCount = Number(current.rematch_count || 0)
    if (rematchCount >= 2) return fail(res, 400, '已达到重匹配上限，请联系客服人工介入')

    await pool.query(
      `UPDATE matches
       SET feedback_submitted = 1,
           rematch_count = rematch_count + 1,
           feedback_reason = ?,
           last_feedback_at = NOW(),
           status = 'rejected',
           unlock_granted = 0,
           parent_accept_status = 'rejected'
       WHERE id = ? AND parent_id = ?`,
      [reason, id, req.user.id]
    )

    const generated = await generateMatchesForRequest(Number(current.request_id), {
      excludedTeacherIds: [Number(current.teacher_id)]
    })
    ok(res, { rematched: true, generated: Number(generated.generated || 0) })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/reviews', authRequired('parent'), async (req, res) => {
  try {
    const [reviews] = await pool.query('SELECT * FROM reviews WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
    ok(
      res,
      reviews.map((r) => ({
        id: r.id,
        teacherName: r.teacher_name,
        subject: r.subject,
        rating: r.rating,
        content: r.content,
        reply: r.reply,
        date: new Date(r.created_at).toISOString().slice(0, 10)
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/reviews/:id/reply', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const reply = String(req.body?.reply || '').trim()
  if (!reply) return fail(res, 400, 'reply cannot be empty')

  try {
    const [result] = await pool.query('UPDATE reviews SET reply = ? WHERE id = ? AND parent_id = ?', [reply, id, req.user.id])
    if (result.affectedRows === 0) return fail(res, 404, 'Review not found')
    ok(res, { id, reply })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/membership/status', async (req, res) => {
  const userId = resolveMembershipUserId(req)
  const defaultName = userId === CURRENT_TEACHER_USER_ID ? '普通老师' : '普通用户'
  try {
    const [memberships] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [userId])
    if (memberships.length === 0) {
      return ok(res, { planName: defaultName, expireAt: null, remainingUnlock: 0, weeklyPriorityQuota: 0 })
    }
    const m = memberships[0]
    ok(res, {
      planName: m.plan_name,
      expireAt: m.expire_at ? new Date(m.expire_at).toISOString().slice(0, 10) : null,
      remainingUnlock: m.remaining_unlock,
      weeklyPriorityQuota: m.weekly_priority_quota,
      autoRenew: !!m.auto_renew
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/membership/plans', async (req, res) => {
  try {
    const [plans] = await pool.query('SELECT * FROM membership_plans')
    ok(
      res,
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        durationMonth: p.duration_month,
        features: parseArrayField(p.features),
        recommended: !!p.recommended
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/membership/subscribe', authRequired(), async (req, res) => {
  const planId = String(req.body?.plan_id || '')
  const autoRenew = Boolean(req.body?.auto_renew)
  const userId = req.user.id

  try {
    const [plans] = await pool.query('SELECT * FROM membership_plans WHERE id = ?', [planId])
    if (!plans.length) return fail(res, 404, 'Plan not found')
    const plan = plans[0]

    const expire = new Date()
    expire.setMonth(expire.getMonth() + Number(plan.duration_month || 1))
    const unlock = Number(plan.duration_month || 1) * 5
    const quota = plan.id === 'year' ? 8 : plan.id === 'quarter' ? 5 : 3

    await pool.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         plan_name=VALUES(plan_name),
         expire_at=VALUES(expire_at),
         remaining_unlock=VALUES(remaining_unlock),
         weekly_priority_quota=VALUES(weekly_priority_quota),
         auto_renew=VALUES(auto_renew)`,
      [userId, plan.name, expire, unlock, quota, autoRenew]
    )

    ok(res, {
      planName: plan.name,
      expireAt: expire.toISOString().slice(0, 10),
      remainingUnlock: unlock,
      weeklyPriorityQuota: quota,
      autoRenew
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/settings', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id])
    if (!rows.length) return ok(res, { notifications: {}, privacy: {} })
    ok(res, {
      notifications: parseObjectField(rows[0].notifications),
      privacy: parseObjectField(rows[0].privacy)
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/password', authRequired('parent'), async (req, res) => {
  const currentPassword = String(req.body?.current_password || '')
  const nextPassword = String(req.body?.new_password || '')
  if (nextPassword.length < 6) return fail(res, 400, 'New password must be at least 6 chars')

  try {
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
    if (!users.length) return fail(res, 404, 'User not found')

    const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash)
    if (!isMatch) return fail(res, 400, 'Current password is incorrect')

    const hash = await bcrypt.hash(nextPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id])
    ok(res, { updated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/notifications', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [req.user.id])
    const current = rows.length ? parseObjectField(rows[0].notifications) : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)',
      [req.user.id, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/privacy', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT privacy FROM user_settings WHERE user_id = ?', [req.user.id])
    const current = rows.length ? parseObjectField(rows[0].privacy) : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)',
      [req.user.id, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/settings/deactivate', async (req, res) => {
  if (req.body?.confirm_text !== '注销账号') return fail(res, 400, 'Confirm text mismatch')
  try {
    await pool.query(
      'INSERT INTO user_settings (user_id, deactivated) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE deactivated=TRUE',
      [req.user.id]
    )
    ok(res, { deactivated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/profile', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    const [profiles] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ? LIMIT 1', [req.user.id])
    const profile = profiles[0] || null
    ok(res, {
      teacherName: teacher.nickname,
      phone: teacher.phone,
      city: profile?.city || teacher.city,
      district: profile?.district || '',
      gender: String(profile?.gender || 'male'),
      bio: profile?.intro || teacher.bio,
      avatar: teacher.avatar,
      wechat: String(teacher.wechat || ''),
      preferredGrades: parseArrayField(profile?.grades || teacher.preferred_grade),
      preferredSubjects: parseArrayField(profile?.subjects || teacher.preferred_subjects),
      experienceYears: Number(profile?.experience_years || 0),
      teachingMethods: parseArrayField(profile?.teaching_methods),
      feeRange: String(profile?.fee_range || '100_150'),
      school: String(profile?.school || ''),
      teachingStyle: String(profile?.teaching_style || ''),
      studentType: String(profile?.student_type || ''),
      areas: parseArrayField(profile?.areas),
      verifyStatus: String(profile?.verify_status || 'pending'),
      verified: Boolean(profile?.verified),
      verifyRemark: String(profile?.verify_remark || '')
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/matches/:id/review', authRequired(), async (req, res) => {
  const matchId = Number(req.params.id)
  const integrityRating = Math.max(1, Math.min(5, Number(req.body?.integrityRating || 0)))
  const responsibilityRating = Math.max(1, Math.min(5, Number(req.body?.responsibilityRating || 0)))
  const comment = String(req.body?.comment || '').trim()
  if (!matchId) return fail(res, 400, 'Invalid match id')
  if (!integrityRating || !responsibilityRating) return fail(res, 400, 'integrityRating and responsibilityRating are required')
  if (comment && (comment.length < 10 || comment.length > 50)) return fail(res, 400, 'comment length must be 10-50')

  try {
    const [matches] = await pool.query('SELECT * FROM matches WHERE id = ? LIMIT 1', [matchId])
    if (!matches.length) return fail(res, 404, 'Match not found')
    const match = matches[0]
    const isParent = req.user.role === 'parent' && Number(match.parent_id) === Number(req.user.id)
    const isTeacher = req.user.role === 'teacher' && Number(match.teacher_id) === Number(req.user.id)
    if (!isParent && !isTeacher) return fail(res, 403, 'Forbidden')

    const reviewerId = Number(req.user.id)
    const revieweeId = isParent ? Number(match.teacher_id) : Number(match.parent_id)

    const [exists] = await pool.query(
      'SELECT id FROM reviews WHERE match_id = ? AND reviewer_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) LIMIT 1',
      [matchId, reviewerId]
    )
    if (exists.length) return fail(res, 400, '30天内已评价过该对象')

    let teacherName = ''
    let parentId = Number(match.parent_id)
    let subject = ''
    const [reqRows] = await pool.query('SELECT subject FROM requests WHERE id = ? LIMIT 1', [Number(match.request_id)])
    if (reqRows.length) subject = String(reqRows[0].subject || '')
    if (isParent) {
      const [teacherRows] = await pool.query('SELECT nickname FROM users WHERE id = ? LIMIT 1', [Number(match.teacher_id)])
      teacherName = String(teacherRows[0]?.nickname || '')
    } else {
      const [teacherRows] = await pool.query('SELECT nickname FROM users WHERE id = ? LIMIT 1', [Number(match.teacher_id)])
      teacherName = String(teacherRows[0]?.nickname || '')
    }

    await pool.query(
      `INSERT INTO reviews
       (parent_id, match_id, reviewer_id, reviewee_id, teacher_name, subject, rating, integrity_rating, responsibility_rating, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parentId,
        matchId,
        reviewerId,
        revieweeId,
        teacherName,
        subject,
        Math.round((integrityRating + responsibilityRating) / 2),
        integrityRating,
        responsibilityRating,
        comment || ''
      ]
    )

    // 低分惩罚规则：累计5次低分限制3个月；累计3次低分降优先级（通过会员配额降级实现）
    const [lowRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM reviews
       WHERE reviewee_id = ? AND integrity_rating <= 2 AND responsibility_rating <= 2`,
      [revieweeId]
    )
    const lowCount = Number(lowRows[0]?.count || 0)
    if (lowCount >= 5) {
      const [targetUsers] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [revieweeId])
      const role = String(targetUsers[0]?.role || '')
      if (role === 'teacher') {
        await pool.query(
          `UPDATE teacher_profiles
           SET verify_status = 'rejected',
               verify_remark = '因多次低分评价，限制入驻3个月'
           WHERE user_id = ?`,
          [revieweeId]
        )
      }
    } else if (lowCount >= 3) {
      await pool.query(
        `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
         VALUES (?, '普通老师', NULL, 1, 0, 0)
         ON DUPLICATE KEY UPDATE weekly_priority_quota = LEAST(weekly_priority_quota, 1)`,
        [revieweeId]
      )
    }

    ok(res, { submitted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/profile', authRequired('teacher'), async (req, res) => {
  const payload = req.body || {}
  if (!payload.teacherName || !payload.phone) return fail(res, 400, 'teacherName and phone are required')
  const preferredGrades = Array.isArray(payload.preferredGrades) ? payload.preferredGrades : []
  const preferredSubjects = Array.isArray(payload.preferredSubjects) ? payload.preferredSubjects : []
  const areas = Array.isArray(payload.areas) ? payload.areas : []
  const district = String(payload.district || '')
  const teachingStyle = String(payload.teachingStyle || '')
  const studentType = String(payload.studentType || '')
  const experienceYears = Math.max(0, Number(payload.experienceYears || 0))
  const intro = String(payload.bio || '')
  const wechat = String(payload.wechat || '')
  const gender = String(payload.gender || 'male') === 'female' ? 'female' : 'male'
  const teachingMethods = Array.isArray(payload.teachingMethods) ? payload.teachingMethods : []
  const feeRange = ['under_100', '100_150', '150_200', 'over_200'].includes(String(payload.feeRange || ''))
    ? String(payload.feeRange || '')
    : '100_150'
  const school = String(payload.school || '')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=?, wechat=? WHERE id=?',
      [
        payload.teacherName,
        payload.phone,
        payload.city || '',
        intro,
        preferredGrades.join(','),
        JSON.stringify(preferredSubjects),
        wechat,
        req.user.id
      ]
    )
    await conn.query(
      `INSERT INTO teacher_profiles
       (user_id, real_name, gender, city, district, subjects, grades, experience_years, teaching_methods, fee_range, school, teaching_style, student_type, areas, intro)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         real_name=VALUES(real_name),
         gender=VALUES(gender),
         city=VALUES(city),
         district=VALUES(district),
         subjects=VALUES(subjects),
         grades=VALUES(grades),
         experience_years=VALUES(experience_years),
         teaching_methods=VALUES(teaching_methods),
         fee_range=VALUES(fee_range),
         school=VALUES(school),
         teaching_style=VALUES(teaching_style),
         student_type=VALUES(student_type),
         areas=VALUES(areas),
         intro=VALUES(intro)`,
      [
        req.user.id,
        String(payload.teacherName || ''),
        gender,
        String(payload.city || ''),
        district,
        JSON.stringify(preferredSubjects),
        JSON.stringify(preferredGrades),
        experienceYears,
        JSON.stringify(teachingMethods),
        feeRange,
        school,
        teachingStyle,
        studentType,
        JSON.stringify(areas),
        intro
      ]
    )
    await conn.commit()
    ok(res, { updated: true })
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

app.post('/api/teacher/avatar', authRequired('teacher'), async (req, res) => {
  const avatar = String(req.body?.avatar || '')
  if (!avatar) return fail(res, 400, 'Missing avatar data')
  try {
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id])
    ok(res, { avatar })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/requests', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')

    const [rows] = await pool.query(
      `SELECT r.*, u.nickname AS parent_name
       FROM requests r
       JOIN users u ON r.parent_id = u.id
       WHERE r.teacher_name = ? OR r.teacher_name = '' OR r.teacher_name IS NULL
       ORDER BY r.created_at DESC`,
      [teacher.nickname]
    )

    ok(
      res,
      rows.map((item) => ({
        id: item.id,
        title: item.title,
        subject: item.subject,
        grade: item.grade,
        budget: item.budget,
        schedule: item.schedule,
        status: item.status,
        parentName: item.parent_name,
        teacherName: item.teacher_name,
        isMine: item.teacher_name === teacher.nickname,
        createdAt: new Date(item.created_at).toISOString().slice(0, 10)
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/requests/:id/accept', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    const [result] = await pool.query(
      `UPDATE requests
       SET teacher_name = ?, status = 'scheduled'
       WHERE id = ? AND (teacher_name = '' OR teacher_name IS NULL OR teacher_name = ?)`,
      [teacher.nickname, id, teacher.nickname]
    )
    if (result.affectedRows === 0) return fail(res, 404, 'Request not found or already claimed')
    ok(res, { id, accepted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/requests/:id/release', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    const [result] = await pool.query(
      `UPDATE requests
       SET teacher_name = '', status = 'matching'
       WHERE id = ? AND teacher_name = ?`,
      [id, teacher.nickname]
    )
    if (result.affectedRows === 0) return fail(res, 404, 'Request not found or no permission')
    ok(res, { id, released: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.patch('/api/teacher/requests/:id/status', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body?.status || '')
  if (!['pending', 'matching', 'scheduled', 'completed', 'cancelled'].includes(status)) {
    return fail(res, 400, 'Invalid status')
  }
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    const [result] = await pool.query('UPDATE requests SET status = ? WHERE id = ? AND teacher_name = ?', [
      status,
      id,
      teacher.nickname
    ])
    if (result.affectedRows === 0) return fail(res, 404, 'Request not found or no permission')
    ok(res, { id, status })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/reviews', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')

    const [reviews] = await pool.query(
      `SELECT r.*, u.nickname AS parent_name
       FROM reviews r
       JOIN users u ON r.parent_id = u.id
       WHERE r.teacher_name = ?
       ORDER BY r.created_at DESC`,
      [teacher.nickname]
    )

    ok(
      res,
      reviews.map((item) => ({
        id: item.id,
        parentName: item.parent_name,
        subject: item.subject,
        rating: Number(item.rating || 0),
        integrityRating: Number(item.integrity_rating || item.rating || 0),
        responsibilityRating: Number(item.responsibility_rating || item.rating || 0),
        content: item.content,
        date: new Date(item.created_at).toISOString().slice(0, 10)
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/analytics', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')

    const [requestRows] = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM requests
       WHERE teacher_name = ?
       GROUP BY status`,
      [teacher.nickname]
    )
    const [reviewRows] = await pool.query(
      `SELECT COUNT(*) AS total_reviews, AVG(COALESCE((integrity_rating + responsibility_rating) / 2, rating)) AS average_rating
       FROM reviews
       WHERE teacher_name = ?`,
      [teacher.nickname]
    )

    const statusCounter = requestRows.reduce((acc, row) => {
      acc[row.status] = Number(row.count || 0)
      return acc
    }, {})

    const completedRequests = Number(statusCounter.completed || 0)
    const pendingRequests = Number(statusCounter.pending || 0) + Number(statusCounter.matching || 0)
    const scheduledRequests = Number(statusCounter.scheduled || 0)
    const totalHandled = completedRequests + pendingRequests + scheduledRequests + Number(statusCounter.cancelled || 0)

    const weeklyViews = 120 + totalHandled * 18
    const totalViews = weeklyViews * 8
    const responseRate = totalHandled === 0 ? 0 : (completedRequests + scheduledRequests) / totalHandled

    ok(res, {
      weeklyViews,
      totalViews,
      pendingRequests,
      scheduledRequests,
      completedRequests,
      averageRating: Number(reviewRows[0]?.average_rating || 0),
      totalReviews: Number(reviewRows[0]?.total_reviews || 0),
      responseRate
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/dashboard/summary', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')

    const [newMatchRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM matches
       WHERE teacher_id = ? AND status = 'new'`,
      [req.user.id]
    )
    const [unlockedRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM contact_unlock_records
       WHERE teacher_id = ?`,
      [req.user.id]
    )
    const [processingRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM requests
       WHERE teacher_name = ?
         AND status IN ('pending', 'matching', 'scheduled')`,
      [teacher.nickname]
    )
    const [membershipRows] = await pool.query(
      `SELECT remaining_unlock
       FROM memberships
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.id]
    )
    const [reviewRows] = await pool.query(
      `SELECT COUNT(*) AS total_reviews, AVG(COALESCE((integrity_rating + responsibility_rating) / 2, rating)) AS average_rating
       FROM reviews
       WHERE teacher_name = ?`,
      [teacher.nickname]
    )
    const [totalMatchRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM matches
       WHERE teacher_id = ?`,
      [req.user.id]
    )
    const totalReviews = Number(reviewRows[0]?.total_reviews || 0)
    const avgRating = Number(reviewRows[0]?.average_rating || 0)

    ok(res, {
      newMatchCount: Number(newMatchRows[0]?.count || 0),
      unlockedMatchCount: Number(unlockedRows[0]?.count || 0),
      processingRequestCount: Number(processingRows[0]?.count || 0),
      remainingUnlock: Number(membershipRows[0]?.remaining_unlock ?? 3),
      totalUnlockCount: Number(unlockedRows[0]?.count || 0),
      totalReviewCount: totalReviews,
      totalViewCount: Number(totalMatchRows[0]?.count || 0) * 18,
      integrityScore: totalReviews > 0 ? Math.round((Math.min(5, Math.max(0, avgRating)) / 5) * 100) : 80
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/questionnaire', authRequired('teacher'), async (req, res) => {
  const answers = req.body?.answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return fail(res, 400, 'answers is required')
  }
  try {
    await pool.query('INSERT INTO questionnaires (user_id, role, answers) VALUES (?, ?, ?)', [
      req.user.id,
      'teacher',
      JSON.stringify(answers)
    ])
    ok(res, { saved: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/questionnaire/latest', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT answers, updated_at
       FROM questionnaires
       WHERE user_id = ? AND role = 'teacher'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [req.user.id]
    )
    if (!rows.length) {
      return ok(res, { answers: {}, updatedAt: null })
    }
    ok(res, {
      answers: parseObjectField(rows[0].answers),
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/matches', authRequired('teacher'), async (req, res) => {
  const status = String(req.query?.status || '').trim()
  const grade = String(req.query?.grade || '').trim()
  const subject = String(req.query?.subject || '').trim()
  const city = String(req.query?.city || '').trim()
  const district = String(req.query?.district || '').trim()
  const budgetMin = Number(req.query?.budgetMin || 0)
  const budgetMaxRaw = Number(req.query?.budgetMax || 0)
  const budgetMax = budgetMaxRaw > 0 ? budgetMaxRaw : Number.POSITIVE_INFINITY
  const allowedStatus = new Set(['new', 'viewed', 'unlocked', 'accepted', 'rejected', 'expired'])
  if (status && !allowedStatus.has(status)) return fail(res, 400, 'Invalid status')

  try {
    const params = [req.user.id]
    const statusSql = status ? ' AND m.status = ?' : ''
    if (status) params.push(status)
    const [rows] = await pool.query(
      `SELECT m.id, m.parent_id, m.request_id, m.match_score, m.status, m.parent_accept_status, m.teacher_accept_status, m.unlock_granted, m.rematch_count, m.degrade_level, m.match_tips, m.matched_at, m.unlocked_at,
              r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status,
              u.nickname AS parent_name, u.city AS parent_city
       FROM matches m
       JOIN requests r ON r.id = m.request_id
       JOIN users u ON u.id = m.parent_id
       WHERE m.teacher_id = ?${statusSql}
       ORDER BY m.matched_at DESC`,
      params
    )
    const filteredRows = rows.filter((item) => {
      if (grade && String(item.grade || '') !== grade) return false
      if (subject && !String(item.subject || '').includes(subject)) return false
      if (city && !String(item.parent_city || '').includes(city)) return false
      if (district && !String(item.parent_city || '').includes(district)) return false
      if (Number.isFinite(budgetMin) || Number.isFinite(budgetMax)) {
        const range = parseBudgetRange(item.budget || '')
        if (range.max < budgetMin) return false
        if (range.min > budgetMax) return false
      }
      return true
    })
    ok(
      res,
      filteredRows.map((item) => ({
        id: Number(item.id),
        parentId: Number(item.parent_id),
        requestId: Number(item.request_id),
        title: item.title || '',
        subject: item.subject || '',
        grade: item.grade || '',
        budget: item.budget || '',
        schedule: item.schedule || '',
        requestStatus: item.request_status || 'pending',
        parentName: item.parent_name || '家长',
        city: item.parent_city || '',
        matchScore: Number(item.match_score || 0),
        status: item.status || 'new',
        parentAcceptStatus: String(item.parent_accept_status || 'pending'),
        teacherAcceptStatus: String(item.teacher_accept_status || 'pending'),
        unlockGranted: Boolean(item.unlock_granted),
        rematchCount: Number(item.rematch_count || 0),
        degradeLevel: Number(item.degrade_level || 0),
        matchTips: parseArrayField(item.match_tips),
        matchedAt: item.matched_at ? new Date(item.matched_at).toISOString() : '',
        unlockedAt: item.unlocked_at ? new Date(item.unlocked_at).toISOString() : null
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/matches/:id/unlock', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const unlockType = String(req.body?.unlockType || 'phone')
  if (!id) return fail(res, 400, 'Invalid match id')
  if (!['phone', 'wechat'].includes(unlockType)) return fail(res, 400, 'Invalid unlock type')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [rows] = await conn.query(
      `SELECT m.id, m.parent_id, m.request_id, m.status, m.unlock_granted, m.parent_accept_status, m.teacher_accept_status, u.nickname AS parent_name, u.phone
       FROM matches m
       JOIN users u ON u.id = m.parent_id
       WHERE m.id = ? AND m.teacher_id = ?
       LIMIT 1`,
      [id, req.user.id]
    )
    const target = rows[0]
    if (!target) {
      await conn.rollback()
      return fail(res, 404, 'Match not found')
    }

    if (target.status === 'unlocked') {
      await conn.commit()
      return ok(res, {
        unlocked: true,
        parentName: target.parent_name || '家长',
        phone: target.phone || '',
        wechat: ''
      })
    }
    const canUnlock =
      Number(target.unlock_granted || 0) === 1 &&
      String(target.parent_accept_status || '') === 'accepted' &&
      String(target.teacher_accept_status || '') === 'accepted'
    if (!canUnlock) {
      await conn.rollback()
      return fail(res, 400, '需双方同意后才可解锁联系方式')
    }

    const [membershipRows] = await conn.query('SELECT remaining_unlock FROM memberships WHERE user_id = ? LIMIT 1', [req.user.id])
    if (!membershipRows.length) {
      await conn.query(
        'INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew) VALUES (?, ?, NULL, ?, ?, ?)',
        [req.user.id, '普通老师', 3, 1, false]
      )
    }

    const [quotaRows] = await conn.query('SELECT remaining_unlock FROM memberships WHERE user_id = ? LIMIT 1', [req.user.id])
    const remainingUnlock = Number(quotaRows[0]?.remaining_unlock ?? 0)
    if (remainingUnlock <= 0) {
      await conn.rollback()
      return fail(res, 400, '解锁次数不足')
    }

    await conn.query('UPDATE memberships SET remaining_unlock = remaining_unlock - 1 WHERE user_id = ?', [req.user.id])
    await conn.query(
      'INSERT INTO contact_unlock_records (teacher_id, parent_id, request_id, unlock_type, unlock_cost) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, target.parent_id, target.request_id, unlockType, 1]
    )
    await conn.query("UPDATE matches SET status = 'unlocked', unlocked_at = NOW() WHERE id = ? AND teacher_id = ?", [id, req.user.id])

    await conn.commit()
    ok(res, {
      unlocked: true,
      parentName: target.parent_name || '家长',
      phone: target.phone || '',
      wechat: ''
    })
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

app.post('/api/teacher/matches/:id/accept', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return fail(res, 400, 'Invalid match id')
  try {
    const [rows] = await pool.query('SELECT parent_accept_status FROM matches WHERE id = ? AND teacher_id = ? LIMIT 1', [id, req.user.id])
    if (!rows.length) return fail(res, 404, 'Match not found')
    const parentAccepted = String(rows[0].parent_accept_status || '') === 'accepted'
    const [result] = await pool.query(
      `UPDATE matches
       SET teacher_accept_status = 'accepted',
           unlock_granted = ?,
           status = ?
       WHERE id = ? AND teacher_id = ?`,
      [parentAccepted ? 1 : 0, parentAccepted ? 'accepted' : 'viewed', id, req.user.id]
    )
    if (!result.affectedRows) return fail(res, 404, 'Match not found')
    ok(res, { accepted: true, unlockGranted: parentAccepted })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/matches/:id/reject', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return fail(res, 400, 'Invalid match id')
  try {
    const [result] = await pool.query(
      `UPDATE matches
       SET teacher_accept_status = 'rejected',
           status = 'rejected',
           unlock_granted = 0
       WHERE id = ? AND teacher_id = ?`,
      [id, req.user.id]
    )
    if (!result.affectedRows) return fail(res, 404, 'Match not found')
    ok(res, { rejected: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/matches/:id/feedback', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const reason = String(req.body?.reason || '').trim()
  if (!id) return fail(res, 400, 'Invalid match id')
  if (!reason) return fail(res, 400, 'reason is required')
  try {
    const [rows] = await pool.query(
      'SELECT id, request_id, teacher_id, rematch_count FROM matches WHERE id = ? AND teacher_id = ? LIMIT 1',
      [id, req.user.id]
    )
    if (!rows.length) return fail(res, 404, 'Match not found')
    const current = rows[0]
    const rematchCount = Number(current.rematch_count || 0)
    if (rematchCount >= 2) return fail(res, 400, '已达到重匹配上限，请联系客服人工介入')

    await pool.query(
      `UPDATE matches
       SET feedback_submitted = 1,
           rematch_count = rematch_count + 1,
           feedback_reason = ?,
           last_feedback_at = NOW(),
           status = 'rejected',
           unlock_granted = 0,
           teacher_accept_status = 'rejected'
       WHERE id = ? AND teacher_id = ?`,
      [reason, id, req.user.id]
    )

    const generated = await generateMatchesForRequest(Number(current.request_id), {
      excludedTeacherIds: [Number(current.teacher_id)]
    })
    ok(res, { rematched: true, generated: Number(generated.generated || 0) })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/unlock-records', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.parent_id, r.request_id, r.unlock_type, r.unlock_cost, r.created_at, u.nickname AS parent_name
       FROM contact_unlock_records r
       JOIN users u ON u.id = r.parent_id
       WHERE r.teacher_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    )
    ok(
      res,
      rows.map((item) => ({
        id: Number(item.id),
        parentId: Number(item.parent_id),
        parentName: item.parent_name || '家长',
        requestId: Number(item.request_id),
        unlockType: item.unlock_type || 'phone',
        unlockCost: Number(item.unlock_cost || 1),
        createdAt: item.created_at ? new Date(item.created_at).toISOString() : ''
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/notifications', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req.user.id)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    const complaintNotices = await getTeacherComplaintNotices(req.user.id)

    const [unlockRows] = await pool.query(
      `SELECT m.id, m.request_id, m.matched_at, u.nickname AS parent_name, r.subject, r.grade, r.budget
       FROM matches m
       JOIN users u ON u.id = m.parent_id
       JOIN requests r ON r.id = m.request_id
       WHERE m.teacher_id = ?
         AND m.parent_accept_status = 'accepted'
         AND m.teacher_accept_status = 'pending'
       ORDER BY m.matched_at DESC
       LIMIT 50`,
      [req.user.id]
    )
    const [matchRows] = await pool.query(
      `SELECT id, request_id, status, matched_at, unlocked_at
       FROM matches
       WHERE teacher_id = ? AND status IN ('unlocked', 'accepted', 'rejected', 'expired')
       ORDER BY COALESCE(unlocked_at, matched_at) DESC
       LIMIT 50`,
      [req.user.id]
    )
    const [reviewRows] = await pool.query(
      `SELECT id, parent_id, subject, rating, content, created_at
       FROM reviews
       WHERE teacher_name = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [teacher.nickname]
    )
    const [parents] = await pool.query('SELECT id, nickname FROM users WHERE role = "parent"')
    const parentNameMap = parents.reduce((acc, item) => {
      acc[Number(item.id)] = String(item.nickname || '家长')
      return acc
    }, {})

    ok(res, {
      unlockRequests: unlockRows.map((item) => ({
        id: Number(item.id),
        title: '家长解锁请求',
        requestId: Number(item.request_id),
        parentName: String(item.parent_name || '家长'),
        subject: String(item.subject || ''),
        grade: String(item.grade || ''),
        budget: String(item.budget || ''),
        status: 'new',
        createdAt: item.matched_at ? new Date(item.matched_at).toISOString() : ''
      })),
      matchUpdates: matchRows.map((item) => ({
        id: Number(item.id),
        requestId: Number(item.request_id),
        title: '匹配状态更新',
        content: `需求 #${Number(item.request_id)} 状态已更新为 ${String(item.status || '')}`,
        status: String(item.status || ''),
        createdAt: item.unlocked_at ? new Date(item.unlocked_at).toISOString() : new Date(item.matched_at).toISOString()
      })),
      reviewNotices: reviewRows.map((item) => ({
        id: Number(item.id),
        parentName: String(parentNameMap[Number(item.parent_id)] || '家长'),
        subject: String(item.subject || ''),
        rating: Number(item.rating || 0),
        title: '收到新评价',
        content: `${String(parentNameMap[Number(item.parent_id)] || '家长')} 给了 ${Number(item.rating || 0)} 星评价：${String(item.content || '')}`,
        createdAt: item.created_at ? new Date(item.created_at).toISOString() : ''
      })),
      complaintNotices,
      systemNotices: [
        {
          id: 1,
          title: '平台服务通知',
          content: '每周一会更新推荐策略，建议及时维护个人资料以提升匹配质量。',
          createdAt: new Date().toISOString()
        }
      ]
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/notifications/unlock-requests/:id/accept', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return fail(res, 400, 'Invalid request id')
  try {
    const [result] = await pool.query(
      `UPDATE matches
       SET teacher_accept_status = 'accepted',
           unlock_granted = CASE WHEN parent_accept_status = 'accepted' THEN 1 ELSE 0 END,
           status = CASE WHEN parent_accept_status = 'accepted' THEN 'accepted' ELSE 'viewed' END
       WHERE id = ? AND teacher_id = ? AND teacher_accept_status = 'pending'`,
      [id, req.user.id]
    )
    if (!result.affectedRows) return fail(res, 404, 'Unlock request not found')
    ok(res, { accepted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/notifications/unlock-requests/:id/reject', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return fail(res, 400, 'Invalid request id')
  try {
    const [result] = await pool.query(
      `UPDATE matches
       SET teacher_accept_status = 'rejected',
           status = 'rejected',
           unlock_granted = 0
       WHERE id = ? AND teacher_id = ? AND teacher_accept_status = 'pending'`,
      [id, req.user.id]
    )
    if (!result.affectedRows) return fail(res, 404, 'Unlock request not found')
    ok(res, { rejected: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/complaints/:id/appeal', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const content = String(req.body?.content || '').trim()
  if (!id) return fail(res, 400, 'Invalid complaint id')
  if (content.length < 10) return fail(res, 400, '申诉内容至少10个字')

  try {
    const [rows] = await pool.query(
      `SELECT id, status, appealed_at, appeal_status
       FROM complaints
       WHERE id = ? AND respondent_id = ?
       LIMIT 1`,
      [id, req.user.id]
    )
    const complaint = rows[0]
    if (!complaint) return fail(res, 404, 'Complaint not found')

    const alreadyAppealed = Boolean(complaint.appealed_at) || String(complaint.appeal_status || 'none') !== 'none'
    if (alreadyAppealed) return fail(res, 400, '该投诉已提交过申诉')
    if (!['processing', 'resolved', 'rejected'].includes(String(complaint.status || ''))) {
      return fail(res, 400, '当前状态暂不可申诉')
    }

    await pool.query('UPDATE complaints SET appeal_content = ?, appealed_at = NOW(), appeal_status = ? WHERE id = ?', [
      content,
      'pending',
      id
    ])

    ok(res, { appealed: true })
  } catch (error) {
    if (String(error?.code || '') === 'ER_NO_SUCH_TABLE') {
      return fail(res, 503, '投诉模块未初始化，请先执行兼容迁移')
    }
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/verification/upload', authRequired('teacher'), async (req, res) => {
  const certType = String(req.body?.certType || '').trim()
  const certUrl = String(req.body?.certUrl || '').trim()
  if (!['teacher_license', 'work_proof', 'id_card'].includes(certType)) return fail(res, 400, 'Invalid certType')
  if (!certUrl) return fail(res, 400, 'certUrl is required')
  try {
    await pool.query(
      `INSERT INTO teacher_verifications (user_id, cert_type, cert_url, status, review_remark)
       VALUES (?, ?, ?, 'pending', '')`,
      [req.user.id, certType, certUrl]
    )
    ok(res, { uploaded: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/verification/status', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cert_type, cert_url, status, review_remark, created_at, updated_at
       FROM teacher_verifications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.id]
    )

    const latest = rows[0] || null
    ok(res, {
      verifyStatus: latest?.status || 'pending',
      verified: latest?.status === 'approved',
      verifyRemark: latest?.review_remark || '',
      certificates: rows.map((item) => ({
        certType: item.cert_type,
        certUrl: item.cert_url,
        status: item.status,
        reviewRemark: item.review_remark || '',
        createdAt: item.created_at ? new Date(item.created_at).toISOString() : null,
        updatedAt: item.updated_at ? new Date(item.updated_at).toISOString() : null
      }))
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/admin/teacher-verifications/:userId/approve', adminRequired, async (req, res) => {
  const userId = Number(req.params.userId)
  if (!userId) return fail(res, 400, 'Invalid user id')
  try {
    await pool.query(
      `UPDATE teacher_profiles
       SET verify_status = 'approved', verified = 1, verify_remark = ''
       WHERE user_id = ?`,
      [userId]
    )
    await pool.query(`UPDATE teacher_verifications SET status = 'approved', review_remark = '' WHERE user_id = ?`, [userId])
    ok(res, { approved: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/admin/teacher-verifications/:userId/reject', adminRequired, async (req, res) => {
  const userId = Number(req.params.userId)
  const remark = String(req.body?.remark || '').trim()
  if (!userId) return fail(res, 400, 'Invalid user id')
  if (!remark) return fail(res, 400, 'remark is required')
  try {
    await pool.query(
      `UPDATE teacher_profiles
       SET verify_status = 'rejected', verified = 0, verify_remark = ?
       WHERE user_id = ?`,
      [remark, userId]
    )
    await pool.query(`UPDATE teacher_verifications SET status = 'rejected', review_remark = ? WHERE user_id = ?`, [remark, userId])
    ok(res, { rejected: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/membership/status', authRequired('teacher'), async (req, res) => {
  try {
    const [memberships] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [req.user.id])
    if (!memberships.length) {
      const [users] = await pool.query('SELECT created_at FROM users WHERE id = ? LIMIT 1', [req.user.id])
      const createdAt = users[0]?.created_at ? new Date(users[0].created_at) : null
      const inTrial =
        createdAt &&
        Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000
      if (inTrial) {
        const expire = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
        return ok(res, {
          planName: '试运行免费版',
          expireAt: expire.toISOString().slice(0, 10),
          remainingUnlock: 999,
          weeklyPriorityQuota: 5
        })
      }
      return ok(res, { planName: '普通老师', expireAt: null, remainingUnlock: 3, weeklyPriorityQuota: 1 })
    }
    const m = memberships[0]
    ok(res, {
      planName: m.plan_name,
      expireAt: m.expire_at ? new Date(m.expire_at).toISOString().slice(0, 10) : null,
      remainingUnlock: m.remaining_unlock,
      weeklyPriorityQuota: m.weekly_priority_quota,
      autoRenew: !!m.auto_renew
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/membership/plans', authRequired('teacher'), async (req, res) => {
  ok(res, [
    {
      id: 'bronze',
      name: '铜牌老师',
      price: 19.9,
      durationMonth: 1,
      features: ['每天 3 次解锁次数', '中部曝光位', '基础数据面板'],
      recommended: false
    },
    {
      id: 'silver',
      name: '银牌老师',
      price: 29.9,
      durationMonth: 1,
      features: ['每天 10 次解锁次数', '上部曝光位', '详细报表 + 实时通知'],
      recommended: true
    },
    {
      id: 'gold',
      name: '金牌老师',
      price: 49.9,
      durationMonth: 1,
      features: ['无限解锁次数', '顶部置顶曝光', '优先推荐 + 专属客服'],
      recommended: false
    }
  ])
})

app.post('/api/teacher/membership/subscribe', authRequired('teacher'), async (req, res) => {
  const planId = String(req.body?.plan_id || '')
  const autoRenew = Boolean(req.body?.auto_renew)
  const planMap = {
    bronze: { name: '铜牌老师', unlock: 3, quota: 2 },
    silver: { name: '银牌老师', unlock: 10, quota: 5 },
    gold: { name: '金牌老师', unlock: 999, quota: 10 }
  }
  const selected = planMap[planId]
  if (!selected) return fail(res, 404, 'Plan not found')
  try {
    const expire = new Date()
    expire.setMonth(expire.getMonth() + 1)

    await pool.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         plan_name=VALUES(plan_name),
         expire_at=VALUES(expire_at),
         remaining_unlock=VALUES(remaining_unlock),
         weekly_priority_quota=VALUES(weekly_priority_quota),
         auto_renew=VALUES(auto_renew)`,
      [req.user.id, selected.name, expire, selected.unlock, selected.quota, autoRenew]
    )

    ok(res, {
      planName: selected.name,
      expireAt: expire.toISOString().slice(0, 10),
      remainingUnlock: selected.unlock,
      weeklyPriorityQuota: selected.quota,
      autoRenew
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/settings', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id])
    if (!rows.length) return ok(res, { notifications: {}, privacy: {} })
    ok(res, {
      notifications: parseObjectField(rows[0].notifications),
      privacy: parseObjectField(rows[0].privacy)
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/settings/password', authRequired('teacher'), async (req, res) => {
  const currentPassword = String(req.body?.current_password || '')
  const nextPassword = String(req.body?.new_password || '')
  if (nextPassword.length < 6) return fail(res, 400, 'New password must be at least 6 chars')
  try {
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
    if (!users.length) return fail(res, 404, 'Teacher not found')
    const matched = await bcrypt.compare(currentPassword, users[0].password_hash)
    if (!matched) return fail(res, 400, 'Current password is incorrect')
    const hash = await bcrypt.hash(nextPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id])
    ok(res, { updated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/settings/notifications', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [req.user.id])
    const current = rows.length ? parseObjectField(rows[0].notifications) : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)',
      [req.user.id, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/settings/privacy', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT privacy FROM user_settings WHERE user_id = ?', [req.user.id])
    const current = rows.length ? parseObjectField(rows[0].privacy) : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)',
      [req.user.id, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

// Messages API
app.get('/api/messages/conversations', authRequired(), async (req, res) => {
  const userId = req.user.id
  try {
    const [conversations] = await pool.query(
      `SELECT c.id, c.last_message, c.updated_at,
              u.id AS contact_id, u.nickname AS contact_name, u.role AS contact_role
       FROM conversations c
       JOIN users u ON (c.parent_id = u.id OR c.teacher_id = u.id)
       WHERE (c.parent_id = ? OR c.teacher_id = ?) AND u.id != ?
       ORDER BY c.updated_at DESC`,
      [userId, userId, userId]
    )

    ok(
      res,
      conversations.map((c) => ({
        id: c.id,
        contactId: c.contact_id,
        contactName: c.contact_name,
        contactRole: c.contact_role,
        lastMessage: c.last_message,
        updatedAt: new Date(c.updated_at).toISOString()
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/messages/unread-count', authRequired(), async (req, res) => {
  const userId = req.user.id
  try {
    const count = await getUnreadMessageCount(userId)
    ok(res, { count })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/invite/summary', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT invite_code, status FROM invite_records WHERE inviter_id = ? AND role = ? ORDER BY id DESC', [
      req.user.id,
      'teacher'
    ])
    const inviteCode = String(rows[0]?.invite_code || '')
    const totalInvited = rows.length
    const verifiedInvited = rows.filter((item) => String(item.status || '') === 'verified').length
    ok(res, {
      inviteCode,
      totalInvited,
      verifiedInvited,
      extraMatchQuota: verifiedInvited
    })
  } catch (error) {
    if (String(error?.code || '') === 'ER_NO_SUCH_TABLE') return ok(res, { inviteCode: '', totalInvited: 0, verifiedInvited: 0, extraMatchQuota: 0 })
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/invite/create', authRequired('teacher'), async (req, res) => {
  try {
    const [exists] = await pool.query(
      'SELECT invite_code FROM invite_records WHERE inviter_id = ? AND role = ? ORDER BY id DESC LIMIT 1',
      [req.user.id, 'teacher']
    )
    if (exists.length) return ok(res, { inviteCode: String(exists[0].invite_code || '') })
    const code = generateInviteCode()
    await pool.query(
      `INSERT INTO invite_records (inviter_id, invitee_id, role, invite_code, status, reward_granted)
       VALUES (?, NULL, 'teacher', ?, 'pending', 0)`,
      [req.user.id, code]
    )
    ok(res, { inviteCode: code })
  } catch (error) {
    if (String(error?.code || '') === 'ER_NO_SUCH_TABLE') return fail(res, 503, '邀请模块未初始化，请先执行兼容迁移')
    fail(res, 500, error.message)
  }
})

app.post('/api/matching/run-weekly', authRequired(), async (req, res) => {
  try {
    const result = await runWeeklyMatching()
    ok(res, result)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/messages/:conversationId', authRequired(), async (req, res) => {
  const conversationId = Number(req.params.conversationId)
  try {
    const [messages] = await pool.query(
      `SELECT m.*
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ?
         AND (c.parent_id = ? OR c.teacher_id = ?)
       ORDER BY m.created_at ASC`,
      [conversationId, req.user.id, req.user.id]
    )
    ok(
      res,
      messages.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        content: m.content,
        isRead: m.is_read,
        createdAt: new Date(m.created_at).toISOString()
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/messages/:conversationId/read', authRequired(), async (req, res) => {
  const conversationId = Number(req.params.conversationId)
  const userId = req.user.id
  try {
    await pool.query(
      `UPDATE messages m
       JOIN conversations c ON c.id = m.conversation_id
       SET is_read = TRUE
       WHERE m.conversation_id = ?
         AND (c.parent_id = ? OR c.teacher_id = ?)
         AND m.sender_id != ?
         AND m.is_read = FALSE`,
      [conversationId, userId, userId, userId]
    )
    await emitUnreadMessageCount(userId)
    ok(res, { success: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

// Socket.io
io.use((socket, next) => {
  const tokenFromAuth = socket.handshake.auth?.token
  const tokenFromHeader = String(socket.handshake.headers?.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  const token = tokenFromAuth || tokenFromHeader
  const user = verifyAuthToken(token)
  if (!user) return next(new Error('Unauthorized'))
  socket.user = user
  next()
})

io.on('connection', (socket) => {
  const userId = Number(socket.user.id)
  socket.join(`user_${userId}`)
  emitUnreadMessageCount(userId).catch(() => { })

  socket.on('send_message', async (data) => {
    const conversationId = Number(data?.conversationId || 0)
    const content = String(data?.content || '').trim()
    if (!conversationId || !content) return

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [conversationRows] = await conn.query(
        'SELECT id, parent_id, teacher_id FROM conversations WHERE id = ? LIMIT 1',
        [conversationId]
      )
      const conversation = conversationRows[0]
      if (!conversation) {
        await conn.rollback()
        return
      }
      if (conversation.parent_id !== userId && conversation.teacher_id !== userId) {
        await conn.rollback()
        return
      }

      const receiverId = conversation.parent_id === userId ? conversation.teacher_id : conversation.parent_id
      if (!receiverId) {
        await conn.rollback()
        return
      }

      const [result] = await conn.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [
        conversationId,
        userId,
        content
      ])

      await conn.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [content, conversationId])

      await conn.commit()

      const [rows] = await conn.query('SELECT * FROM messages WHERE id = ?', [result.insertId])
      const saved = rows[0]
      const payload = {
        id: saved.id,
        conversationId: saved.conversation_id,
        senderId: saved.sender_id,
        content: saved.content,
        isRead: saved.is_read,
        createdAt: new Date(saved.created_at).toISOString()
      }

      io.to(`user_${receiverId}`).emit('receive_message', payload)
      socket.emit('message_sent', payload)
      emitUnreadMessageCount(receiverId).catch(() => { })
    } catch (error) {
      await conn.rollback()
      console.error('Failed to send message:', error)
    } finally {
      conn.release()
    }
  })
})

let lastAutoMatchSlot = ''
setInterval(async () => {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const isMatchWindow = (day === 3 || day === 5) && hour === 18 && minute <= 5
  if (!isMatchWindow) return

  const slot = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-18`
  if (slot === lastAutoMatchSlot) return
  lastAutoMatchSlot = slot

  try {
    await runWeeklyMatching()
  } catch (error) {
    console.error('[matching] auto run failed:', error.message)
  }
}, 60 * 1000)

app.use((_req, res) => fail(res, 404, 'Not Found'))

httpServer.listen(PORT, () => {
  console.log(`[api] running at http://localhost:${PORT} (with WebSocket)`)
})





