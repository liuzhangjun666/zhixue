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
  .map((item) => item.trim())
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
const fail = (res, status, message, data) => {
  if (status === 401) return res.status(401).json({ code: 401, message: 'Unauthorized', data: null })
  if (status === 403) return res.status(403).json({ code: 403, message: 'Forbidden', data: null })
  return res.status(status).json({ code: status, message, data: data ?? null })
}

const parseArrayField = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean)
    } catch { }
    return value
      .split(/[,,，、\s]+/)
      .map((item) => item.trim())
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

const getBearerToken = (req) => {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return ''
  return header.slice(7).trim()
}

const base64Url = (input) => Buffer.from(input).toString('base64url')
const signTokenPayload = (payload) =>
  crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payload).digest('base64url')

const issueAuthToken = (user) => {
  const now = Math.floor(Date.now() / 1000)
  const payload = base64Url(
    JSON.stringify({
      id: Number(user.id),
      role: user.role,
      iat: now,
      exp: now + AUTH_TOKEN_EXPIRES_IN_SECONDS
    })
  )
  return `${payload}.${signTokenPayload(payload)}`
}

const verifyAuthToken = (token) => {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature || signTokenPayload(payload) !== signature) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data?.id || !data?.role || Number(data.exp || 0) < Math.floor(Date.now() / 1000)) return null
    return { id: Number(data.id), role: String(data.role) }
  } catch {
    return null
  }
}

const authRequired = (role = '') => (req, res, next) => {
  const user = verifyAuthToken(getBearerToken(req))
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

const authUserDTO = (user) => ({
  id: Number(user.id),
  role: user.role,
  nickname: user.nickname,
  phone: user.phone
})

const buildAuthPayload = (user) => ({
  user: authUserDTO(user),
  token: issueAuthToken(user)
})

const ensureTeacherProfile = async (user) => {
  const [rows] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ? LIMIT 1', [user.id])
  if (rows.length) return rows[0]

  await pool.query(
    `INSERT INTO teacher_profiles
       (user_id, real_name, city, district, subjects, grades, intro, experience_years, teaching_mode, available_time_text, is_active)
     VALUES (?, ?, ?, '', ?, ?, ?, 0, 'both', '工作日晚间、周末可约', TRUE)`,
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
  const [created] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ? LIMIT 1', [user.id])
  return created[0]
}

const buildTeacherProfileDTO = async (user) => {
  const profile = await ensureTeacherProfile(user)
  return {
    teacherName: user.nickname,
    phone: user.phone,
    city: profile.city || user.city || '',
    district: profile.district || '',
    bio: profile.intro || user.bio || '',
    avatar: user.avatar || '',
    wechat: user.wechat || '',
    preferredGrades: parseArrayField(profile.grades),
    preferredSubjects: parseArrayField(profile.subjects),
    experienceYears: Number(profile.experience_years || 0),
    teachingStyle: profile.teaching_style || '',
    studentType: profile.student_type || '',
    areas: parseArrayField(profile.areas),
    verifyStatus: profile.verify_status || 'pending',
    verified: !!profile.verified,
    verifyRemark: profile.verify_remark || ''
  }
}

const currentUserOrFail = async (req, res) => {
  const user = await getUserById(req.user.id)
  if (!user) {
    fail(res, 404, 'User not found')
    return null
  }
  return user
}

const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '')
const isoTime = (value) => (value ? new Date(value).toISOString() : '')

const mapRequestRow = (item) => ({
  id: Number(item.id),
  title: item.title || '',
  subject: item.subject || '',
  grade: item.grade || '',
  budget: item.budget || '',
  schedule: item.schedule || '',
  status: item.status || 'pending',
  teacherName: item.teacher_name || '',
  description: item.description || '',
  createdAt: dateOnly(item.created_at)
})

const discoverTeacherDTO = (row) => {
  const subjects = parseArrayField(row.subjects || row.preferred_subjects)
  const grades = parseArrayField(row.grades || row.preferred_grade)
  const rating = Number(row.rating_avg || 0)
  const profileFields = [
    row.real_name,
    row.city || row.user_city,
    row.intro || row.bio,
    row.hourly_price_min,
    row.hourly_price_max,
    subjects.length,
    grades.length
  ]
  const profileScore = profileFields.filter(Boolean).length / profileFields.length
  const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  const days = Math.max(0, (Date.now() - updatedAt) / 86400000)
  const activityScore = Math.max(0.2, 1 - days / 30)
  const ratingScore = rating > 0 ? Math.min(1, rating / 5) : 0.72
  const responseScore = 0.8
  const score = ratingScore * 0.45 + activityScore * 0.25 + profileScore * 0.2 + responseScore * 0.1

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
    verified: !!row.verified,
    isActive: !!row.is_active,
    updatedAt: isoTime(row.updated_at),
    score: Number(score.toFixed(4))
  }
}

