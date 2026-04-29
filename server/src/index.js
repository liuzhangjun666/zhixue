import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import pool from './db.js'

const app = express()
const httpServer = createServer(app)

const PORT = Number(process.env.PORT || 8000)
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

const DEFAULT_AUTH_TOKEN_SECRET = 'zhixue-dev-secret-change-me'
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || DEFAULT_AUTH_TOKEN_SECRET
const AUTH_TOKEN_EXPIRES_IN_SECONDS = Number(process.env.AUTH_TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 7)

if (process.env.NODE_ENV === 'production' && AUTH_TOKEN_SECRET === DEFAULT_AUTH_TOKEN_SECRET) {
  throw new Error('AUTH_TOKEN_SECRET must be set in production')
}

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
    res.header('Vary', 'Origin')
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

const ok = (res, data = null, message = 'ok') => res.json({ code: 0, message, data })
const fail = (res, status, message) => {
  if (status === 401) return res.status(401).json({ code: 401, message: 'Unauthorized', data: null })
  if (status === 403) return res.status(403).json({ code: 403, message: 'Forbidden', data: null })
  return res.status(status).json({ code: status, message, data: null })
}

const parseArrayField = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean)
    } catch {}
    return value
      .split(/[,,，、\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return []
}

const parseObjectField = (value) => {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const toDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '')
const toISO = (value) => (value ? new Date(value).toISOString() : '')

const getBearerToken = (req) => {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return ''
  return header.slice(7).trim()
}

const signPayload = (payload) => crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payload).digest('base64url')

const issueToken = (user) => {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({
      id: Number(user.id),
      role: user.role,
      iat: now,
      exp: now + AUTH_TOKEN_EXPIRES_IN_SECONDS
    })
  ).toString('base64url')
  return `${payload}.${signPayload(payload)}`
}

const verifyToken = (token) => {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature || signature !== signPayload(payload)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const exp = Number(data?.exp || 0)
    if (!data?.id || !data?.role || exp < Math.floor(Date.now() / 1000)) return null
    return { id: Number(data.id), role: String(data.role) }
  } catch {
    return null
  }
}

const authRequired = (role = '') => (req, res, next) => {
  const user = verifyToken(getBearerToken(req))
  if (!user) return fail(res, 401, 'Unauthorized')
  if (role && user.role !== role) return fail(res, 403, 'Forbidden')
  req.user = user
  next()
}

const getUserById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

const getUserByPhone = async (phone, role) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = ? LIMIT 1', [phone, role])
  return rows[0] || null
}

const buildAuthPayload = (user) => ({
  user: {
    id: Number(user.id),
    role: user.role,
    nickname: user.nickname,
    phone: user.phone
  },
  token: issueToken(user)
})

const ensureTeacherProfile = async (user) => {
  const [rows] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ? LIMIT 1', [user.id])
  if (rows.length) return rows[0]
  await pool.query(
    `INSERT INTO teacher_profiles
      (user_id, real_name, city, district, subjects, grades, experience_years, teaching_mode, available_time_text, rating_avg, rating_count, is_active, intro)
     VALUES (?, ?, ?, '', ?, ?, 0, 'both', '工作日晚间、周末可约', 0, 0, TRUE, ?)`,
    [
      user.id,
      user.nickname || '',
      user.city || '',
      JSON.stringify(parseArrayField(user.preferred_subjects)),
      JSON.stringify(parseArrayField(user.preferred_grade)),
      user.bio || ''
    ]
  )
  const [created] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ? LIMIT 1', [user.id])
  return created[0]
}

const teacherDTO = async (user) => {
  const tp = await ensureTeacherProfile(user)
  return {
    teacherName: user.nickname,
    phone: user.phone,
    city: tp.city || user.city || '',
    district: tp.district || '',
    bio: tp.intro || user.bio || '',
    avatar: user.avatar || '',
    wechat: user.wechat || '',
    preferredGrades: parseArrayField(tp.grades),
    preferredSubjects: parseArrayField(tp.subjects),
    experienceYears: Number(tp.experience_years || 0),
    teachingStyle: tp.teaching_style || '',
    studentType: tp.student_type || '',
    areas: parseArrayField(tp.areas),
    verifyStatus: tp.verify_status || 'pending',
    verified: !!tp.verified,
    verifyRemark: tp.verify_remark || ''
  }
}

const mapRequest = (r) => ({
  id: Number(r.id),
  title: r.title || '',
  subject: r.subject || '',
  grade: r.grade || '',
  budget: r.budget || '',
  schedule: r.schedule || '',
  status: r.status || 'pending',
  teacherName: r.teacher_name || '',
  description: r.description || '',
  createdAt: toDate(r.created_at)
})

const hasColumn = async (tableName, columnName) => {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName]
  )
  return rows.length > 0
}

