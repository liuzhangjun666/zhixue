import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import pool from './db.js'

const app = express()
const httpServer = createServer(app)

const PORT = Number(process.env.PORT || 8000)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'zhixue-dev-secret-change-me'
const AUTH_TOKEN_EXPIRES_IN_SECONDS = Number(process.env.AUTH_TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 7)

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

const ok = (res, data, message = 'ok') => res.json({ code: 0, message, data })
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

const getTeacherInfo = async (userId) => {
  const user = await getUserById(userId)
  if (!user || user.role !== 'teacher') return null
  return user
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
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const nickname = String(req.body?.nickname || '').trim()
  const subject = String(req.body?.subject || '').trim()
  const experience = String(req.body?.experience || '').trim()

  if (!phone || !password || !nickname) return fail(res, 400, 'phone, password and nickname are required')
  if (password.length < 6) return fail(res, 400, 'password must be at least 6 chars')

  try {
    const [exists] = await pool.query('SELECT id FROM users WHERE phone = ?', [phone])
    if (exists.length) return fail(res, 409, '手机号已注册')

    const passwordHash = await bcrypt.hash(password, 10)
    const preferredSubjects = subject ? [subject] : []
    const [result] = await pool.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
       VALUES ('teacher', ?, ?, ?, '', ?, '', ?)`,
      [nickname, phone, passwordHash, experience, JSON.stringify(preferredSubjects)]
    )

    const user = await getUserById(result.insertId)
    ok(res, buildAuthPayload(user), '注册成功')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/auth/teacher/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  if (!phone || !password) return fail(res, 400, 'phone and password are required')

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = ? LIMIT 1', [phone, 'teacher'])
    const user = users[0]
    if (!user) return fail(res, 401, '手机号或密码错误')

    const matched = await bcrypt.compare(password, user.password_hash || '')
    if (!matched) return fail(res, 401, '手机号或密码错误')
    ok(res, buildAuthPayload(user), '登录成功')
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

app.post('/api/auth/logout', authRequired(), (_req, res) => {
  ok(res, { success: true }, '退出成功')
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

app.get('/api/membership/status', authRequired(), async (req, res) => {
  const userId = req.user.id
  const defaultName = req.user.role === 'teacher' ? '普通老师' : '普通用户'
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

app.post('/api/parent/settings/deactivate', authRequired('parent'), async (req, res) => {
  const confirmText = String(req.body?.confirm_text || '')
  if (!['注销账号', '注 销 账号', '注销'].includes(confirmText)) return fail(res, 400, 'Confirm text mismatch')
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
    ok(res, {
      teacherName: teacher.nickname,
      phone: teacher.phone,
      city: teacher.city,
      bio: teacher.bio,
      avatar: teacher.avatar,
      preferredGrades: parseArrayField(teacher.preferred_grade),
      preferredSubjects: parseArrayField(teacher.preferred_subjects)
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/profile', authRequired('teacher'), async (req, res) => {
  const payload = req.body || {}
  if (!payload.teacherName || !payload.phone) return fail(res, 400, 'teacherName and phone are required')
  try {
    await pool.query(
      'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=? WHERE id=?',
      [
        payload.teacherName,
        payload.phone,
        payload.city || '',
        payload.bio || '',
        Array.isArray(payload.preferredGrades) ? payload.preferredGrades.join(',') : '',
        JSON.stringify(payload.preferredSubjects || []),
        req.user.id
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
        rating: item.rating,
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
      `SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating
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

app.get('/api/teacher/membership/status', authRequired('teacher'), async (req, res) => {
  try {
    const [memberships] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [req.user.id])
    if (!memberships.length) {
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
      features: ['每天 5 次解锁次数', '中部曝光位', '基础数据面板'],
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
    bronze: { name: '铜牌老师', unlock: 5, quota: 2 },
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
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE (c.parent_id = ? OR c.teacher_id = ?)
         AND m.sender_id != ?
         AND m.is_read = FALSE`,
      [userId, userId, userId]
    )
    ok(res, { count: Number(rows[0]?.count || 0) })
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



