import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { randomUUID } from 'node:crypto'
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
const DEFAULT_AUTH_TOKEN_SECRET = 'zhixue-dev-secret-change-me'
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || DEFAULT_AUTH_TOKEN_SECRET
const AUTH_TOKEN_EXPIRES_IN_SECONDS = Number(process.env.AUTH_TOKEN_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 7)
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const CURRENT_PARENT_USER_ID = 1
const CURRENT_TEACHER_USER_ID = 2
const teacherSessions = new Map()

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

const getBearerToken = (req) => {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return ''
  return header.slice(7).trim()
}

const resolveTeacherUserIdFromAuth = (req) => {
  const token = getBearerToken(req)
  if (!token) return null
  const userId = teacherSessions.get(token)
  return typeof userId === 'number' ? userId : null
}

const resolveTeacherUserId = (req) => resolveTeacherUserIdFromAuth(req) ?? CURRENT_TEACHER_USER_ID

const issueTeacherToken = (userId) => {
  const token = randomUUID().replace(/-/g, '')
  teacherSessions.set(token, userId)
  return token
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

const ensureTeacherExtensionTables = async () => {
  const queries = [
    "ALTER TABLE users ADD COLUMN avatar TEXT NULL",
    "ALTER TABLE users ADD COLUMN wechat VARCHAR(50) NOT NULL DEFAULT ''",
    `CREATE TABLE IF NOT EXISTS teacher_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      real_name VARCHAR(50) NOT NULL DEFAULT '',
      city VARCHAR(50) NOT NULL DEFAULT '',
      district VARCHAR(50) NOT NULL DEFAULT '',
      subjects JSON,
      grades JSON,
      experience_years INT NOT NULL DEFAULT 0,
      teaching_style VARCHAR(100) NOT NULL DEFAULT '',
      student_type VARCHAR(100) NOT NULL DEFAULT '',
      areas JSON,
      intro TEXT,
      verified TINYINT(1) NOT NULL DEFAULT 0,
      verify_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      verify_remark VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_teacher_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS teacher_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      cert_type ENUM('teacher_license','work_proof','id_card') NOT NULL,
      cert_url TEXT NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      review_remark VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_teacher_verifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS questionnaires (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      role ENUM('teacher','parent') NOT NULL,
      answers JSON NOT NULL,
      version VARCHAR(20) NOT NULL DEFAULT 'v1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_questionnaire_user_role(user_id, role),
      CONSTRAINT fk_questionnaires_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      parent_id INT NOT NULL,
      request_id INT NOT NULL,
      match_score DECIMAL(5,2) NOT NULL DEFAULT 0,
      status ENUM('new','viewed','unlocked','accepted','rejected','expired') NOT NULL DEFAULT 'new',
      matched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unlocked_at DATETIME DEFAULT NULL,
      week_number INT NOT NULL,
      UNIQUE KEY uk_match_teacher_parent_request(teacher_id, parent_id, request_id),
      INDEX idx_match_teacher_status(teacher_id, status),
      CONSTRAINT fk_matches_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_matches_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_matches_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS contact_unlock_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      parent_id INT NOT NULL,
      request_id INT NOT NULL,
      unlock_type ENUM('phone','wechat') NOT NULL DEFAULT 'phone',
      unlock_cost INT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_unlock_teacher_time(teacher_id, created_at),
      CONSTRAINT fk_unlock_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_unlock_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_unlock_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`
  ]

  for (const sql of queries) {
    try {
      await pool.query(sql)
    } catch (error) {
      if (!String(error?.message || '').includes('Duplicate column name')) {
        console.warn('[db] teacher extension setup warning:', error.message)
      }
    }
  }
}

const getUserById = async (id) => {
  const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
  return users[0] || null
}

const ensureTeacherProfile = async (user) => {
  const [rows] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ?', [user.id])
  if (rows.length > 0) return rows[0]

  await pool.query(
    `INSERT INTO teacher_profiles
      (user_id, real_name, city, district, subjects, grades, intro, verify_status)
     VALUES (?, ?, ?, '', ?, ?, ?, 'pending')`,
    [
      user.id,
      user.nickname || '',
      user.city || '',
      JSON.stringify(parseArrayField(user.preferred_subjects)),
      JSON.stringify(parseArrayField(user.preferred_grade)),
      user.bio || ''
    ]
  )
  const [created] = await pool.query('SELECT * FROM teacher_profiles WHERE user_id = ?', [user.id])
  return created[0]
}

const getTeacherInfo = async (req = null) => getUserById(resolveTeacherUserId(req || { headers: {} }))

const buildTeacherProfileDTO = async (user) => {
  const profile = await ensureTeacherProfile(user)
  return {
    teacherName: user.nickname,
    phone: user.phone,
    city: profile.city || user.city || '',
    district: profile.district || '',
    bio: profile.intro || user.bio || '',
    avatar: user.avatar,
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

const calcMatchScore = (teacherProfile, requestRow) => {
  let score = 40
  const subjects = parseArrayField(teacherProfile.subjects)
  const grades = parseArrayField(teacherProfile.grades)
  if (subjects.includes(String(requestRow.subject || ''))) score += 30
  if (grades.includes(String(requestRow.grade || ''))) score += 20
  if ((teacherProfile.city || '') === '上海') score += 5
  score += Math.min(10, Number(teacherProfile.experience_years || 0))
  return Math.min(100, score)
}

const resolveMembershipUserId = (req) => {
  const role = String(req.query.role || '').toLowerCase()
  return role === 'teacher' ? CURRENT_TEACHER_USER_ID : CURRENT_PARENT_USER_ID
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

app.post('/api/teacher/auth/send-code', async (_req, res) => {
  ok(res, { sent: true, ttlSeconds: 300 })
})

app.post('/api/teacher/auth/register', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const nickname = String(req.body?.nickname || '新老师').trim()
  const city = String(req.body?.city || '上海').trim()
  if (!/^1\d{10}$/.test(phone)) return fail(res, 400, 'Invalid phone')
  if (password.length < 6) return fail(res, 400, 'Password too short')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [existing] = await conn.query('SELECT id FROM users WHERE phone = ?', [phone])
    if (existing.length) return fail(res, 409, 'Phone already registered')

    const hash = await bcrypt.hash(password, 10)
    const [result] = await conn.query(
      `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects, avatar, wechat)
       VALUES ('teacher', ?, ?, ?, ?, '', '', '[]', '', '')`,
      [nickname, phone, hash, city]
    )
    const teacherId = Number(result.insertId)
    await conn.query(
      `INSERT INTO teacher_profiles (user_id, real_name, city, district, subjects, grades, intro, verify_status)
       VALUES (?, ?, ?, '', '[]', '[]', '', 'pending')`,
      [teacherId, nickname, city]
    )
    await conn.query(
      'INSERT INTO user_settings (user_id, notifications, privacy, deactivated) VALUES (?, ?, ?, FALSE)',
      [teacherId, JSON.stringify({ newRequest: true, messageReminder: true, systemNotice: true }), JSON.stringify({ showPhoneToParent: true, allowParentInvite: true })]
    )
    await conn.commit()
    const token = issueTeacherToken(teacherId)
    ok(res, { token, teacherId })
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
    const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = ?', [phone, 'teacher'])
    const user = rows[0]
    if (!user) return fail(res, 404, 'Teacher not found')
    const matched = await bcrypt.compare(password, user.password_hash)
    if (!matched) return fail(res, 400, 'Password is incorrect')
    const token = issueTeacherToken(user.id)
    ok(res, { token, teacherId: user.id, nickname: user.nickname })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/auth/logout', async (req, res) => {
  const token = getBearerToken(req)
  if (token) teacherSessions.delete(token)
  ok(res, { logout: true })
})

app.get('/api/teacher/auth/me', async (req, res) => {
  const userId = resolveTeacherUserIdFromAuth(req)
  if (!userId) return fail(res, 401, 'Unauthorized')
  try {
    const user = await getUserById(userId)
    if (!user || user.role !== 'teacher') return fail(res, 404, 'Teacher not found')
    ok(res, { id: user.id, nickname: user.nickname, phone: user.phone, city: user.city })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/verification/upload', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  const certType = String(req.body?.certType || 'work_proof')
  const certUrl = String(req.body?.certUrl || '').trim()
  if (!certUrl) return fail(res, 400, 'certUrl is required')
  try {
    await pool.query(
      'INSERT INTO teacher_verifications (user_id, cert_type, cert_url, status) VALUES (?, ?, ?, ?)',
      [userId, certType, certUrl, 'pending']
    )
    await pool.query('UPDATE teacher_profiles SET verify_status = ?, verify_remark = ? WHERE user_id = ?', ['pending', '', userId])
    ok(res, { submitted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/verification/status', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  try {
    const [profileRows] = await pool.query('SELECT verify_status, verified, verify_remark FROM teacher_profiles WHERE user_id = ?', [userId])
    const [certRows] = await pool.query(
      'SELECT cert_type, cert_url, status, review_remark, created_at FROM teacher_verifications WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
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
        createdAt: new Date(item.created_at).toISOString()
      }))
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/questionnaire', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  const answers = req.body?.answers
  if (!answers || typeof answers !== 'object') return fail(res, 400, 'answers is required')
  try {
    const [rows] = await pool.query("SELECT id FROM questionnaires WHERE user_id = ? AND role = 'teacher' LIMIT 1", [userId])
    if (rows.length) {
      await pool.query("UPDATE questionnaires SET answers = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(answers), rows[0].id])
    } else {
      await pool.query("INSERT INTO questionnaires (user_id, role, answers, version) VALUES (?, 'teacher', ?, 'v1')", [userId, JSON.stringify(answers)])
    }
    ok(res, { saved: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/questionnaire/latest', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  try {
    const [rows] = await pool.query(
      "SELECT answers, updated_at FROM questionnaires WHERE user_id = ? AND role = 'teacher' ORDER BY updated_at DESC LIMIT 1",
      [userId]
    )
    const row = rows[0]
    ok(res, {
      answers: parseObjectField(row?.answers || '{}'),
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/matches', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  const status = String(req.query.status || '').trim()
  try {
    const teacher = await getUserById(userId)
    if (!teacher || teacher.role !== 'teacher') return fail(res, 404, 'Teacher not found')
    const profile = await ensureTeacherProfile(teacher)

    const [sourceRequests] = await pool.query(
      `SELECT r.*, u.nickname AS parent_name
       FROM requests r
       JOIN users u ON r.parent_id = u.id
       WHERE r.status IN ('pending', 'matching', 'scheduled')
       ORDER BY r.created_at DESC
       LIMIT 60`
    )

    for (const item of sourceRequests) {
      const score = calcMatchScore(profile, item)
      const [existing] = await pool.query(
        'SELECT id FROM matches WHERE teacher_id = ? AND parent_id = ? AND request_id = ?',
        [teacher.id, item.parent_id, item.id]
      )
      if (!existing.length && score >= 60) {
        const weekNumber = Number(new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(0, 6))
        await pool.query(
          `INSERT INTO matches (teacher_id, parent_id, request_id, match_score, status, week_number)
           VALUES (?, ?, ?, ?, 'new', ?)`,
          [teacher.id, item.parent_id, item.id, score, weekNumber]
        )
      }
    }

    const whereStatus = status ? 'AND m.status = ?' : ''
    const params = status ? [teacher.id, status] : [teacher.id]
    const [matches] = await pool.query(
      `SELECT m.*, r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status,
              u.nickname AS parent_name
       FROM matches m
       JOIN requests r ON m.request_id = r.id
       JOIN users u ON m.parent_id = u.id
       WHERE m.teacher_id = ? ${whereStatus}
       ORDER BY m.match_score DESC, m.matched_at DESC`,
      params
    )
    ok(
      res,
      matches.map((m) => ({
        id: m.id,
        parentId: m.parent_id,
        requestId: m.request_id,
        title: m.title,
        subject: m.subject,
        grade: m.grade,
        budget: m.budget,
        schedule: m.schedule,
        requestStatus: m.request_status,
        parentName: m.parent_name,
        matchScore: Number(m.match_score || 0),
        status: m.status,
        matchedAt: new Date(m.matched_at).toISOString(),
        unlockedAt: m.unlocked_at ? new Date(m.unlocked_at).toISOString() : null
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/matches/:id/unlock', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  const matchId = Number(req.params.id)
  const unlockType = String(req.body?.unlockType || 'phone')
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [matchRows] = await conn.query('SELECT * FROM matches WHERE id = ? AND teacher_id = ? FOR UPDATE', [matchId, userId])
    const match = matchRows[0]
    if (!match) return fail(res, 404, 'Match not found')

    const [profileRows] = await conn.query('SELECT verified, verify_status FROM teacher_profiles WHERE user_id = ?', [userId])
    const verifyStatus = String(profileRows[0]?.verify_status || 'pending')
    if (verifyStatus === 'rejected') return fail(res, 403, 'Teacher is not verified')

    const [membershipRows] = await conn.query('SELECT * FROM memberships WHERE user_id = ? FOR UPDATE', [userId])
    const membership = membershipRows[0]
    const remainingUnlock = Number(membership?.remaining_unlock ?? 0)

    if (match.status !== 'unlocked') {
      if (!membership || remainingUnlock <= 0) return fail(res, 402, 'No remaining unlock quota')
      await conn.query('UPDATE memberships SET remaining_unlock = remaining_unlock - 1 WHERE user_id = ?', [userId])
      await conn.query(
        'INSERT INTO contact_unlock_records (teacher_id, parent_id, request_id, unlock_type, unlock_cost) VALUES (?, ?, ?, ?, 1)',
        [userId, match.parent_id, match.request_id, unlockType === 'wechat' ? 'wechat' : 'phone']
      )
      await conn.query("UPDATE matches SET status = 'unlocked', unlocked_at = NOW() WHERE id = ?", [matchId])
    }

    const [parentRows] = await conn.query('SELECT phone, wechat, nickname FROM users WHERE id = ?', [match.parent_id])
    await conn.commit()
    ok(res, {
      unlocked: true,
      parentName: parentRows[0]?.nickname || '家长',
      phone: parentRows[0]?.phone || '',
      wechat: parentRows[0]?.wechat || `wx_${match.parent_id}`
    })
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

app.post('/api/teacher/matches/:id/accept', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  const matchId = Number(req.params.id)
  try {
    const teacher = await getUserById(userId)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    const [rows] = await pool.query('SELECT * FROM matches WHERE id = ? AND teacher_id = ?', [matchId, userId])
    const match = rows[0]
    if (!match) return fail(res, 404, 'Match not found')
    await pool.query("UPDATE matches SET status = 'accepted' WHERE id = ?", [matchId])
    await pool.query("UPDATE requests SET teacher_name = ?, status = 'scheduled' WHERE id = ?", [teacher.nickname, match.request_id])
    ok(res, { accepted: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/teacher/matches/:id/reject', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  const matchId = Number(req.params.id)
  try {
    const [result] = await pool.query("UPDATE matches SET status = 'rejected' WHERE id = ? AND teacher_id = ?", [matchId, userId])
    if (!result.affectedRows) return fail(res, 404, 'Match not found')
    ok(res, { rejected: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/unlock-records', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.nickname AS parent_name
       FROM contact_unlock_records r
       JOIN users u ON r.parent_id = u.id
       WHERE r.teacher_id = ?
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [userId]
    )
    ok(
      res,
      rows.map((item) => ({
        id: item.id,
        parentId: item.parent_id,
        parentName: item.parent_name,
        requestId: item.request_id,
        unlockType: item.unlock_type,
        unlockCost: item.unlock_cost,
        createdAt: new Date(item.created_at).toISOString()
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/dashboard/summary', async (req, res) => {
  const userId = resolveTeacherUserId(req)
  try {
    const [matchRows] = await pool.query(
      "SELECT SUM(status='new') AS new_count, SUM(status='unlocked') AS unlocked_count FROM matches WHERE teacher_id = ?",
      [userId]
    )
    const [requestRows] = await pool.query(
      "SELECT COUNT(*) AS mine_count FROM requests r JOIN users u ON u.id = ? WHERE r.teacher_name = u.nickname AND r.status IN ('pending','matching','scheduled')",
      [userId]
    )
    const [membershipRows] = await pool.query('SELECT remaining_unlock FROM memberships WHERE user_id = ?', [userId])
    ok(res, {
      newMatchCount: Number(matchRows[0]?.new_count || 0),
      unlockedMatchCount: Number(matchRows[0]?.unlocked_count || 0),
      processingRequestCount: Number(requestRows[0]?.mine_count || 0),
      remainingUnlock: Number(membershipRows[0]?.remaining_unlock || 0)
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})
app.get('/api/teacher/profile', async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req)
    if (!teacher) return fail(res, 404, 'Teacher not found')
    ok(res, await buildTeacherProfileDTO(teacher))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/profile', async (req, res) => {
  const payload = req.body || {}
  if (!payload.teacherName || !payload.phone) return fail(res, 400, 'teacherName and phone are required')
  const teacherId = resolveTeacherUserId(req)
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
        teacherId
      ]
    )
    await pool.query(
      `INSERT INTO teacher_profiles
        (user_id, real_name, city, district, subjects, grades, experience_years, teaching_style, student_type, areas, intro, verify_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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
         intro=VALUES(intro)`,
      [
        teacherId,
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
  const teacherId = resolveTeacherUserId(req)
  try {
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, teacherId])
    ok(res, { avatar })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/requests', async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req)
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
    const teacher = await getTeacherInfo(req)
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
    const teacher = await getTeacherInfo(req)
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
    const teacher = await getTeacherInfo(req)
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

app.get('/api/teacher/reviews', async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req)
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

app.get('/api/teacher/analytics', async (req, res) => {
  try {
    const teacher = await getTeacherInfo(req)
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

app.get('/api/teacher/membership/status', async (req, res) => {
  const teacherId = resolveTeacherUserId(req)
  try {
    const [memberships] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [teacherId])
    if (!memberships.length) {
      return ok(res, { planName: '普通老师', expireAt: null, remainingUnlock: 3, weeklyPriorityQuota: 1 })
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
      name: '铜牌老师',
      price: 19.9,
      durationMonth: 1,
      features: ['每天 5 次解锁次数', '中部曝光位', '基础数据面板'],
      features: ['每天 5 次解锁次数', '中部曝光位', '基础数据面板'],
      recommended: false
    },
    {
      id: 'silver',
      name: '银牌老师',
      name: '银牌老师',
      price: 29.9,
      durationMonth: 1,
      features: ['每天 10 次解锁次数', '上部曝光位', '详细报表 + 实时通知'],
      features: ['每天 10 次解锁次数', '上部曝光位', '详细报表 + 实时通知'],
      recommended: true
    },
    {
      id: 'gold',
      name: '金牌老师',
      name: '金牌老师',
      price: 49.9,
      durationMonth: 1,
      features: ['无限解锁次数', '顶部置顶曝光', '优先推荐 + 专属客服'],
      features: ['无限解锁次数', '顶部置顶曝光', '优先推荐 + 专属客服'],
      recommended: false
    }
  ])
})

app.post('/api/teacher/membership/subscribe', async (req, res) => {
  const teacherId = resolveTeacherUserId(req)
  const planId = String(req.body?.plan_id || '')
  const autoRenew = Boolean(req.body?.auto_renew)
  const planMap = {
    bronze: { name: '铜牌老师', unlock: 5, quota: 2 },
    silver: { name: '银牌老师', unlock: 10, quota: 5 },
    gold: { name: '金牌老师', unlock: 999, quota: 10 }
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
      [teacherId, selected.name, expire, selected.unlock, selected.quota, autoRenew]
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

app.get('/api/teacher/settings', async (req, res) => {
  const teacherId = resolveTeacherUserId(req)
  try {
    const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [teacherId])
    if (!rows.length) return ok(res, { notifications: {}, privacy: {} })
    ok(res, {
      notifications: parseObjectField(rows[0].notifications),
      privacy: parseObjectField(rows[0].privacy)
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/settings/password', async (req, res) => {
  const teacherId = resolveTeacherUserId(req)
  const currentPassword = String(req.body?.current_password || '')
  const nextPassword = String(req.body?.new_password || '')
  if (nextPassword.length < 6) return fail(res, 400, 'New password must be at least 6 chars')
  try {
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [teacherId])
    if (!users.length) return fail(res, 404, 'Teacher not found')
    const matched = await bcrypt.compare(currentPassword, users[0].password_hash)
    if (!matched) return fail(res, 400, 'Current password is incorrect')
    const hash = await bcrypt.hash(nextPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, teacherId])
    ok(res, { updated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/settings/notifications', async (req, res) => {
  const teacherId = resolveTeacherUserId(req)
  try {
    const [rows] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [teacherId])
    const current = rows.length ? parseObjectField(rows[0].notifications) : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)',
      [teacherId, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/teacher/settings/privacy', async (req, res) => {
  const teacherId = resolveTeacherUserId(req)
  try {
    const [rows] = await pool.query('SELECT privacy FROM user_settings WHERE user_id = ?', [teacherId])
    const current = rows.length ? parseObjectField(rows[0].privacy) : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    await pool.query(
      'INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)',
      [teacherId, JSON.stringify(nextOpts)]
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

await ensureTeacherExtensionTables()

httpServer.listen(PORT, () => {
  console.log(`[api] running at http://localhost:${PORT} (with WebSocket)`)
})