const ensureColumn = async (tableName, columnName, ddl) => {
  try {
    if (await hasColumn(tableName, columnName)) return
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`)
    console.log(`[schema] added ${tableName}.${columnName}`)
  } catch (error) {
    console.error(`[schema] failed to add ${tableName}.${columnName}:`, error?.message || error)
  }
}

const ensureMatchingSchema = async () => {
  await ensureColumn('requests', 'description', 'description TEXT')
  await ensureColumn('matches', 'parent_accept_status', "parent_accept_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending'")
  await ensureColumn('matches', 'teacher_accept_status', "teacher_accept_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending'")
  await ensureColumn('matches', 'unlock_granted', 'unlock_granted TINYINT(1) NOT NULL DEFAULT 0')
  await ensureColumn('matches', 'feedback_submitted', 'feedback_submitted TINYINT(1) NOT NULL DEFAULT 0')
  await ensureColumn('matches', 'rematch_count', 'rematch_count TINYINT UNSIGNED NOT NULL DEFAULT 0')
  await ensureColumn('matches', 'feedback_reason', "feedback_reason VARCHAR(255) NOT NULL DEFAULT ''")
  await ensureColumn('matches', 'degrade_level', 'degrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0')
  await ensureColumn('matches', 'match_tips', 'match_tips JSON')
  await ensureColumn('matches', 'last_feedback_at', 'last_feedback_at DATETIME DEFAULT NULL')
  await ensureColumn('matches', 'week_number', 'week_number INT NOT NULL DEFAULT 0')
}

const isOptionalSchemaError = (error) =>
  error && ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(String(error.code || ''))

const parseBudgetRange = (text) => {
  const nums = String(text || '')
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((n) => Number.isFinite(n))
  if (!nums || nums.length === 0) return { min: 0, max: Infinity }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

const feeRangeToBudgetRange = (value) => {
  if (value === 'under_100') return { min: 0, max: 100 }
  if (value === '100_150') return { min: 100, max: 150 }
  if (value === '150_200') return { min: 150, max: 200 }
  if (value === 'over_200') return { min: 200, max: Infinity }
  return { min: 100, max: 150 }
}

const getCityPrefix = (value) =>
  String(value || '')
    .replace(/省|市|自治区|特别行政区|自治州|地区|盟/g, '')
    .trim()
    .slice(0, 2)

const hasIntersection = (arrA, arrB) => {
  const setA = new Set((arrA || []).map((v) => String(v)))
  return (arrB || []).some((v) => setA.has(String(v)))
}

const styleSimilarityScore = (teacherStyle, parentStyle) => {
  const a = String(teacherStyle || '').trim().toLowerCase()
  const b = String(parentStyle || '').trim().toLowerCase()
  if (!a || !b) return 50
  if (a === b) return 100
  const nearby = [
    ['strict', 'guiding'],
    ['gentle', 'guiding'],
    ['flexible', 'guiding']
  ]
  return nearby.some(([x, y]) => (a === x && b === y) || (a === y && b === x)) ? 50 : 0
}

const getCurrentWeekNumber = () => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), 0, 1)
  const offset = Math.floor((now - firstDay) / 86400000)
  return Math.ceil((offset + firstDay.getDay() + 1) / 7)
}

const evaluateTeacherCandidate = ({ request, parentProfile, teacherProfile, strictStyle = true, strictCity = true }) => {
  const reqBudget = parseBudgetRange(request.budget)
  const teacherBudget = feeRangeToBudgetRange(teacherProfile.fee_range)
  const parentCity = String(parentProfile.city || '')
  const parentDistrict = String(parentProfile.district || '')
  const teacherCity = String(teacherProfile.city || '')
  const teacherDistrict = String(teacherProfile.district || '')
  const sameCity = parentCity && teacherCity && parentCity === teacherCity
  const samePrefecture = parentCity && teacherCity && getCityPrefix(parentCity) === getCityPrefix(teacherCity)
  const districtMatched = parentDistrict && teacherDistrict && parentDistrict === teacherDistrict

  const cityMatched = strictCity ? sameCity : sameCity || samePrefecture
  const cityScore = districtMatched ? 100 : cityMatched ? 50 : 0
  const subjectScore = hasIntersection(parseArrayField(teacherProfile.subjects), [request.subject]) ? 100 : 0
  const gradeScore = hasIntersection(parseArrayField(teacherProfile.grades), [request.grade]) ? 100 : 0
  const styleRaw = styleSimilarityScore(teacherProfile.teaching_style, parentProfile.teaching_style_preference)
  const styleScore = strictStyle ? styleRaw : Math.max(styleRaw, 50)
  const genderPref = String(parentProfile.teacher_gender_preference || 'any')
  const genderOk = !genderPref || genderPref === 'any' || genderPref === String(teacherProfile.gender || '')
  const genderScore = genderOk ? 100 : 0
  const budgetOk = teacherBudget.max >= reqBudget.min && teacherBudget.min <= reqBudget.max
  const budgetScore = budgetOk ? 100 : 0

  const score = cityScore * 0.25 + subjectScore * 0.25 + gradeScore * 0.15 + styleScore * 0.15 + genderScore * 0.1 + budgetScore * 0.1
  const tips = []
  if (!budgetOk) tips.push('预算需协商')
  if (!genderOk) tips.push('性别偏好不一致')
  return { score: Number(score.toFixed(2)), tips }
}

const selectTeacherCandidates = ({ request, parentProfile, teachers }) => {
  const build = (strictStyle, strictCity, includeZero = false) =>
    teachers
      .map((teacher) => ({
        teacher,
        ...evaluateTeacherCandidate({ request, parentProfile, teacherProfile: teacher, strictStyle, strictCity })
      }))
      .filter((item) => (includeZero ? item.score >= 0 : item.score > 0))
      .sort((a, b) => b.score - a.score)

  const roundA = build(true, true)
  if (roundA.length >= 2) return roundA.slice(0, 3).map((item) => ({ ...item, degradeLevel: 0 }))

  const roundB = build(false, true)
  if (roundB.length >= 2) return roundB.slice(0, 3).map((item) => ({ ...item, degradeLevel: 1 }))

  const roundC = build(false, false, false)
  if (roundC.length >= 2) return roundC.slice(0, 3).map((item) => ({ ...item, degradeLevel: 2 }))

  const roundD = build(false, false, true)
  return roundD.slice(0, 2).map((item) => ({
    ...item,
    degradeLevel: 3,
    tips: [...new Set([...item.tips, '当前区域匹配对象较少，已推送最接近候选'])]
  }))
}

const loadParentProfile = async (parentId) => {
  const [userRows] = await pool.query('SELECT city FROM users WHERE id = ? LIMIT 1', [parentId])
  const userCity = String(userRows[0]?.city || '')
  try {
    const [rows] = await pool.query(
      'SELECT city, district, teaching_style_preference, teacher_gender_preference FROM parent_profiles WHERE user_id = ? LIMIT 1',
      [parentId]
    )
    if (!rows.length) return { city: userCity, district: '', teaching_style_preference: '', teacher_gender_preference: 'any' }
    return {
      city: String(rows[0]?.city || userCity),
      district: String(rows[0]?.district || ''),
      teaching_style_preference: String(rows[0]?.teaching_style_preference || ''),
      teacher_gender_preference: String(rows[0]?.teacher_gender_preference || 'any')
    }
  } catch {
    return { city: userCity, district: '', teaching_style_preference: '', teacher_gender_preference: 'any' }
  }
}

const loadApprovedTeacherProfiles = async () => {
  const [rows] = await pool.query(
    `SELECT tp.*, u.nickname
       FROM teacher_profiles tp
       JOIN users u ON u.id = tp.user_id
      WHERE u.role = 'teacher'
        AND COALESCE(tp.verify_status, 'pending') = 'approved'
        AND COALESCE(tp.is_active, 1) = 1`
  )
  return rows
}

const runMatchingForRequests = async (requestIds = null) => {
  const ids = Array.isArray(requestIds) ? requestIds.filter((id) => Number(id) > 0) : null
  const [requestRows] = ids && ids.length
    ? await pool.query(
        `SELECT id, parent_id, subject, grade, budget
           FROM requests
          WHERE id IN (${ids.map(() => '?').join(',')})
            AND status IN ('pending', 'matching')`,
        ids
      )
    : await pool.query(
        `SELECT id, parent_id, subject, grade, budget
           FROM requests
          WHERE status IN ('pending', 'matching')`
      )
  if (!requestRows.length) return { generated: 0 }

  const teachers = await loadApprovedTeacherProfiles()
  if (!teachers.length) return { generated: 0 }

  const weekNumber = getCurrentWeekNumber()
  let generated = 0
  for (const request of requestRows) {
    const parentProfile = await loadParentProfile(Number(request.parent_id))
    const candidates = selectTeacherCandidates({ request, parentProfile, teachers })
    for (const candidate of candidates) {
      await pool.query(
        `INSERT INTO matches
          (teacher_id, parent_id, request_id, match_score, status, parent_accept_status, teacher_accept_status, unlock_granted, feedback_submitted, rematch_count, feedback_reason, degrade_level, match_tips, week_number)
         VALUES (?, ?, ?, ?, 'new', 'pending', 'pending', 0, 0, 0, '', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           match_score = VALUES(match_score),
           degrade_level = VALUES(degrade_level),
           match_tips = VALUES(match_tips),
           week_number = VALUES(week_number),
           matched_at = NOW(),
           feedback_reason = CASE WHEN feedback_submitted = 0 THEN '' ELSE feedback_reason END`,
        [
          Number(candidate.teacher.user_id),
          Number(request.parent_id),
          Number(request.id),
          Number(candidate.score),
          Number(candidate.degradeLevel),
          JSON.stringify(candidate.tips || []),
          weekNumber
        ]
      )
      generated += 1
    }
  }
  return { generated }
}

const runWeeklyMatching = async () => {
  const result = await runMatchingForRequests()
  return { success: true, generated: Number(result.generated || 0), ranAt: new Date().toISOString() }
}

let lastWeeklyMatchKey = ''
const maybeRunScheduledMatching = async () => {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  const minute = now.getMinutes()
  if (![3, 5].includes(day) || hour !== 18 || minute > 5) return
  const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  if (lastWeeklyMatchKey === key) return
  try {
    const result = await runWeeklyMatching()
    lastWeeklyMatchKey = key
    console.log(`[matching] scheduled weekly matching done: ${JSON.stringify(result)}`)
  } catch (error) {
    console.error('[matching] scheduled weekly matching failed:', error?.message || error)
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    ok(res, { status: 'up', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    fail(res, 500, 'Database connection failed')
  }
})

app.post('/api/matching/run-weekly', authRequired(), async (_req, res) => {
  try {
    const result = await runWeeklyMatching()
    ok(res, result, '匹配任务执行成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/parent/register', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const nickname = String(req.body?.nickname || '').trim()
  if (!phone || !password || !nickname) return fail(res, 400, 'phone, password and nickname are required')
  if (password.length < 6) return fail(res, 400, 'password must be at least 6 chars')
  try {
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
    if (exists.length) return fail(res, 409, '手机号已注册')
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
       VALUES ('parent', ?, ?, ?, '', '', '', '[]')`,
      [nickname, phone, hash]
    )
    await pool.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
       VALUES (?, '体验用户', NULL, 3, 0, FALSE)`,
      [result.insertId]
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
    const user = await getUserByPhone(phone, 'parent')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) return fail(res, 401, 'Unauthorized')
    ok(res, buildAuthPayload(user), '登录成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/teacher/register', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const nickname = String(req.body?.nickname || '').trim()
  const subject = String(req.body?.subject || '').trim()
  const experience = String(req.body?.experience || '').trim()
  if (!phone || !password || !nickname) return fail(res, 400, 'phone, password and nickname are required')
  if (password.length < 6) return fail(res, 400, 'password must be at least 6 chars')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [exists] = await conn.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
    if (exists.length) {
      await conn.rollback()
      return fail(res, 409, '手机号已注册')
    }
    const hash = await bcrypt.hash(password, 10)
    const [result] = await conn.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
       VALUES ('teacher', ?, ?, ?, '', ?, '', ?)`,
      [nickname, phone, hash, experience, JSON.stringify(subject ? [subject] : [])]
    )
    await conn.query(
      `INSERT INTO teacher_profiles
        (user_id, real_name, city, subjects, grades, experience_years, teaching_mode, available_time_text, rating_avg, rating_count, is_active, intro)
       VALUES (?, ?, '', ?, '[]', ?, 'both', '工作日晚间、周末可约', 0, 0, TRUE, ?)`,
      [result.insertId, nickname, JSON.stringify(subject ? [subject] : []), Number.parseInt(experience, 10) || 0, experience]
    )
    await conn.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
       VALUES (?, '普通老师', NULL, 0, 1, FALSE)`,
      [result.insertId]
    )
    await conn.commit()
    const user = await getUserById(result.insertId)
    ok(res, buildAuthPayload(user), '注册成功')
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

app.post('/api/auth/teacher/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  if (!phone || !password) return fail(res, 400, 'phone and password are required')
  try {
    const user = await getUserByPhone(phone, 'teacher')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) return fail(res, 401, 'Unauthorized')
    await ensureTeacherProfile(user)
    ok(res, buildAuthPayload(user), '登录成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/auth/me', authRequired(), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) return fail(res, 404, 'User not found')
    ok(res, { id: user.id, role: user.role, nickname: user.nickname, phone: user.phone, city: user.city || '', bio: user.bio || '', avatar: user.avatar || '' })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/logout', authRequired(), (_req, res) => ok(res, { success: true }, '退出成功'))

// Compatibility teacher auth
app.post('/api/teacher/auth/send-code', async (_req, res) => ok(res, { sent: true, ttlSeconds: 300 }))
app.post('/api/teacher/auth/register', async (req, res) => {
  req.url = '/api/auth/teacher/register'
  app._router.handle(req, res, () => {})
})
app.post('/api/teacher/auth/login', async (req, res) => {
  req.url = '/api/auth/teacher/login'
  app._router.handle(req, res, () => {})
})
app.post('/api/teacher/auth/logout', authRequired('teacher'), (_req, res) => ok(res, { logout: true }))
app.get('/api/teacher/auth/me', authRequired('teacher'), async (req, res) => {
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  ok(res, { id: user.id, nickname: user.nickname, phone: user.phone, city: user.city || '' })
})

// Parent routes
app.get('/api/parent/profile', authRequired('parent'), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) return fail(res, 404, 'User not found')
    const [children] = await pool.query('SELECT * FROM children WHERE parent_id = ?', [req.user.id])
    ok(res, {
      parentName: user.nickname,
      phone: user.phone,
      city: user.city || '',
      bio: user.bio || '',
      avatar: user.avatar || '',
      preferredGrade: user.preferred_grade || '',
      preferredSubjects: parseArrayField(user.preferred_subjects),
      children: children.map((c) => ({ id: Number(c.id), name: c.name, grade: c.grade, targetSubject: c.target_subject }))
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/profile', authRequired('parent'), async (req, res) => {
  const p = req.body || {}
  if (!p.parentName || !p.phone) return fail(res, 400, 'parentName and phone are required')
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(
      'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=? WHERE id=?',
      [p.parentName, p.phone, p.city || '', p.bio || '', p.preferredGrade || '', JSON.stringify(p.preferredSubjects || []), req.user.id]
    )
    await conn.query('DELETE FROM children WHERE parent_id=?', [req.user.id])
    if (Array.isArray(p.children) && p.children.length) {
      await conn.query('INSERT INTO children (parent_id, name, grade, target_subject) VALUES ?', [
        p.children.map((c) => [req.user.id, c.name || '', c.grade || '', c.targetSubject || ''])
      ])
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
  await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id])
  ok(res, { avatar })
})

app.get('/api/parent/requests', authRequired('parent'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM requests WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
  ok(res, rows.map(mapRequest))
})

app.get('/api/parent/requests/:id', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid request id')
  const [rows] = await pool.query('SELECT * FROM requests WHERE id = ? AND parent_id = ? LIMIT 1', [id, req.user.id])
  if (!rows.length) return fail(res, 404, 'Request not found')
  ok(res, mapRequest(rows[0]))
})

app.post('/api/parent/requests', authRequired('parent'), async (req, res) => {
  const p = req.body || {}
  const title = String(p.title || '').trim()
  if (!title) return fail(res, 400, 'title is required')
  try {
    const [result] = await pool.query(
      `INSERT INTO requests (parent_id, title, subject, grade, budget, schedule, description, status, teacher_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [req.user.id, title, String(p.subject || ''), String(p.grade || ''), String(p.budget || ''), String(p.schedule || ''), String(p.description || ''), String(p.teacherName || '')]
    )
    ok(res, { id: result.insertId })
  } catch (error) {
    if (isOptionalSchemaError(error)) {
      const [result] = await pool.query(
        `INSERT INTO requests (parent_id, title, subject, grade, budget, schedule, status, teacher_name)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [req.user.id, title, String(p.subject || ''), String(p.grade || ''), String(p.budget || ''), String(p.schedule || ''), String(p.teacherName || '')]
      )
      return ok(res, { id: result.insertId })
    }
    fail(res, 500, error.message)
  }
})

app.patch('/api/parent/requests/:id/status', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body?.status || '')
  if (!['pending', 'matching', 'scheduled', 'completed', 'cancelled'].includes(status)) return fail(res, 400, 'Invalid status')
  const [result] = await pool.query('UPDATE requests SET status = ? WHERE id = ? AND parent_id = ?', [status, id, req.user.id])
  if (!result.affectedRows) return fail(res, 404, 'Request not found')
  ok(res, { id, status })
})

app.get('/api/parent/reviews', authRequired('parent'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM reviews WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
  ok(
    res,
    rows.map((r) => ({ id: Number(r.id), teacherName: r.teacher_name, subject: r.subject, rating: Number(r.rating || 0), content: r.content || '', reply: r.reply || '', date: toDate(r.created_at) }))
  )
})

app.post('/api/parent/reviews/:id/reply', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const reply = String(req.body?.reply || '').trim()
  if (!reply) return fail(res, 400, 'reply cannot be empty')
  const [result] = await pool.query('UPDATE reviews SET reply = ? WHERE id = ? AND parent_id = ?', [reply, id, req.user.id])
  if (!result.affectedRows) return fail(res, 404, 'Review not found')
  ok(res, { id, reply })
})

app.get('/api/parent/settings', authRequired('parent'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id])
  ok(res, { notifications: parseObjectField(rows[0]?.notifications), privacy: parseObjectField(rows[0]?.privacy) })
})

app.put('/api/parent/settings/password', authRequired('parent'), async (req, res) => {
  const current = String(req.body?.current_password || '')
  const next = String(req.body?.new_password || '')
  if (next.length < 6) return fail(res, 400, 'New password must be at least 6 chars')
  const user = await getUserById(req.user.id)
  if (!user || !(await bcrypt.compare(current, user.password_hash || ''))) return fail(res, 400, 'Current password is incorrect')
  await pool.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(next, 10), req.user.id])
  ok(res, { updated: true })
})

app.put('/api/parent/settings/notifications', authRequired('parent'), async (req, res) => {
  const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [req.user.id])
  const next = { ...parseObjectField(rows[0]?.notifications), ...(req.body || {}) }
  await pool.query('INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)', [req.user.id, JSON.stringify(next)])
  ok(res, next)
})

app.put('/api/parent/settings/privacy', authRequired('parent'), async (req, res) => {
  const [rows] = await pool.query('SELECT privacy FROM user_settings WHERE user_id = ?', [req.user.id])
  const next = { ...parseObjectField(rows[0]?.privacy), ...(req.body || {}) }
  await pool.query('INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)', [req.user.id, JSON.stringify(next)])
  ok(res, next)
})

app.post('/api/parent/settings/deactivate', authRequired('parent'), async (req, res) => {
  if (req.body?.confirm_text !== '注销账号') return fail(res, 400, 'Confirm text mismatch')
  await pool.query('INSERT INTO user_settings (user_id, deactivated) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE deactivated=TRUE', [req.user.id])
  ok(res, { deactivated: true })
})

app.get('/api/parent/notifications', authRequired('parent'), async (req, res) => {
  try {
    const [matchRows] = await pool.query(
      `SELECT m.id, m.request_id, m.status, m.parent_accept_status, m.teacher_accept_status, m.unlock_granted, m.matched_at,
              r.title, r.subject, r.grade, u.nickname AS teacher_name
         FROM matches m
         JOIN requests r ON r.id = m.request_id
         JOIN users u ON u.id = m.teacher_id
        WHERE m.parent_id = ?
        ORDER BY m.matched_at DESC
        LIMIT 30`,
      [req.user.id]
    )

    const notifications = matchRows.map((row) => {
      let content = `老师 ${row.teacher_name} 与你的需求「${row.title}」已进入匹配池。`
      if (row.status === 'unlocked') content = `老师 ${row.teacher_name} 已解锁联系方式，请及时沟通。`
      if (row.unlock_granted) content = `双方已接受，老师 ${row.teacher_name} 可解锁联系方式。`
      if (row.teacher_accept_status === 'accepted') content = `老师 ${row.teacher_name} 已接受你的需求，可继续推进沟通。`
      if (row.teacher_accept_status === 'rejected') content = `老师 ${row.teacher_name} 暂不接受该需求，建议重新筛选。`
      return {
        id: Number(row.id),
        matchId: Number(row.id),
        requestId: Number(row.request_id),
        title: `需求更新：${row.title || '未命名需求'}`,
        content,
        createdAt: toISO(row.matched_at),
        status: row.status,
        teacherName: row.teacher_name,
        subject: row.subject,
        grade: row.grade
      }
    })

    ok(res, { matchUpdates: notifications, systemNotices: [] })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

// Teacher routes
app.get('/api/teacher/profile', authRequired('teacher'), async (req, res) => {
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  ok(res, await teacherDTO(user))
})

app.put('/api/teacher/profile', authRequired('teacher'), async (req, res) => {
  const p = req.body || {}
  if (!p.teacherName || !p.phone) return fail(res, 400, 'teacherName and phone are required')
  const grades = Array.isArray(p.preferredGrades) ? p.preferredGrades : []
  const subjects = Array.isArray(p.preferredSubjects) ? p.preferredSubjects : []
  await pool.query(
    'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=?, wechat=? WHERE id=?',
    [p.teacherName, p.phone, p.city || '', p.bio || '', grades.join(','), JSON.stringify(subjects), String(p.wechat || ''), req.user.id]
  )
  await pool.query(
    `INSERT INTO teacher_profiles (user_id, real_name, city, district, subjects, grades, experience_years, teaching_style, student_type, areas, intro, teaching_mode, available_time_text, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT teaching_mode FROM teacher_profiles WHERE user_id=?), 'both'), COALESCE((SELECT available_time_text FROM teacher_profiles WHERE user_id=?), ''), TRUE)
     ON DUPLICATE KEY UPDATE
       real_name=VALUES(real_name), city=VALUES(city), district=VALUES(district), subjects=VALUES(subjects), grades=VALUES(grades),
       experience_years=VALUES(experience_years), teaching_style=VALUES(teaching_style), student_type=VALUES(student_type), areas=VALUES(areas), intro=VALUES(intro), is_active=TRUE`,
    [req.user.id, p.teacherName, p.city || '', String(p.district || ''), JSON.stringify(subjects), JSON.stringify(grades), Number(p.experienceYears || 0), String(p.teachingStyle || ''), String(p.studentType || ''), JSON.stringify(Array.isArray(p.areas) ? p.areas : []), String(p.bio || ''), req.user.id, req.user.id]
  )
  ok(res, { updated: true })
})

app.post('/api/teacher/avatar', authRequired('teacher'), async (req, res) => {
  const avatar = String(req.body?.avatar || '')
  if (!avatar) return fail(res, 400, 'Missing avatar data')
  await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id])
  ok(res, { avatar })
})

app.post('/api/teacher/verification/upload', authRequired('teacher'), async (req, res) => {
  const certType = String(req.body?.certType || 'work_proof')
  const certUrl = String(req.body?.certUrl || '').trim()
  if (!certUrl) return fail(res, 400, 'certUrl is required')
  await pool.query('INSERT INTO teacher_verifications (user_id, cert_type, cert_url, status) VALUES (?, ?, ?, ?)', [req.user.id, certType, certUrl, 'pending'])
  await pool.query('UPDATE teacher_profiles SET verify_status=?, verify_remark=? WHERE user_id=?', ['pending', '', req.user.id])
  ok(res, { submitted: true })
})

app.get('/api/teacher/verification/status', authRequired('teacher'), async (req, res) => {
  const [profileRows] = await pool.query('SELECT verify_status, verified, verify_remark FROM teacher_profiles WHERE user_id=?', [req.user.id])
  const [certRows] = await pool.query('SELECT cert_type, cert_url, status, review_remark, created_at FROM teacher_verifications WHERE user_id=? ORDER BY created_at DESC', [req.user.id])
  ok(res, {
    verifyStatus: profileRows[0]?.verify_status || 'pending',
    verified: !!profileRows[0]?.verified,
    verifyRemark: profileRows[0]?.verify_remark || '',
    certificates: certRows.map((c) => ({ certType: c.cert_type, certUrl: c.cert_url, status: c.status, reviewRemark: c.review_remark, createdAt: toISO(c.created_at) }))
  })
})

app.post('/api/teacher/questionnaire', authRequired('teacher'), async (req, res) => {
  const answers = req.body?.answers
  if (!answers || typeof answers !== 'object') return fail(res, 400, 'answers is required')
  await pool.query(
    `INSERT INTO questionnaires (user_id, role, answers, version)
     VALUES (?, 'teacher', ?, 'v1')
     ON DUPLICATE KEY UPDATE answers=VALUES(answers), updated_at=NOW()`,
    [req.user.id, JSON.stringify(answers)]
  )
  ok(res, { saved: true })
})

app.get('/api/teacher/questionnaire/latest', authRequired('teacher'), async (req, res) => {
  const [rows] = await pool.query("SELECT answers, updated_at FROM questionnaires WHERE user_id = ? AND role = 'teacher' ORDER BY updated_at DESC LIMIT 1", [req.user.id])
  ok(res, { answers: parseObjectField(rows[0]?.answers), updatedAt: rows[0]?.updated_at ? toISO(rows[0].updated_at) : null })
})

app.get('/api/teacher/requests', authRequired('teacher'), async (req, res) => {
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname AS parent_name
       FROM requests r
       JOIN users u ON r.parent_id = u.id
      WHERE r.teacher_name = ? OR r.teacher_name = '' OR r.teacher_name IS NULL
      ORDER BY r.created_at DESC`,
    [user.nickname]
  )
  ok(res, rows.map((r) => ({ ...mapRequest(r), parentName: r.parent_name || '家长', isMine: r.teacher_name === user.nickname })))
})