const loadDiscoverTeachers = async () => {
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, u.phone, u.avatar, u.city AS user_city, u.bio, u.preferred_subjects, u.preferred_grade,
            tp.user_id, tp.real_name, tp.city, tp.district, tp.subjects, tp.grades, tp.experience_years,
            tp.teaching_style, tp.student_type, tp.areas, tp.intro, tp.verified, tp.verify_status,
            tp.hourly_price_min, tp.hourly_price_max, tp.teaching_mode, tp.available_time_text,
            tp.rating_avg, tp.rating_count, tp.is_active, tp.updated_at
       FROM users u
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE u.role = 'teacher'`
  )
  return rows.map(discoverTeacherDTO).filter((item) => item.isActive !== false)
}

app.get('/api/health', async (_req, res) => {
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
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
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
    const user = await getUserByPhone(phone, 'parent')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
      return fail(res, 401, 'Unauthorized')
    }
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
  const experienceYears = Number.parseInt(experience, 10) || 0
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
    const passwordHash = await bcrypt.hash(password, 10)
    const preferredSubjects = subject ? [subject] : []
    const [result] = await conn.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
       VALUES ('teacher', ?, ?, ?, '', ?, '', ?)`,
      [nickname, phone, passwordHash, experience, JSON.stringify(preferredSubjects)]
    )
    await conn.query(
      `INSERT INTO teacher_profiles
        (user_id, real_name, city, subjects, grades, experience_years, intro, teaching_mode, available_time_text, is_active)
       VALUES (?, ?, '', ?, '[]', ?, ?, 'both', '工作日晚间、周末可约', TRUE)`,
      [result.insertId, nickname, JSON.stringify(preferredSubjects), experienceYears, experience]
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
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
      return fail(res, 401, 'Unauthorized')
    }
    await ensureTeacherProfile(user)
    ok(res, buildAuthPayload(user), '登录成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/auth/me', authRequired(), async (req, res) => {
  try {
    const user = await currentUserOrFail(req, res)
    if (!user) return
    ok(res, {
      ...authUserDTO(user),
      city: user.city || '',
      bio: user.bio || '',
      avatar: user.avatar || ''
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/logout', authRequired(), (_req, res) => {
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
    const user = await currentUserOrFail(req, res)
    if (!user) return
    ok(res, {
      ...authUserDTO(user),
      city: user.city || '',
      bio: user.bio || '',
      avatar: user.avatar || ''
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/logout', authRequired(), (_req, res) => ok(res, { success: true }, '退出成功'))

// Backward-compatible teacher auth endpoints.
app.post('/api/teacher/auth/send-code', async (_req, res) => ok(res, { sent: true, ttlSeconds: 300 }))
app.post('/api/teacher/auth/register', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const nickname = String(req.body?.nickname || '新老师').trim()
  const city = String(req.body?.city || '').trim()
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
    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await conn.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
       VALUES ('teacher', ?, ?, ?, ?, '', '', '[]')`,
      [nickname, phone, passwordHash, city]
    )
    await conn.query(
      `INSERT INTO teacher_profiles
        (user_id, real_name, city, subjects, grades, intro, teaching_mode, available_time_text, is_active)
       VALUES (?, ?, ?, '[]', '[]', '', 'both', '工作日晚间、周末可约', TRUE)`,
      [result.insertId, nickname, city]
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
app.post('/api/teacher/auth/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  if (!phone || !password) return fail(res, 400, 'phone and password are required')
  try {
    const user = await getUserByPhone(phone, 'teacher')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
      return fail(res, 401, 'Unauthorized')
    }
    await ensureTeacherProfile(user)
    ok(res, buildAuthPayload(user), '登录成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})
app.post('/api/teacher/auth/logout', authRequired('teacher'), (_req, res) => ok(res, { logout: true }))
app.get('/api/teacher/auth/me', authRequired('teacher'), async (req, res) => {
  try {
    const user = await currentUserOrFail(req, res)
    if (!user) return
    ok(res, { id: user.id, nickname: user.nickname, phone: user.phone, city: user.city || '' })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/profile', authRequired('parent'), async (req, res) => {
  try {
    const user = await currentUserOrFail(req, res)
    if (!user) return
    const [children] = await pool.query('SELECT * FROM children WHERE parent_id = ?', [req.user.id])
    ok(res, {
      parentName: user.nickname,
      phone: user.phone,
      city: user.city || '',
      bio: user.bio || '',
      avatar: user.avatar || '',
      preferredGrade: user.preferred_grade || '',
      preferredSubjects: parseArrayField(user.preferred_subjects),
      children: children.map((child) => ({
        id: Number(child.id),
        name: child.name,
        grade: child.grade,
        targetSubject: child.target_subject
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
        payload.preferredGrade || '',
        JSON.stringify(payload.preferredSubjects || []),
        req.user.id
      ]
    )
    await conn.query('DELETE FROM children WHERE parent_id=?', [req.user.id])
    if (Array.isArray(payload.children) && payload.children.length) {
      await conn.query('INSERT INTO children (parent_id, name, grade, target_subject) VALUES ?', [
        payload.children.map((child) => [req.user.id, child.name || '', child.grade || '', child.targetSubject || ''])
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
  try {
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id])
    ok(res, { avatar })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/requests', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM requests WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
    ok(res, rows.map(mapRequestRow))
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
    ok(res, mapRequestRow(rows[0]))
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
      `INSERT INTO requests (parent_id, title, subject, grade, budget, schedule, description, status, teacher_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        req.user.id,
        title,
        String(payload.subject || ''),
        String(payload.grade || ''),
        String(payload.budget || ''),
        String(payload.schedule || ''),
        String(payload.description || ''),
        String(payload.teacherName || payload.teacher_name || '')
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
    if (!result.affectedRows) return fail(res, 404, 'Request not found')
    ok(res, { id, status })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/reviews', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM reviews WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
    ok(
      res,
      rows.map((item) => ({
        id: Number(item.id),
        teacherName: item.teacher_name,
        subject: item.subject,
        rating: Number(item.rating || 0),
        content: item.content || '',
        reply: item.reply || '',
        date: dateOnly(item.created_at)
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/matches/:id/accept', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const reply = String(req.body?.reply || '').trim()
  if (!reply) return fail(res, 400, 'reply cannot be empty')
  try {
    const [result] = await pool.query('UPDATE reviews SET reply = ? WHERE id = ? AND parent_id = ?', [reply, id, req.user.id])
    if (!result.affectedRows) return fail(res, 404, 'Review not found')
    ok(res, { id, reply })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/settings', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id])
    ok(res, {
      notifications: parseObjectField(rows[0]?.notifications),
      privacy: parseObjectField(rows[0]?.privacy)
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
    const user = await currentUserOrFail(req, res)
    if (!user) return
    if (!(await bcrypt.compare(currentPassword, user.password_hash || ''))) return fail(res, 400, 'Current password is incorrect')
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(nextPassword, 10), req.user.id])
    ok(res, { updated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/notifications', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [req.user.id])
    const nextOpts = { ...parseObjectField(rows[0]?.notifications), ...(req.body || {}) }
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
    const nextOpts = { ...parseObjectField(rows[0]?.privacy), ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)',
      [req.user.id, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/settings/deactivate', authRequired('parent'), async (req, res) => {
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
    const teacher = await currentUserOrFail(req, res)
    if (!teacher) return
    ok(res, await buildTeacherProfileDTO(teacher))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/profile', authRequired('teacher'), async (req, res) => {
  const payload = req.body || {}
  if (!payload.teacherName || !payload.phone) return fail(res, 400, 'teacherName and phone are required')
  const preferredGrades = Array.isArray(payload.preferredGrades) ? payload.preferredGrades : []
  const preferredSubjects = Array.isArray(payload.preferredSubjects) ? payload.preferredSubjects : []
  try {
    await pool.query(
      'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=?, wechat=? WHERE id=?',
      [
        payload.teacherName,
        payload.phone,
        payload.city || '',
        payload.bio || '',
        preferredGrades.join(','),
        JSON.stringify(preferredSubjects),
        String(payload.wechat || ''),
        req.user.id
      ]
    )
    await pool.query(
      `INSERT INTO teacher_profiles
        (user_id, real_name, city, district, subjects, grades, experience_years, teaching_style, student_type, areas, intro, verify_status, teaching_mode, available_time_text, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'both', '', TRUE)
       ON DUPLICATE KEY UPDATE
         real_name=VALUES(real_name),
         city=VALUES(city),
         district=VALUES(district),
         subjects=VALUES(subjects),
         grades=VALUES(grades),
         experience_years=VALUES(experience_years),
         teaching_style=VALUES(teaching_style),
         student_type=VALUES(student_type),
         areas=VALUES(areas),
         intro=VALUES(intro),
         is_active=TRUE`,
      [
        req.user.id,
        payload.teacherName,
        payload.city || '',
        String(payload.district || ''),
        JSON.stringify(preferredSubjects),
        JSON.stringify(preferredGrades),
        Number(payload.experienceYears || 0),
        String(payload.teachingStyle || ''),
        String(payload.studentType || ''),
        JSON.stringify(Array.isArray(payload.areas) ? payload.areas : []),
        String(payload.bio || '')
      ]
    )
    ok(res, { updated: true })
  } catch (error) {
    fail(res, 500, error.message)
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

app.post('/api/teacher/verification/upload', authRequired('teacher'), async (req, res) => {
  const certType = String(req.body?.certType || 'work_proof')
  const certUrl = String(req.body?.certUrl || '').trim()
  if (!certUrl) return fail(res, 400, 'certUrl is required')
  try {
    await pool.query(
      'INSERT INTO teacher_verifications (user_id, cert_type, cert_url, status) VALUES (?, ?, ?, ?)',
      [req.user.id, certType, certUrl, 'pending']
    )
    await pool.query('UPDATE teacher_profiles SET verify_status = ?, verify_remark = ? WHERE user_id = ?', [
      'pending',
      '',
      req.user.id
    ])
    ok(res, { submitted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/verification/status', authRequired('teacher'), async (req, res) => {
  try {
    const [profileRows] = await pool.query('SELECT verify_status, verified, verify_remark FROM teacher_profiles WHERE user_id = ?', [
      req.user.id
    ])
    const [certRows] = await pool.query(
      'SELECT cert_type, cert_url, status, review_remark, created_at FROM teacher_verifications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    )
    ok(res, {
      verifyStatus: profileRows[0]?.verify_status || 'pending',
      verified: !!profileRows[0]?.verified,
      verifyRemark: profileRows[0]?.verify_remark || '',
      certificates: certRows.map((item) => ({
        certType: item.cert_type,
        certUrl: item.cert_url,
        status: item.status,
        reviewRemark: item.review_remark,
        createdAt: isoTime(item.created_at)
      }))
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/questionnaire', authRequired('teacher'), async (req, res) => {
  const answers = req.body?.answers
  if (!answers || typeof answers !== 'object') return fail(res, 400, 'answers is required')
  try {
    await pool.query(
      `INSERT INTO questionnaires (user_id, role, answers, version)
       VALUES (?, 'teacher', ?, 'v1')
       ON DUPLICATE KEY UPDATE answers=VALUES(answers), updated_at=NOW()`,
      [req.user.id, JSON.stringify(answers)]
    )
    ok(res, { saved: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/questionnaire/latest', authRequired('teacher'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT answers, updated_at FROM questionnaires WHERE user_id = ? AND role = 'teacher' ORDER BY updated_at DESC LIMIT 1",
      [req.user.id]
    )
    ok(res, {
      answers: parseObjectField(rows[0]?.answers),
      updatedAt: rows[0]?.updated_at ? isoTime(rows[0].updated_at) : null
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/requests', authRequired('teacher'), async (req, res) => {
  try {
    const teacher = await currentUserOrFail(req, res)
    if (!teacher) return
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
        ...mapRequestRow(item),
        parentName: item.parent_name || '家长',
        isMine: item.teacher_name === teacher.nickname
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/requests/:id/accept', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const teacher = await currentUserOrFail(req, res)
    if (!teacher) return
    const [result] = await pool.query(
      `UPDATE requests
          SET teacher_name = ?, status = 'scheduled'
        WHERE id = ? AND (teacher_name = '' OR teacher_name IS NULL OR teacher_name = ?)`,
      [teacher.nickname, id, teacher.nickname]
    )
    if (!result.affectedRows) return fail(res, 404, 'Request not found or already claimed')
    ok(res, { id, accepted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/requests/:id/release', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  try {
    const teacher = await currentUserOrFail(req, res)
    if (!teacher) return
    const [result] = await pool.query("UPDATE requests SET teacher_name = '', status = 'matching' WHERE id = ? AND teacher_name = ?", [
      id,
      teacher.nickname
    ])
    if (!result.affectedRows) return fail(res, 404, 'Request not found or no permission')
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
    const teacher = await currentUserOrFail(req, res)
    if (!teacher) return
    const [result] = await pool.query('UPDATE requests SET status = ? WHERE id = ? AND teacher_name = ?', [
      status,
      id,
      teacher.nickname
    ])
    if (!result.affectedRows) return fail(res, 404, 'Request not found or no permission')
    ok(res, { id, status })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/reviews', authRequired('teacher'), async (req, res) => {
  app.get('/api/teacher/reviews', authRequired('teacher'), async (req, res) => {
    try {
      const teacher = await currentUserOrFail(req, res)
      if (!teacher) return
      const [rows] = await pool.query(
        `SELECT r.*, u.nickname AS parent_name
         FROM reviews r
         JOIN users u ON r.parent_id = u.id
        WHERE r.teacher_name = ?
        ORDER BY r.created_at DESC`,
        [teacher.nickname]
      )
      ok(
        res,
        rows.map((item) => ({
          id: item.id,
          parentName: item.parent_name,
          subject: item.subject,
          rating: Number(item.rating || 0),
          content: item.content || '',
          date: dateOnly(item.created_at)
        }))
      )
    } catch (error) {
      fail(res, 500, error.message)
    }
  })

  app.get('/api/teacher/analytics', authRequired('teacher'), async (req, res) => {
    app.get('/api/teacher/analytics', authRequired('teacher'), async (req, res) => {
      try {
        const teacher = await currentUserOrFail(req, res)
        if (!teacher) return
        const [requestRows] = await pool.query(
          `SELECT status, COUNT(*) AS count FROM requests WHERE teacher_name = ? GROUP BY status`,
          [teacher.nickname]
        )
        const [reviewRows] = await pool.query(
          `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM reviews WHERE teacher_name = ?`,
          [teacher.nickname]
        )
        const counters = requestRows.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.count || 0) }), {})
        const totalHandled = Object.values(counters).reduce((sum, count) => sum + Number(count || 0), 0)
        ok(res, {
          weeklyViews: 120 + totalHandled * 18,
          totalViews: (120 + totalHandled * 18) * 8,
          pendingRequests: Number(counters.pending || 0) + Number(counters.matching || 0),
          scheduledRequests: Number(counters.scheduled || 0),
          completedRequests: Number(counters.completed || 0),
          averageRating: Number(reviewRows[0]?.average_rating || 0),
          totalReviews: Number(reviewRows[0]?.total_reviews || 0),
          responseRate: totalHandled === 0 ? 0 : (Number(counters.completed || 0) + Number(counters.scheduled || 0)) / totalHandled
        })
      } catch (error) {
        fail(res, 500, error.message)
      }
    })

    app.get('/api/teacher/matches', authRequired('teacher'), async (_req, res) => ok(res, []))
    app.post('/api/teacher/matches/:id/unlock', authRequired('teacher'), async (_req, res) => fail(res, 404, 'Match not found'))
    app.post('/api/teacher/matches/:id/accept', authRequired('teacher'), async (_req, res) => fail(res, 404, 'Match not found'))
    app.post('/api/teacher/matches/:id/reject', authRequired('teacher'), async (_req, res) => fail(res, 404, 'Match not found'))
    app.get('/api/teacher/unlock-records', authRequired('teacher'), async (_req, res) => ok(res, []))
    app.get('/api/teacher/dashboard/summary', authRequired('teacher'), async (req, res) => {
      try {
        const [membershipRows] = await pool.query('SELECT remaining_unlock FROM memberships WHERE user_id = ?', [req.user.id])
        ok(res, {
          newMatchCount: 0,
          unlockedMatchCount: 0,
          processingRequestCount: 0,
          remainingUnlock: Number(membershipRows[0]?.remaining_unlock || 0)
        })
      } catch (error) {
        fail(res, 500, error.message)
      }
    })

    app.get('/api/membership/status', authRequired(), async (req, res) => {
      const defaultName = req.user.role === 'teacher' ? '普通老师' : '普通用户'
      try {
        const [rows] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [req.user.id])
        if (!rows.length) return ok(res, { planName: defaultName, expireAt: null, remainingUnlock: 0, weeklyPriorityQuota: 0 })
        const item = rows[0]
        ok(res, {
          planName: item.plan_name,
          expireAt: item.expire_at ? dateOnly(item.expire_at) : null,
          remainingUnlock: Number(item.remaining_unlock || 0),
          weeklyPriorityQuota: Number(item.weekly_priority_quota || 0),
          autoRenew: !!item.auto_renew
        })
      } catch (error) {
        fail(res, 500, error.message)
      }
    })

    app.get('/api/membership/plans', async (_req, res) => {
      try {
        const [rows] = await pool.query('SELECT * FROM membership_plans')
        ok(
          res,
          rows.map((item) => ({
            id: item.id,
            name: item.name,
            price: Number(item.price || 0),
            durationMonth: Number(item.duration_month || 1),
            features: parseArrayField(item.features),
            recommended: !!item.recommended
          }))
        )
      } catch (error) {
        fail(res, 500, error.message)
      }
    })

    app.post('/api/membership/subscribe', authRequired(), async (req, res) => {
      const planId = String(req.body?.plan_id || '')
      const autoRenew = Boolean(req.body?.auto_renew)
      try {
        const [plans] = await pool.query('SELECT * FROM membership_plans WHERE id = ? LIMIT 1', [planId])
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
        ok(res, {
          planName: plan.name,
          expireAt: dateOnly(expire),
          remainingUnlock: unlock,
          weeklyPriorityQuota: quota,
          autoRenew
        })
      } catch (error) {
        fail(res, 500, error.message)
      }
    })

    app.get('/api/teacher/membership/status', authRequired('teacher'), async (req, res) => {
      try {
        const [rows] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [req.user.id])
        if (!rows.length) return ok(res, { planName: '普通老师', expireAt: null, remainingUnlock: 3, weeklyPriorityQuota: 1 })
        const item = rows[0]
        ok(res, {
          planName: item.plan_name,
          expireAt: item.expire_at ? dateOnly(item.expire_at) : null,
          remainingUnlock: Number(item.remaining_unlock || 0),
          weeklyPriorityQuota: Number(item.weekly_priority_quota || 0),
          autoRenew: !!item.auto_renew
        })
      } catch (error) {
        fail(res, 500, error.message)
      }
    })
    app.get('/api/teacher/membership/plans', authRequired('teacher'), async (_req, res) =>
      ok(res, [
        { id: 'bronze', name: '铜牌老师', price: 19.9, durationMonth: 1, features: ['每天 5 次解锁次数', '中部曝光位', '基础数据面板'], recommended: false },
        { id: 'silver', name: '银牌老师', price: 29.9, durationMonth: 1, features: ['每天 10 次解锁次数', '上部曝光位', '详细报表 + 实时通知'], recommended: true },
        { id: 'gold', name: '金牌老师', price: 49.9, durationMonth: 1, features: ['无限解锁次数', '顶部置顶曝光', '优先推荐 + 专属客服'], recommended: false }
      ])
    )
    app.post('/api/teacher/membership/subscribe', authRequired('teacher'), async (req, res) => {
      const planMap = {
        bronze: { name: '铜牌老师', unlock: 5, quota: 2 },
        silver: { name: '银牌老师', unlock: 10, quota: 5 },
        gold: { name: '金牌老师', unlock: 999, quota: 10 }
      }
      const selected = planMap[String(req.body?.plan_id || '')]
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
          [req.user.id, selected.name, expire, selected.unlock, selected.quota, Boolean(req.body?.auto_renew)]
        )
        ok(res, {
          planName: selected.name,
          expireAt: dateOnly(expire),
          remainingUnlock: selected.unlock,
          weeklyPriorityQuota: selected.quota,
          autoRenew: Boolean(req.body?.auto_renew)
        })
      } catch (error) {
        fail(res, 500, error.message)
      }
    })

    app.get('/api/teacher/settings', authRequired('teacher'), async (req, res) => {
      app.get('/api/teacher/settings', authRequired('teacher'), async (req, res) => {
        try {
          const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id])
          ok(res, { notifications: parseObjectField(rows[0]?.notifications), privacy: parseObjectField(rows[0]?.privacy) })
        } catch (error) {
          fail(res, 500, error.message)
        }
      })

      app.put('/api/teacher/settings/password', authRequired('teacher'), async (req, res) => {
        app.put('/api/teacher/settings/password', authRequired('teacher'), async (req, res) => {
          const currentPassword = String(req.body?.current_password || '')
          const nextPassword = String(req.body?.new_password || '')
          if (nextPassword.length < 6) return fail(res, 400, 'New password must be at least 6 chars')
          try {
            const user = await currentUserOrFail(req, res)
            if (!user) return
            if (!(await bcrypt.compare(currentPassword, user.password_hash || ''))) return fail(res, 400, 'Current password is incorrect')
            await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(nextPassword, 10), req.user.id])
            ok(res, { updated: true })
          } catch (error) {
            fail(res, 500, error.message)
          }
        })

        app.put('/api/teacher/settings/notifications', authRequired('teacher'), async (req, res) => {
          app.put('/api/teacher/settings/notifications', authRequired('teacher'), async (req, res) => {
            try {
              const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [req.user.id])
              const nextOpts = { ...parseObjectField(rows[0]?.notifications), ...(req.body || {}) }
              await pool.query(
                'INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)',
                [req.user.id, JSON.stringify(nextOpts)]
                [req.user.id, JSON.stringify(nextOpts)]
              )
              ok(res, nextOpts)
            } catch (error) {
              fail(res, 500, error.message)
            }
          })

          app.put('/api/teacher/settings/privacy', authRequired('teacher'), async (req, res) => {
            app.put('/api/teacher/settings/privacy', authRequired('teacher'), async (req, res) => {
              try {
                const [rows] = await pool.query('SELECT privacy FROM user_settings WHERE user_id = ?', [req.user.id])
                const nextOpts = { ...parseObjectField(rows[0]?.privacy), ...(req.body || {}) }
                await pool.query(
                  'INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)',
                  [req.user.id, JSON.stringify(nextOpts)]
                  [req.user.id, JSON.stringify(nextOpts)]
                )
                ok(res, nextOpts)
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            app.get('/api/discover/teachers', async (req, res) => {
              try {
                const query = req.query || {}
                const keyword = String(query.keyword || '').trim().toLowerCase()
                const subject = String(query.subject || '').trim()
                const grade = String(query.grade || '').trim()
                const city = String(query.city || '').trim()
                const mode = String(query.mode || '').trim()
                const minPrice = query.min_price === undefined || query.min_price === '' ? null : Number(query.min_price)
                const maxPrice = query.max_price === undefined || query.max_price === '' ? null : Number(query.max_price)
                const minRating = query.min_rating === undefined || query.min_rating === '' ? null : Number(query.min_rating)
                const sort = String(query.sort || 'recommended')
                const page = Math.max(1, Number(query.page || 1))
                const pageSize = Math.min(50, Math.max(1, Number(query.page_size || 12)))

                let list = await loadDiscoverTeachers()
                list = list.filter((item) => {
                  const haystack = [item.name, item.nickname, item.city, item.district, item.intro, ...item.subjects, ...item.grades]
                    .join(' ')
                    .toLowerCase()
                  if (keyword && !haystack.includes(keyword)) return false
                  if (subject && !item.subjects.includes(subject)) return false
                  if (grade && !item.grades.includes(grade)) return false
                  if (city && item.city !== city) return false
                  if (mode && mode !== 'all' && item.teachingMode !== mode && item.teachingMode !== 'both') return false
                  if (minRating !== null && item.ratingAvg < minRating) return false
                  if (minPrice !== null && item.hourlyPriceMax !== null && item.hourlyPriceMax < minPrice) return false
                  if (maxPrice !== null && item.hourlyPriceMin !== null && item.hourlyPriceMin > maxPrice) return false
                  return true
                })

                const sorters = {
                  latest: (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
                  rating_desc: (a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount,
                  price_asc: (a, b) => (a.hourlyPriceMin ?? 999999) - (b.hourlyPriceMin ?? 999999),
                  price_desc: (a, b) => (b.hourlyPriceMax ?? -1) - (a.hourlyPriceMax ?? -1),
                  recommended: (a, b) => b.score - a.score
                }
                list.sort(sorters[sort] || sorters.recommended)
                const total = list.length
                const start = (page - 1) * pageSize
                ok(res, { list: list.slice(start, start + pageSize), total, page, pageSize })
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            app.get('/api/discover/teachers/:teacherId', async (req, res) => {
              const teacherId = Number(req.params.teacherId)
              if (!Number.isInteger(teacherId) || teacherId <= 0) return fail(res, 400, 'Invalid teacher id')
              try {
                const list = await loadDiscoverTeachers()
                const teacher = list.find((item) => item.teacherId === teacherId)
                if (!teacher) return fail(res, 404, 'Teacher not found')
                ok(res, {
                  ...teacher,
                  reviewSummary: {
                    ratingAvg: teacher.ratingAvg,
                    ratingCount: teacher.ratingCount
                  }
                })
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            app.post('/api/discover/teachers/:teacherId/contact', authRequired('parent'), async (req, res) => {
              const teacherId = Number(req.params.teacherId)
              if (!Number.isInteger(teacherId) || teacherId <= 0) return fail(res, 400, 'Invalid teacher id')
              try {
                const teacher = await getUserById(teacherId)
                if (!teacher || teacher.role !== 'teacher') return fail(res, 404, 'Teacher not found')
                const [result] = await pool.query(
                  `INSERT INTO conversations (parent_id, teacher_id, last_message, updated_at)
       VALUES (?, ?, '', NOW())
       ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), updated_at=NOW()`,
                  [req.user.id, teacherId]
                )
                ok(res, { conversationId: Number(result.insertId), teacherId })
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            app.get('/api/messages/conversations', authRequired(), async (req, res) => {
              try {
                const [rows] = await pool.query(
                  `SELECT c.id, c.last_message, c.updated_at,
              u.id AS contact_id, u.nickname AS contact_name, u.role AS contact_role
         FROM conversations c
         JOIN users u ON (c.parent_id = u.id OR c.teacher_id = u.id)
        WHERE (c.parent_id = ? OR c.teacher_id = ?) AND u.id != ?
        ORDER BY c.updated_at DESC`,
                  [req.user.id, req.user.id, req.user.id]
                )
                ok(
                  res,
                  rows.map((item) => ({
                    id: Number(item.id),
                    contactId: Number(item.contact_id),
                    contactName: item.contact_name,
                    contactRole: item.contact_role,
                    lastMessage: item.last_message || '',
                    updatedAt: isoTime(item.updated_at)
                  }))
                )
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            app.get('/api/messages/unread-count', authRequired(), async (req, res) => {
              try {
                const [rows] = await pool.query(
                  `SELECT COUNT(*) AS count
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
        WHERE (c.parent_id = ? OR c.teacher_id = ?)
          AND m.sender_id != ?
          AND m.is_read = FALSE`,
                  [req.user.id, req.user.id, req.user.id]
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
                const [rows] = await pool.query(
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
                  rows.map((item) => ({
                    id: Number(item.id),
                    conversationId: Number(item.conversation_id),
                    senderId: Number(item.sender_id),
                    content: item.content,
                    isRead: !!item.is_read,
                    createdAt: isoTime(item.created_at)
                  }))
                )
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            app.post('/api/messages/:conversationId/read', authRequired(), async (req, res) => {
              const conversationId = Number(req.params.conversationId)
              try {
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
                await emitUnreadMessageCount(userId)
                ok(res, { success: true })
              } catch (error) {
                fail(res, 500, error.message)
              }
            })

            io.use((socket, next) => {
              const tokenFromAuth = socket.handshake.auth?.token
              const tokenFromHeader = String(socket.handshake.headers?.authorization || '')
                .replace(/^Bearer\s+/i, '')
                .trim()
              const user = verifyAuthToken(tokenFromAuth || tokenFromHeader)
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
                  const [conversationRows] = await conn.query('SELECT * FROM conversations WHERE id = ? LIMIT 1', [conversationId])
                  const conversation = conversationRows[0]
                  if (!conversation || (conversation.parent_id !== userId && conversation.teacher_id !== userId)) {
                    await conn.rollback()
                    return
                  }
                  const receiverId = conversation.parent_id === userId ? conversation.teacher_id : conversation.parent_id
                  const [result] = await conn.query('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)', [
                    conversationId,
                    userId,
                    content
                  ])
                  await conn.query('UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?', [content, conversationId])
                  await conn.commit()

                  const [messageRows] = await pool.query('SELECT * FROM messages WHERE id = ?', [result.insertId])
                  const saved = messageRows[0]
                  const payload = {
                    id: Number(saved.id),
                    conversationId: Number(saved.conversation_id),
                    senderId: Number(saved.sender_id),
                    content: saved.content,
                    isRead: !!saved.is_read,
                    createdAt: isoTime(saved.created_at)
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

            app.use((_req, res) => fail(res, 404, 'Not Found'))

            httpServer.listen(PORT, () => {
              console.log(`[api] running at http://localhost:${PORT} (with WebSocket)`)
            })