app.post('/api/teacher/requests/:id/accept', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  const [result] = await pool.query(
    `UPDATE requests SET teacher_name=?, status='scheduled'
      WHERE id=? AND (teacher_name='' OR teacher_name IS NULL OR teacher_name=?)`,
    [user.nickname, id, user.nickname]
  )
  if (!result.affectedRows) return fail(res, 404, 'Request not found or already claimed')
  ok(res, { id, accepted: true })
})

app.post('/api/teacher/requests/:id/release', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  const [result] = await pool.query("UPDATE requests SET teacher_name='', status='matching' WHERE id=? AND teacher_name=?", [id, user.nickname])
  if (!result.affectedRows) return fail(res, 404, 'Request not found or no permission')
  ok(res, { id, released: true })
})

app.patch('/api/teacher/requests/:id/status', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body?.status || '')
  if (!['pending', 'matching', 'scheduled', 'completed', 'cancelled'].includes(status)) return fail(res, 400, 'Invalid status')
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  const [result] = await pool.query('UPDATE requests SET status=? WHERE id=? AND teacher_name=?', [status, id, user.nickname])
  if (!result.affectedRows) return fail(res, 404, 'Request not found or no permission')
  ok(res, { id, status })
})

app.get('/api/teacher/reviews', authRequired('teacher'), async (req, res) => {
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  const [rows] = await pool.query(
    `SELECT r.*, u.nickname AS parent_name
       FROM reviews r
       JOIN users u ON r.parent_id = u.id
      WHERE r.teacher_name = ?
      ORDER BY r.created_at DESC`,
    [user.nickname]
  )
  ok(res, rows.map((r) => ({ id: Number(r.id), parentName: r.parent_name, subject: r.subject, rating: Number(r.rating || 0), content: r.content || '', date: toDate(r.created_at) })))
})

app.get('/api/teacher/analytics', authRequired('teacher'), async (req, res) => {
  const user = await getUserById(req.user.id)
  if (!user) return fail(res, 404, 'Teacher not found')
  const [requestRows] = await pool.query('SELECT status, COUNT(*) AS count FROM requests WHERE teacher_name=? GROUP BY status', [user.nickname])
  const [reviewRows] = await pool.query('SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM reviews WHERE teacher_name=?', [user.nickname])
  const counter = requestRows.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count || 0) }), {})
  const total = Object.values(counter).reduce((sum, n) => sum + Number(n || 0), 0)
  ok(res, {
    weeklyViews: 120 + total * 18,
    totalViews: (120 + total * 18) * 8,
    pendingRequests: Number(counter.pending || 0) + Number(counter.matching || 0),
    scheduledRequests: Number(counter.scheduled || 0),
    completedRequests: Number(counter.completed || 0),
    averageRating: Number(reviewRows[0]?.average_rating || 0),
    totalReviews: Number(reviewRows[0]?.total_reviews || 0),
    responseRate: total === 0 ? 0 : (Number(counter.completed || 0) + Number(counter.scheduled || 0)) / total
  })
})

const mapMatchItem = (row) => ({
  id: Number(row.id),
  parentId: Number(row.parent_id),
  requestId: Number(row.request_id),
  title: String(row.title || ''),
  subject: String(row.subject || ''),
  grade: String(row.grade || ''),
  budget: String(row.budget || ''),
  schedule: String(row.schedule || ''),
  requestStatus: String(row.request_status || ''),
  parentName: String(row.parent_name || '家长'),
  city: String(row.parent_city || ''),
  matchScore: Number(row.match_score || 0),
  status: String(row.status || 'new'),
  parentAcceptStatus: String(row.parent_accept_status || 'pending'),
  teacherAcceptStatus: String(row.teacher_accept_status || 'pending'),
  unlockGranted: !!row.unlock_granted,
  rematchCount: Number(row.rematch_count || 0),
  degradeLevel: Number(row.degrade_level || 0),
  matchTips: parseArrayField(row.match_tips),
  matchedAt: toISO(row.matched_at),
  unlockedAt: row.unlocked_at ? toISO(row.unlocked_at) : null
})

const getTeacherMatchById = async (teacherId, matchId) => {
  const [rows] = await pool.query(
    `SELECT m.*, r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status, u.nickname AS parent_name, u.city AS parent_city
       FROM matches m
       JOIN requests r ON r.id = m.request_id
       JOIN users u ON u.id = m.parent_id
      WHERE m.id = ? AND m.teacher_id = ?
      LIMIT 1`,
    [matchId, teacherId]
  )
  return rows[0] || null
}

const getParentMatchById = async (parentId, matchId) => {
  const [rows] = await pool.query(
    `SELECT m.*
       FROM matches m
      WHERE m.id = ? AND m.parent_id = ?
      LIMIT 1`,
    [matchId, parentId]
  )
  return rows[0] || null
}

const grantUnlockIfBothAccepted = async (matchId) => {
  const [rows] = await pool.query('SELECT parent_accept_status, teacher_accept_status, unlock_granted FROM matches WHERE id = ? LIMIT 1', [matchId])
  const match = rows[0]
  if (!match) return
  if (!match.unlock_granted && match.parent_accept_status === 'accepted' && match.teacher_accept_status === 'accepted') {
    await pool.query("UPDATE matches SET unlock_granted = 1, status = 'accepted' WHERE id = ?", [matchId])
  }
}

app.get('/api/teacher/matches', authRequired('teacher'), async (req, res) => {
  try {
    await runMatchingForRequests()
    const status = String(req.query?.status || '').trim()
    const grade = String(req.query?.grade || '').trim()
    const subject = String(req.query?.subject || '').trim()
    const city = String(req.query?.city || '').trim()
    const district = String(req.query?.district || '').trim()
    const budgetMin = req.query?.budgetMin === undefined ? null : Number(req.query.budgetMin)
    const budgetMax = req.query?.budgetMax === undefined ? null : Number(req.query.budgetMax)

    const [rows] = await pool.query(
      `SELECT m.*, r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status,
              u.nickname AS parent_name, u.city AS parent_city
         FROM matches m
         JOIN requests r ON r.id = m.request_id
         JOIN users u ON u.id = m.parent_id
        WHERE m.teacher_id = ?
        ORDER BY m.matched_at DESC, m.match_score DESC`,
      [req.user.id]
    )

    const list = rows
      .filter((row) => {
        if (status && row.status !== status) return false
        if (grade && String(row.grade || '') !== grade) return false
        if (subject && String(row.subject || '') !== subject) return false
        if (city && String(row.parent_city || '') !== city) return false
        if (district && city && String(row.parent_city || '') !== city) return false
        const budget = parseBudgetRange(row.budget)
        if (budgetMin !== null && Number.isFinite(budgetMin) && budget.max < budgetMin) return false
        if (budgetMax !== null && Number.isFinite(budgetMax) && budget.min > budgetMax) return false
        return true
      })
      .map(mapMatchItem)
    ok(res, list)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/matches/:id/unlock', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const unlockType = String(req.body?.unlockType || 'phone')
  if (!['phone', 'wechat'].includes(unlockType)) return fail(res, 400, 'Invalid unlockType')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [matchRows] = await conn.query('SELECT * FROM matches WHERE id = ? AND teacher_id = ? LIMIT 1 FOR UPDATE', [id, req.user.id])
    const match = matchRows[0]
    if (!match) {
      await conn.rollback()
      return fail(res, 404, 'Match not found')
    }
    if (!match.unlock_granted) {
      await conn.rollback()
      return fail(res, 403, '需双方接受后才可解锁')
    }
    const [memberRows] = await conn.query('SELECT * FROM memberships WHERE user_id = ? LIMIT 1 FOR UPDATE', [req.user.id])
    if (!memberRows.length) {
      await conn.query(
        `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
         VALUES (?, '普通老师', NULL, 0, 1, FALSE)`,
        [req.user.id]
      )
    }
    const [lockedRows] = await conn.query('SELECT * FROM memberships WHERE user_id = ? LIMIT 1 FOR UPDATE', [req.user.id])
    const member = lockedRows[0]
    const serviceFee = 5
    await conn.query("UPDATE matches SET status='unlocked', unlocked_at=NOW() WHERE id = ?", [id])
    await conn.query(
      'INSERT INTO contact_unlock_records (teacher_id, parent_id, request_id, unlock_type, unlock_cost) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, match.parent_id, match.request_id, unlockType, serviceFee]
    )
    const [parentRows] = await conn.query('SELECT nickname, phone, wechat FROM users WHERE id = ? LIMIT 1', [match.parent_id])
    await conn.commit()
    const parent = parentRows[0] || {}
    ok(res, {
      unlocked: true,
      parentName: String(parent.nickname || '家长'),
      phone: String(parent.phone || ''),
      wechat: String(parent.wechat || ''),
      serviceFee,
      remainingUnlock: Number(member.remaining_unlock || 0)
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
  const [result] = await pool.query(
    "UPDATE matches SET teacher_accept_status='accepted', status='accepted' WHERE id = ? AND teacher_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  await grantUnlockIfBothAccepted(id)
  ok(res, { id, accepted: true })
})

app.post('/api/teacher/matches/:id/reject', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET teacher_accept_status='rejected', status='rejected' WHERE id = ? AND teacher_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  ok(res, { id, rejected: true })
})

app.post('/api/teacher/matches/:id/feedback', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return fail(res, 400, 'reason is required')
  const match = await getTeacherMatchById(req.user.id, id)
  if (!match) return fail(res, 404, 'Match not found')

  await pool.query(
    `UPDATE matches
        SET feedback_submitted = 1,
            feedback_reason = ?,
            rematch_count = LEAST(rematch_count + 1, 10),
            last_feedback_at = NOW()
      WHERE id = ? AND teacher_id = ?`,
    [reason, id, req.user.id]
  )

  const before = await pool.query(
    'SELECT COUNT(*) AS count FROM matches WHERE teacher_id = ? AND request_id = ?',
    [req.user.id, match.request_id]
  )
  await runMatchingForRequests([Number(match.request_id)])
  const after = await pool.query(
    'SELECT COUNT(*) AS count FROM matches WHERE teacher_id = ? AND request_id = ?',
    [req.user.id, match.request_id]
  )
  const generated = Math.max(0, Number(after[0][0]?.count || 0) - Number(before[0][0]?.count || 0))
  ok(res, { rematched: true, generated })
})

app.get('/api/teacher/unlock-records', authRequired('teacher'), async (req, res) => {
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
    rows.map((row) => ({
      id: Number(row.id),
      parentId: Number(row.parent_id),
      parentName: String(row.parent_name || '家长'),
      requestId: Number(row.request_id),
      unlockType: row.unlock_type,
      unlockCost: Number(row.unlock_cost || 0),
      createdAt: toISO(row.created_at)
    }))
  )
})

app.get('/api/teacher/dashboard/summary', authRequired('teacher'), async (req, res) => {
  const [countRows] = await pool.query(
    `SELECT
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN status = 'unlocked' THEN 1 ELSE 0 END) AS unlocked_count,
        SUM(CASE WHEN status IN ('accepted','unlocked') THEN 1 ELSE 0 END) AS processing_count
       FROM matches
      WHERE teacher_id = ?`,
    [req.user.id]
  )
  const [memberRows] = await pool.query('SELECT remaining_unlock FROM memberships WHERE user_id = ? LIMIT 1', [req.user.id])
  const [reviewRows] = await pool.query('SELECT COUNT(*) AS total_reviews, AVG(rating) AS avg_rating FROM reviews WHERE teacher_name = (SELECT nickname FROM users WHERE id = ?)', [req.user.id])
  const [unlockRows] = await pool.query('SELECT COUNT(*) AS total_unlock FROM contact_unlock_records WHERE teacher_id = ?', [req.user.id])
  ok(res, {
    newMatchCount: Number(countRows[0]?.new_count || 0),
    unlockedMatchCount: Number(countRows[0]?.unlocked_count || 0),
    processingRequestCount: Number(countRows[0]?.processing_count || 0),
    remainingUnlock: Number(memberRows[0]?.remaining_unlock || 0),
    integrityScore: Number(reviewRows[0]?.avg_rating || 0) ? Number((Number(reviewRows[0].avg_rating) * 20).toFixed(0)) : 80,
    totalReviewCount: Number(reviewRows[0]?.total_reviews || 0),
    totalUnlockCount: Number(unlockRows[0]?.total_unlock || 0),
    totalViewCount: Number(countRows[0]?.new_count || 0) * 3 + Number(countRows[0]?.unlocked_count || 0) * 2
  })
})

app.get('/api/parent/matches', authRequired('parent'), async (req, res) => {
  const status = String(req.query?.status || '').trim()
  const [rows] = await pool.query(
    `SELECT m.*, r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status, u.nickname AS teacher_name
       FROM matches m
       JOIN requests r ON r.id = m.request_id
       JOIN users u ON u.id = m.teacher_id
      WHERE m.parent_id = ?
      ORDER BY m.matched_at DESC, m.match_score DESC`,
    [req.user.id]
  )
  const filtered = status ? rows.filter((row) => row.status === status) : rows
  ok(
    res,
    filtered.map((row) => ({
      ...mapMatchItem({ ...row, parent_name: '' }),
      teacherName: String(row.teacher_name || '老师')
    }))
  )
})

app.post('/api/parent/matches/:id/accept', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET parent_accept_status='accepted', status='accepted' WHERE id = ? AND parent_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  await grantUnlockIfBothAccepted(id)
  ok(res, { id, accepted: true })
})

app.post('/api/parent/matches/:id/reject', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET parent_accept_status='rejected', status='rejected' WHERE id = ? AND parent_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  ok(res, { id, rejected: true })
})

app.post('/api/parent/matches/:id/feedback', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const reason = String(req.body?.reason || '').trim()
  if (!reason) return fail(res, 400, 'reason is required')
  const match = await getParentMatchById(req.user.id, id)
  if (!match) return fail(res, 404, 'Match not found')
  await pool.query(
    `UPDATE matches
        SET feedback_submitted = 1,
            feedback_reason = ?,
            rematch_count = LEAST(rematch_count + 1, 10),
            last_feedback_at = NOW()
      WHERE id = ? AND parent_id = ?`,
    [reason, id, req.user.id]
  )
  await runMatchingForRequests([Number(match.request_id)])
  ok(res, { rematched: true, generated: 0 })
})

// Membership
app.get('/api/membership/status', authRequired(), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM memberships WHERE user_id=?', [req.user.id])
  if (!rows.length) {
    const name = req.user.role === 'teacher' ? '普通老师' : '普通用户'
    return ok(res, { planName: name, expireAt: null, remainingUnlock: 0, weeklyPriorityQuota: 0 })
  }
  const m = rows[0]
  const unlimitedUnlock = req.user.role === 'parent' && String(m.plan_name || '').includes('家长会员')
  ok(res, {
    planName: m.plan_name,
    expireAt: m.expire_at ? toDate(m.expire_at) : null,
    remainingUnlock: unlimitedUnlock ? 9999 : Number(m.remaining_unlock || 0),
    weeklyPriorityQuota: Number(m.weekly_priority_quota || 0),
    unlimitedUnlock,
    autoRenew: !!m.auto_renew
  })
})

app.get('/api/membership/plans', async (req, res) => {
  const role = String(req.query?.role || 'parent')
  if (role === 'parent') {
    return ok(res, [
      {
        id: 'parent_monthly_99',
        name: '家长会员',
        price: 9.9,
        durationMonth: 1,
        features: ['无限解锁老师联系方式', '优先匹配提醒', '发现页会员标识'],
        recommended: true
      }
    ])
  }
  const [rows] = await pool.query('SELECT * FROM membership_plans')
  ok(res, rows.map((p) => ({ id: p.id, name: p.name, price: Number(p.price || 0), durationMonth: Number(p.duration_month || 1), features: parseArrayField(p.features), recommended: !!p.recommended })))
})

app.post('/api/membership/subscribe', authRequired(), async (req, res) => {
  const planId = String(req.body?.plan_id || '')
  const autoRenew = Boolean(req.body?.auto_renew)
  if (req.user.role === 'parent') {
    if (planId !== 'parent_monthly_99') return fail(res, 404, 'Plan not found')
    const expire = new Date()
    expire.setMonth(expire.getMonth() + 1)
    await pool.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
       VALUES (?, '家长会员', ?, 9999, 10, ?)
       ON DUPLICATE KEY UPDATE
         plan_name=VALUES(plan_name),
         expire_at=VALUES(expire_at),
         remaining_unlock=VALUES(remaining_unlock),
         weekly_priority_quota=VALUES(weekly_priority_quota),
         auto_renew=VALUES(auto_renew)`,
      [req.user.id, expire, autoRenew]
    )
    return ok(res, { planName: '家长会员', expireAt: toDate(expire), remainingUnlock: 9999, unlimitedUnlock: true, weeklyPriorityQuota: 10, autoRenew })
  }
  const [plans] = await pool.query('SELECT * FROM membership_plans WHERE id=? LIMIT 1', [planId])
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
    [req.user.id, plan.name, expire, unlock, quota, autoRenew]
  )
  ok(res, { planName: plan.name, expireAt: toDate(expire), remainingUnlock: unlock, weeklyPriorityQuota: quota, autoRenew })
})

app.get('/api/teacher/membership/status', authRequired('teacher'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM memberships WHERE user_id=?', [req.user.id])
  if (!rows.length) return ok(res, { planName: '普通老师', expireAt: null, remainingUnlock: 0, weeklyPriorityQuota: 1, serviceFeePerUnlock: 5 })
  const m = rows[0]
  ok(res, { planName: m.plan_name, expireAt: m.expire_at ? toDate(m.expire_at) : null, remainingUnlock: Number(m.remaining_unlock || 0), weeklyPriorityQuota: Number(m.weekly_priority_quota || 0), serviceFeePerUnlock: 5, autoRenew: !!m.auto_renew })
})

app.get('/api/teacher/membership/plans', authRequired('teacher'), async (_req, res) => {
  ok(res, [
    { id: 'bronze', name: '铜牌老师', price: 19.9, durationMonth: 1, features: ['发现页中部曝光', '基础数据面板', '主动解锁每次收取 5 元服务费'], recommended: false },
    { id: 'silver', name: '银牌老师', price: 29.9, durationMonth: 1, features: ['发现页上部优先曝光', '详细报表 + 实时通知', '主动解锁每次收取 5 元服务费'], recommended: true },
    { id: 'gold', name: '金牌老师', price: 49.9, durationMonth: 1, features: ['发现页顶部置顶曝光', '优先推荐 + 专属客服', '主动解锁每次收取 5 元服务费'], recommended: false }
  ])
})

app.post('/api/teacher/membership/subscribe', authRequired('teacher'), async (req, res) => {
  const plan = {
    bronze: { name: '铜牌老师', unlock: 0, quota: 2 },
    silver: { name: '银牌老师', unlock: 0, quota: 5 },
    gold: { name: '金牌老师', unlock: 0, quota: 10 }
  }[String(req.body?.plan_id || '')]
  if (!plan) return fail(res, 404, 'Plan not found')
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
    [req.user.id, plan.name, expire, plan.unlock, plan.quota, Boolean(req.body?.auto_renew)]
  )
  ok(res, { planName: plan.name, expireAt: toDate(expire), remainingUnlock: plan.unlock, weeklyPriorityQuota: plan.quota, autoRenew: Boolean(req.body?.auto_renew) })
})

app.get('/api/teacher/settings', authRequired('teacher'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id=?', [req.user.id])
  ok(res, { notifications: parseObjectField(rows[0]?.notifications), privacy: parseObjectField(rows[0]?.privacy) })
})

app.put('/api/teacher/settings/password', authRequired('teacher'), async (req, res) => {
  const current = String(req.body?.current_password || '')
  const next = String(req.body?.new_password || '')
  if (next.length < 6) return fail(res, 400, 'New password must be at least 6 chars')
  const user = await getUserById(req.user.id)
  if (!user || !(await bcrypt.compare(current, user.password_hash || ''))) return fail(res, 400, 'Current password is incorrect')
  await pool.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(next, 10), req.user.id])
  ok(res, { updated: true })
})

app.put('/api/teacher/settings/notifications', authRequired('teacher'), async (req, res) => {
  const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id=?', [req.user.id])
  const next = { ...parseObjectField(rows[0]?.notifications), ...(req.body || {}) }
  await pool.query('INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)', [req.user.id, JSON.stringify(next)])
  ok(res, next)
})

app.put('/api/teacher/settings/privacy', authRequired('teacher'), async (req, res) => {
  const [rows] = await pool.query('SELECT privacy FROM user_settings WHERE user_id=?', [req.user.id])
  const next = { ...parseObjectField(rows[0]?.privacy), ...(req.body || {}) }
  await pool.query('INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)', [req.user.id, JSON.stringify(next)])
  ok(res, next)
})

app.get('/api/teacher/notifications', authRequired('teacher'), async (req, res) => {
  try {
    const [unlockRows] = await pool.query(
      `SELECT m.id, m.status, m.matched_at, m.request_id, r.title, r.subject, r.grade, r.budget, u.nickname AS parent_name
         FROM matches m
         JOIN requests r ON r.id = m.request_id
         JOIN users u ON u.id = m.parent_id
        WHERE m.teacher_id = ?
          AND m.parent_accept_status = 'accepted'
          AND m.teacher_accept_status = 'pending'
        ORDER BY m.matched_at DESC
        LIMIT 30`,
      [req.user.id]
    )
    const [matchRows] = await pool.query(
      `SELECT m.id, m.status, m.unlock_granted, m.teacher_accept_status, m.parent_accept_status, m.matched_at, m.request_id, r.title
         FROM matches m
         JOIN requests r ON r.id = m.request_id
        WHERE m.teacher_id = ?
        ORDER BY m.matched_at DESC
        LIMIT 30`,
      [req.user.id]
    )
    let complaintRows = []
    try {
      const [rows] = await pool.query(
        `SELECT id, type, content, status, result, appeal_status, appeal_content, created_at
           FROM complaints
          WHERE respondent_id = ?
          ORDER BY created_at DESC
          LIMIT 20`,
        [req.user.id]
      )
      complaintRows = rows
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
    }
    let reviewRows = []
    try {
      const [rows] = await pool.query(
        `SELECT r.id, r.content, r.rating, r.created_at, u.nickname AS parent_name
           FROM reviews r
           JOIN users u ON u.id = r.parent_id
          WHERE r.teacher_name = (SELECT nickname FROM users WHERE id = ?)
          ORDER BY r.created_at DESC
          LIMIT 20`,
        [req.user.id]
      )
      reviewRows = rows
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
    }

    ok(res, {
      unlockRequests: unlockRows.map((row) => ({
        id: Number(row.id),
        matchId: Number(row.id),
        requestId: Number(row.request_id),
        title: row.title || '家长解锁请求',
        parentName: row.parent_name || '家长',
        subject: row.subject || '',
        grade: row.grade || '',
        budget: row.budget || '',
        createdAt: toISO(row.matched_at),
        status: row.status
      })),
      matchUpdates: matchRows.map((row) => ({
        id: Number(row.id),
        matchId: Number(row.id),
        requestId: Number(row.request_id),
        title: `匹配进度：${row.title || '需求'}`,
        content:
          row.status === 'unlocked'
            ? '已解锁联系方式，可立即发起沟通。'
            : row.unlock_granted
              ? '双方已接受，可进行联系方式解锁。'
              : row.teacher_accept_status === 'accepted'
                ? '你已接受该需求，等待家长确认。'
                : row.parent_accept_status === 'accepted'
                  ? '家长已接受，等待你确认。'
                  : '新匹配结果已生成。',
        createdAt: toISO(row.matched_at),
        status: row.status
      })),
      reviewNotices: reviewRows.map((row) => ({
        id: Number(row.id),
        title: `来自${row.parent_name || '家长'}的新评价`,
        content: `${Number(row.rating || 0)} 星：${row.content || '已提交评价'}`,
        createdAt: toISO(row.created_at)
      })),
      complaintNotices: complaintRows.map((row) => ({
        id: Number(row.id),
        title: '收到投诉通知',
        content: row.content || '',
        createdAt: toISO(row.created_at),
        status: row.status,
        appealStatus: row.appeal_status || 'none',
        appealable: ['pending', 'processing'].includes(String(row.status || '')) && String(row.appeal_status || 'none') === 'none',
        hasAppealed: Boolean(row.appeal_content),
        result: row.result || '',
        type: row.type || 'other'
      })),
      systemNotices: [
        {
          id: 1,
          title: 'Flip 周期匹配',
          content: '系统每周三/周五 18:00 触发周期匹配，可在通知中心查看结果。',
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
  const [result] = await pool.query(
    "UPDATE matches SET teacher_accept_status='accepted', status='accepted' WHERE id = ? AND teacher_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  await grantUnlockIfBothAccepted(id)
  ok(res, { success: true })
})

app.post('/api/teacher/notifications/unlock-requests/:id/reject', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET teacher_accept_status='rejected', status='rejected' WHERE id = ? AND teacher_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  ok(res, { success: true })
})

app.post('/api/teacher/complaints/:id/appeal', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const content = String(req.body?.content || '').trim()
  if (content.length < 10) return fail(res, 400, 'appeal content too short')
  let result
  try {
    ;[result] = await pool.query(
      `UPDATE complaints
          SET appeal_content = ?, appealed_at = NOW(), appeal_status = 'pending', updated_at = NOW()
        WHERE id = ? AND respondent_id = ?`,
      [content, id, req.user.id]
    )
  } catch (error) {
    if (isOptionalSchemaError(error)) return fail(res, 404, 'Complaint module not enabled')
    return fail(res, 500, error.message)
  }
  if (!result.affectedRows) return fail(res, 404, 'Complaint not found')
  ok(res, { success: true })
})

app.get('/api/teacher/invite/summary', authRequired('teacher'), async (req, res) => {
  let rows = []
  let latest = []
  try {
    ;[rows] = await pool.query(
      `SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_count
         FROM invite_records
        WHERE inviter_id = ? AND role = 'teacher'`,
      [req.user.id]
    )
    ;[latest] = await pool.query(
      `SELECT invite_code
         FROM invite_records
        WHERE inviter_id = ? AND role = 'teacher'
        ORDER BY id DESC
        LIMIT 1`,
      [req.user.id]
    )
  } catch (error) {
    if (!isOptionalSchemaError(error)) return fail(res, 500, error.message)
  }
  const verified = Number(rows[0]?.verified_count || 0)
  ok(res, {
    inviteCode: latest[0]?.invite_code || '',
    totalInvited: Number(rows[0]?.pending_count || 0) + verified,
    verifiedInvited: verified,
    extraMatchQuota: verified
  })
})

app.post('/api/teacher/invite/create', authRequired('teacher'), async (req, res) => {
  const inviteCode = `T${req.user.id}${Date.now().toString().slice(-6)}`
  try {
    await pool.query(
      'INSERT INTO invite_records (inviter_id, role, invite_code, status, reward_granted) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'teacher', inviteCode, 'pending', 0]
    )
  } catch (error) {
    if (isOptionalSchemaError(error)) return fail(res, 404, 'Invite module not enabled')
    return fail(res, 500, error.message)
  }
  ok(res, { inviteCode })
})

// Discover
const discoverDTO = (row) => {
  const subjects = parseArrayField(row.subjects || row.preferred_subjects)
  const grades = parseArrayField(row.grades || row.preferred_grade)
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  const activity = Math.max(0.2, 1 - Math.max(0, (Date.now() - updatedAt) / 86400000) / 30)
  const rating = Number(row.rating_avg || 0)
  const ratingScore = rating > 0 ? Math.min(1, rating / 5) : 0.72
  const profileScore =
    [row.real_name, row.city, row.intro, row.hourly_price_min, row.hourly_price_max, subjects.length, grades.length].filter(Boolean)
      .length / 7
  const score = ratingScore * 0.45 + activity * 0.25 + profileScore * 0.2 + 0.8 * 0.1
  const rawLevel = String(row.plan_name || '')
  const level = rawLevel.includes('金') ? 'gold' : rawLevel.includes('银') ? 'silver' : rawLevel.includes('铜') ? 'bronze' : 'free'
  return {
    id: Number(row.user_id || row.id),
    teacherId: Number(row.user_id || row.id),
    name: row.real_name || row.nickname || '老师',
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    city: row.city || row.user_city || '',
    district: row.district || '',
    subjects,
    grades,
    experienceYears: Number(row.experience_years || 0),
    teachingMode: row.teaching_mode || 'both',
    availableTimeText: row.available_time_text || '',
    hourlyPriceMin: row.hourly_price_min == null ? null : Number(row.hourly_price_min),
    hourlyPriceMax: row.hourly_price_max == null ? null : Number(row.hourly_price_max),
    ratingAvg: Number(row.rating_avg || 0),
    ratingCount: Number(row.rating_count || 0),
    intro: row.intro || row.bio || '',
    gender: row.gender || 'male',
    level,
    levelLabel: level === 'gold' ? '金牌' : level === 'silver' ? '银牌' : level === 'bronze' ? '铜牌' : '免费',
    verified: !!row.verified,
    isActive: !!row.is_active,
    updatedAt: toISO(row.updated_at),
    score: Number(score.toFixed(4))
  }
}

const loadDiscoverList = async () => {
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, u.avatar, u.city AS user_city, u.bio, u.preferred_subjects, u.preferred_grade,
            tp.user_id, tp.real_name, tp.gender, tp.city, tp.district, tp.subjects, tp.grades, tp.experience_years,
            tp.intro, tp.verified, tp.hourly_price_min, tp.hourly_price_max, tp.teaching_mode, tp.available_time_text,
            tp.rating_avg, tp.rating_count, tp.is_active, tp.updated_at, m.plan_name
       FROM users u
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
       LEFT JOIN memberships m ON m.user_id = u.id
      WHERE u.role='teacher'`
  )
  return rows.map(discoverDTO).filter((t) => t.isActive !== false)
}

app.get('/api/discover/teachers', async (req, res) => {
  const q = req.query || {}
  const keyword = String(q.keyword || '').trim().toLowerCase()
  const subject = String(q.subject || '').trim()
  const grade = String(q.grade || '').trim()
  const city = String(q.city || '').trim()
  const gender = String(q.gender || '').trim()
  const mode = String(q.mode || '').trim()
  const minPrice = q.min_price === undefined || q.min_price === '' ? null : Number(q.min_price)
  const maxPrice = q.max_price === undefined || q.max_price === '' ? null : Number(q.max_price)
  const minRating = q.min_rating === undefined || q.min_rating === '' ? null : Number(q.min_rating)
  const sort = String(q.sort || 'recommended')
  const page = Math.max(1, Number(q.page || 1))
  const pageSize = Math.min(50, Math.max(1, Number(q.page_size || 12)))

  let list = await loadDiscoverList()
  list = list.filter((t) => {
    const hay = [t.name, t.nickname, t.city, t.district, t.intro, ...t.subjects, ...t.grades].join(' ').toLowerCase()
    if (keyword && !hay.includes(keyword)) return false
    if (subject && !t.subjects.includes(subject)) return false
    if (grade && !t.grades.includes(grade)) return false
    if (city && t.city !== city) return false
    if (gender && gender !== 'all' && t.gender !== gender) return false
    if (mode && mode !== 'all' && t.teachingMode !== mode && t.teachingMode !== 'both') return false
    if (minRating !== null && t.ratingAvg < minRating) return false
    if (minPrice !== null && t.hourlyPriceMax !== null && t.hourlyPriceMax < minPrice) return false
    if (maxPrice !== null && t.hourlyPriceMin !== null && t.hourlyPriceMin > maxPrice) return false
    return true
  })
  const levelWeight = { gold: 4, silver: 3, bronze: 2, free: 1 }
  const ratingRate = (item) => {
    if (!Number(item.ratingCount || 0)) return 0
    const avg = Number(item.ratingAvg || 0)
    return Math.max(0, Math.min(1, avg / 5))
  }
  const sorters = {
    // 会员曝光权重：金牌 > 银牌 > 铜牌 > 免费；层内按好评率排序
    recommended: (a, b) =>
      levelWeight[b.level] - levelWeight[a.level] ||
      ratingRate(b) - ratingRate(a) ||
      b.ratingCount - a.ratingCount ||
      b.score - a.score,
    latest: (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
    rating_desc: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
    price_asc: (a, b) => (a.hourlyPriceMin ?? 999999) - (b.hourlyPriceMin ?? 999999),
    price_desc: (a, b) => (b.hourlyPriceMax ?? -1) - (a.hourlyPriceMax ?? -1)
  }
  list.sort(sorters[sort] || sorters.recommended)
  const total = list.length
  const start = (page - 1) * pageSize
  ok(res, { list: list.slice(start, start + pageSize), total, page, pageSize })
})

app.get('/api/discover/teachers/:teacherId', async (req, res) => {
  const teacherId = Number(req.params.teacherId)
  if (!Number.isInteger(teacherId) || teacherId <= 0) return fail(res, 400, 'Invalid teacher id')
  const list = await loadDiscoverList()
  const teacher = list.find((t) => t.teacherId === teacherId)
  if (!teacher) return fail(res, 404, 'Teacher not found')
  ok(res, { ...teacher, reviewSummary: { ratingAvg: teacher.ratingAvg, ratingCount: teacher.ratingCount } })
})

app.post('/api/discover/teachers/:teacherId/contact', authRequired('parent'), async (req, res) => {
  const teacherId = Number(req.params.teacherId)
  if (!Number.isInteger(teacherId) || teacherId <= 0) return fail(res, 400, 'Invalid teacher id')
  const teacher = await getUserById(teacherId)
  if (!teacher || teacher.role !== 'teacher') return fail(res, 404, 'Teacher not found')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [memberRows] = await conn.query('SELECT * FROM memberships WHERE user_id = ? LIMIT 1 FOR UPDATE', [req.user.id])
    if (!memberRows.length) {
      await conn.query(
        `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
         VALUES (?, '体验用户', NULL, 3, 0, FALSE)`,
        [req.user.id]
      )
    }
    const [lockedRows] = await conn.query('SELECT * FROM memberships WHERE user_id = ? LIMIT 1 FOR UPDATE', [req.user.id])
    const membership = lockedRows[0]
    const remainingUnlock = Number(membership?.remaining_unlock || 0)
    const unlimitedUnlock = String(membership?.plan_name || '').includes('家长会员')
    if (!unlimitedUnlock && remainingUnlock <= 0) {
      await conn.rollback()
      return fail(res, 403, '解锁次数已用完，请开通会员')
    }

    if (!unlimitedUnlock) {
      await conn.query('UPDATE memberships SET remaining_unlock = GREATEST(remaining_unlock - 1, 0) WHERE user_id = ?', [req.user.id])
    }

    const [result] = await conn.query(
      `INSERT INTO conversations (parent_id, teacher_id, last_message, updated_at)
       VALUES (?, ?, '', NOW())
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), updated_at=NOW()`,
      [req.user.id, teacherId]
    )

    const [requestRows] = await conn.query(
      `SELECT id
         FROM requests
        WHERE parent_id = ?
          AND status IN ('pending', 'matching')
        ORDER BY created_at DESC
        LIMIT 1`,
      [req.user.id]
    )
    const requestId = Number(requestRows[0]?.id || 0)
    if (requestId > 0) {
      await conn.query(
        `INSERT INTO matches (teacher_id, parent_id, request_id, match_score, status, parent_accept_status, teacher_accept_status, unlock_granted, week_number)
         VALUES (?, ?, ?, 88.8, 'new', 'accepted', 'pending', 0, ?)
         ON DUPLICATE KEY UPDATE parent_accept_status='accepted', matched_at=NOW(), week_number=VALUES(week_number)`,
        [teacherId, req.user.id, requestId, getCurrentWeekNumber()]
      )
    }

    await conn.commit()
    ok(res, {
      conversationId: Number(result.insertId),
      teacherId,
      contact: {
        phone: String(teacher.phone || ''),
        wechat: String(teacher.wechat || ''),
        nickname: String(teacher.nickname || '老师')
      },
      remainingUnlock: unlimitedUnlock ? 9999 : Math.max(0, remainingUnlock - 1),
      unlimitedUnlock
    })
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

// Messages
app.get('/api/messages/conversations', authRequired(), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.last_message, c.updated_at,
            u.id AS contact_id, u.nickname AS contact_name, u.role AS contact_role
       FROM conversations c
       JOIN users u ON (c.parent_id = u.id OR c.teacher_id = u.id)
      WHERE (c.parent_id = ? OR c.teacher_id = ?) AND u.id != ?
      ORDER BY c.updated_at DESC`,
    [req.user.id, req.user.id, req.user.id]
  )
  ok(res, rows.map((r) => ({ id: Number(r.id), contactId: Number(r.contact_id), contactName: r.contact_name, contactRole: r.contact_role, lastMessage: r.last_message || '', updatedAt: toISO(r.updated_at) })))
})

app.get('/api/messages/unread-count', authRequired(), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.parent_id = ? OR c.teacher_id = ?)
        AND m.sender_id != ?
        AND m.is_read = FALSE`,
    [req.user.id, req.user.id, req.user.id]
  )
  ok(res, { count: Number(rows[0]?.count || 0) })
})

app.get('/api/messages/:conversationId', authRequired(), async (req, res) => {
  const conversationId = Number(req.params.conversationId)
  const [rows] = await pool.query(
    `SELECT m.*
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id = ?
        AND (c.parent_id = ? OR c.teacher_id = ?)
      ORDER BY m.created_at ASC`,
    [conversationId, req.user.id, req.user.id]
  )
  ok(res, rows.map((m) => ({ id: Number(m.id), conversationId: Number(m.conversation_id), senderId: Number(m.sender_id), content: m.content, isRead: !!m.is_read, createdAt: toISO(m.created_at) })))
})

app.post('/api/messages/:conversationId/read', authRequired(), async (req, res) => {
  const conversationId = Number(req.params.conversationId)
  await pool.query(
    `UPDATE messages m
       JOIN conversations c ON c.id = m.conversation_id
        SET m.is_read = TRUE
      WHERE m.conversation_id = ?
        AND (c.parent_id = ? OR c.teacher_id = ?)
        AND m.sender_id != ?
        AND m.is_read = FALSE`,
    [conversationId, req.user.id, req.user.id, req.user.id]
  )
  ok(res, { success: true })
})

io.use((socket, next) => {
  const tokenFromAuth = socket.handshake.auth?.token
  const tokenFromHeader = String(socket.handshake.headers?.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  const user = verifyToken(tokenFromAuth || tokenFromHeader)
  if (!user) return next(new Error('Unauthorized'))
  socket.user = user
  next()
})

io.on('connection', (socket) => {
  const userId = Number(socket.user.id)
  socket.join(`user_${userId}`)
  socket.on('send_message', async (data) => {
    const conversationId = Number(data?.conversationId || 0)
    const content = String(data?.content || '').trim()
    if (!conversationId || !content) return
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [convRows] = await conn.query('SELECT * FROM conversations WHERE id = ? LIMIT 1', [conversationId])
      const conv = convRows[0]
      if (!conv || (conv.parent_id !== userId && conv.teacher_id !== userId)) {
        await conn.rollback()
        return
      }
      const receiverId = conv.parent_id === userId ? conv.teacher_id : conv.parent_id
      const [result] = await conn.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [conversationId, userId, content])
      await conn.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [content, conversationId])
      await conn.commit()
      const [savedRows] = await pool.query('SELECT * FROM messages WHERE id = ?', [result.insertId])
      const saved = savedRows[0]
      const payload = { id: Number(saved.id), conversationId: Number(saved.conversation_id), senderId: Number(saved.sender_id), content: saved.content, isRead: !!saved.is_read, createdAt: toISO(saved.created_at) }
      io.to(`user_${receiverId}`).emit('receive_message', payload)
      socket.emit('message_sent', payload)
    } catch (error) {
      await conn.rollback()
      console.error('Failed to send message:', error)
    } finally {
      conn.release()
    }
  })
})

app.use((_req, res) => fail(res, 404, 'Not Found'))

setInterval(() => {
  maybeRunScheduledMatching().catch((error) => {
    console.error('[matching] scheduler error:', error?.message || error)
  })
}, 60 * 1000)

ensureMatchingSchema()
  .catch((error) => {
    console.error('[schema] ensure matching schema failed:', error?.message || error)
  })
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`[api] running at http://localhost:${PORT} (with WebSocket)`)
    })
  })
