import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import pool from './db.js'
import { runRetentionJobs } from './retention.js'

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
const SMS_CODE_TTL_SECONDS = 300
const smsCodeStore = new Map()
const DEV_FALLBACK_SMS_CODE = String(process.env.DEV_FALLBACK_SMS_CODE || '123456').trim()
const SMS_PROVIDER = String(process.env.SMS_PROVIDER || 'mock').trim().toLowerCase()
const SMS_WEBHOOK_URL = String(process.env.SMS_WEBHOOK_URL || '').trim()
const SMS_WEBHOOK_TOKEN = String(process.env.SMS_WEBHOOK_TOKEN || '').trim()
const SMS_SIGN_NAME = String(process.env.SMS_SIGN_NAME || '知学空间').trim()
const SMS_VERIFY_TEMPLATE = String(process.env.SMS_VERIFY_TEMPLATE || 'VERIFY_CODE').trim()
const SMS_RENEW_TEMPLATE = String(process.env.SMS_RENEW_TEMPLATE || 'AUTO_RENEW_REMINDER').trim()
const SMS_TIMEOUT_MS = Math.max(1000, Number(process.env.SMS_TIMEOUT_MS || 5000))
const SMS_REGION = String(process.env.SMS_REGION || 'ap-guangzhou').trim()
const SMS_TENCENT_SECRET_ID = String(process.env.SMS_TENCENT_SECRET_ID || '').trim()
const SMS_TENCENT_SECRET_KEY = String(process.env.SMS_TENCENT_SECRET_KEY || '').trim()
const SMS_TENCENT_SDK_APP_ID = String(process.env.SMS_TENCENT_SDK_APP_ID || '').trim()
const SMS_TENCENT_VERIFY_TEMPLATE_ID = String(process.env.SMS_TENCENT_VERIFY_TEMPLATE_ID || SMS_VERIFY_TEMPLATE || '').trim()
const SMS_TENCENT_RENEW_TEMPLATE_ID = String(process.env.SMS_TENCENT_RENEW_TEMPLATE_ID || SMS_RENEW_TEMPLATE || '').trim()
const CURRENT_POLICY_VERSION = String(process.env.CURRENT_POLICY_VERSION || '2026-04-30').trim()
const MESSAGE_MAX_LENGTH = Math.max(1, Number(process.env.MESSAGE_MAX_LENGTH || 1000))
const MESSAGE_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.MESSAGE_RATE_LIMIT_WINDOW_MS || 10 * 1000))
const MESSAGE_RATE_LIMIT_MAX = Math.max(1, Number(process.env.MESSAGE_RATE_LIMIT_MAX || 10))
const AUTH_SEND_CODE_WINDOW_MS = Math.max(1000, Number(process.env.AUTH_SEND_CODE_WINDOW_MS || 10 * 60 * 1000))
const AUTH_SEND_CODE_MAX = Math.max(1, Number(process.env.AUTH_SEND_CODE_MAX || 5))
const AUTH_LOGIN_WINDOW_MS = Math.max(1000, Number(process.env.AUTH_LOGIN_WINDOW_MS || 10 * 60 * 1000))
const AUTH_LOGIN_MAX = Math.max(1, Number(process.env.AUTH_LOGIN_MAX || 10))
const AUTH_LOGIN_FAIL_WINDOW_MS = Math.max(1000, Number(process.env.AUTH_LOGIN_FAIL_WINDOW_MS || 15 * 60 * 1000))
const AUTH_LOGIN_FAIL_MAX = Math.max(1, Number(process.env.AUTH_LOGIN_FAIL_MAX || 5))
const ADMIN_REVIEW_TOKEN = String(process.env.ADMIN_REVIEW_TOKEN || '').trim()
const RETENTION_JOB_ENABLED = String(process.env.RETENTION_JOB_ENABLED || 'true').trim().toLowerCase() !== 'false'
const RETENTION_JOB_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.RETENTION_JOB_INTERVAL_MS || 12 * 60 * 60 * 1000))
const MESSAGE_SENSITIVE_WORDS = String(process.env.MESSAGE_SENSITIVE_WORDS || '色情,赌博,诈骗,毒品,嫖娼,约炮')
  .split(/[,\n]/)
  .map((v) => v.trim())
  .filter(Boolean)
const ALLOWED_COMPLAINT_TYPES = new Set(['fake_info', 'harassment', 'service_issue', 'other'])
const messageRateLimitStore = new Map()
const authSendCodeLimitStore = new Map()
const authLoginLimitStore = new Map()
const authLoginFailureStore = new Map()

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
    } catch { }
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
const getClientIp = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim()
const getUserAgent = (req) => String(req.headers['user-agent'] || '').slice(0, 255)

const getBearerToken = (req) => {
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) return ''
  return header.slice(7).trim()
}

const signPayload = (payload) => crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payload).digest('base64url')

const issueToken = (user) => {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + AUTH_TOKEN_EXPIRES_IN_SECONDS
  const payload = Buffer.from(
    JSON.stringify({
      id: Number(user.id),
      role: user.role,
      iat: now,
      exp
    })
  ).toString('base64url')
  return {
    token: `${payload}.${signPayload(payload)}`,
    tokenExpiresIn: AUTH_TOKEN_EXPIRES_IN_SECONDS,
    tokenExpiresAt: new Date(exp * 1000).toISOString()
  }
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
  ; (async () => {
    const user = verifyToken(getBearerToken(req))
    if (!user) return fail(res, 401, 'Unauthorized')
    if (role && user.role !== role) return fail(res, 403, 'Forbidden')
    const [settingRows] = await pool.query('SELECT deactivated FROM user_settings WHERE user_id = ? LIMIT 1', [user.id])
    if (settingRows[0]?.deactivated) return fail(res, 403, 'Account deactivated')
    const restrictions = await getActiveRestrictions(user.id)
    if (restrictions.some((item) => item.restriction_type === 'ban')) return fail(res, 403, 'Account restricted')
    req.user = user
    next()
  })().catch((error) => {
    fail(res, 500, error.message)
  })
}

const adminReviewRequired = () => (req, res, next) => {
  const token = String(req.headers['x-admin-review-token'] || '').trim()
  if (!ADMIN_REVIEW_TOKEN) return fail(res, 503, 'Admin review token not configured')
  if (!token || token !== ADMIN_REVIEW_TOKEN) return fail(res, 401, 'Unauthorized')
  req.adminId = 'review-admin'
  next()
}

const createAuditLog = async ({ actorType, actorId, action, targetType = '', targetId = '', details = {} }) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (actor_type, actor_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [String(actorType || 'system'), String(actorId || ''), String(action || ''), String(targetType || ''), String(targetId || ''), JSON.stringify(details || {})]
    )
  } catch (error) {
    console.error('[audit] failed to write audit log:', error?.message || error)
  }
}

const getActiveRestrictions = async (userId) => {
  const [rows] = await pool.query(
    `SELECT id, restriction_type, reason, start_at, end_at
       FROM user_restrictions
      WHERE user_id = ?
        AND is_active = TRUE
        AND (end_at IS NULL OR end_at > NOW())`,
    [userId]
  )
  return rows
}

const getUserById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id])
  return rows[0] || null
}

const getUserByPhone = async (phone, role) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE phone = ? AND role = ? LIMIT 1', [phone, role])
  return rows[0] || null
}

const createSmsKey = (role, phone) => `${role}:${String(phone || '').trim()}`
const issueSmsCode = (role, phone) => {
  const key = createSmsKey(role, phone)
  if (!key.endsWith(':')) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    smsCodeStore.set(key, {
      code,
      expiresAt: Date.now() + SMS_CODE_TTL_SECONDS * 1000
    })
    return code
  }
  return ''
}

const isDevFallbackCode = (code) =>
  process.env.NODE_ENV !== 'production' && String(code || '').trim() === DEV_FALLBACK_SMS_CODE

const checkSmsCode = (role, phone, code) => {
  if (isDevFallbackCode(code)) return true
  const key = createSmsKey(role, phone)
  const payload = smsCodeStore.get(key)
  if (!payload) return false
  if (payload.expiresAt < Date.now()) {
    smsCodeStore.delete(key)
    return false
  }
  return String(payload.code) === String(code || '')
}

const verifySmsCode = (role, phone, code) => {
  if (isDevFallbackCode(code)) return true
  if (!checkSmsCode(role, phone, code)) return false
  const key = createSmsKey(role, phone)
  smsCodeStore.delete(key)
  return true
}

const isRateLimited = (store, key, windowMs, max) => {
  const now = Date.now()
  const windowStart = now - windowMs
  const history = (store.get(key) || []).filter((ts) => ts > windowStart)
  if (history.length >= max) {
    store.set(key, history)
    return true
  }
  history.push(now)
  store.set(key, history)
  return false
}

const incrementLoginFailure = (key) => {
  const now = Date.now()
  const windowStart = now - AUTH_LOGIN_FAIL_WINDOW_MS
  const history = (authLoginFailureStore.get(key) || []).filter((ts) => ts > windowStart)
  history.push(now)
  authLoginFailureStore.set(key, history)
  return history.length
}

const getLoginFailureCount = (key) => {
  const now = Date.now()
  const windowStart = now - AUTH_LOGIN_FAIL_WINDOW_MS
  const history = (authLoginFailureStore.get(key) || []).filter((ts) => ts > windowStart)
  authLoginFailureStore.set(key, history)
  return history.length
}

const clearLoginFailure = (key) => {
  authLoginFailureStore.delete(key)
}

const normalizeComplaintType = (type) => {
  const value = String(type || 'other').trim()
  return ALLOWED_COMPLAINT_TYPES.has(value) ? value : 'other'
}

const isMessageRateLimited = (userId) => {
  const key = String(userId)
  const now = Date.now()
  const windowStart = now - MESSAGE_RATE_LIMIT_WINDOW_MS
  const history = (messageRateLimitStore.get(key) || []).filter((ts) => ts > windowStart)
  if (history.length >= MESSAGE_RATE_LIMIT_MAX) {
    messageRateLimitStore.set(key, history)
    return true
  }
  history.push(now)
  messageRateLimitStore.set(key, history)
  return false
}

const findSensitiveWords = (content) => {
  const normalized = String(content || '').toLowerCase()
  if (!normalized) return []
  return MESSAGE_SENSITIVE_WORDS.filter((word) => normalized.includes(word.toLowerCase())).slice(0, 5)
}

const maskPhone = (phone) => {
  const text = String(phone || '').trim()
  if (text.length < 7) return text
  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

const normalizeMainlandPhone = (value) => {
  const raw = String(value || '').trim()
  const digits = raw.replace(/\D/g, '')
  if (/^86\d{11}$/.test(digits)) return digits.slice(2)
  if (/^\d{11}$/.test(digits)) return digits
  return ''
}

const sha256Hex = (content) => crypto.createHash('sha256').update(content, 'utf8').digest('hex')
const hmacSha256 = (key, content, encoding) => crypto.createHmac('sha256', key).update(content, 'utf8').digest(encoding)

const sendTencentSms = async ({ phone, templateCode, templateParams, messageType }) => {
  if (!SMS_TENCENT_SECRET_ID || !SMS_TENCENT_SECRET_KEY || !SMS_TENCENT_SDK_APP_ID) {
    return { sent: false, reason: 'missing tencent sms credentials' }
  }
  const mainland = normalizeMainlandPhone(phone)
  if (!mainland) return { sent: false, reason: 'invalid mainland phone number' }
  const templateId =
    messageType === 'membership_renew_reminder'
      ? SMS_TENCENT_RENEW_TEMPLATE_ID || String(templateCode || '')
      : SMS_TENCENT_VERIFY_TEMPLATE_ID || String(templateCode || '')
  if (!templateId) return { sent: false, reason: 'missing template id' }
  const templateParamSet =
    messageType === 'membership_renew_reminder'
      ? [String(templateParams?.nickname || ''), String(templateParams?.planName || ''), String(templateParams?.expireAt || '')]
      : [String(templateParams?.code || ''), String(templateParams?.ttlMinutes || '')]

  const body = JSON.stringify({
    PhoneNumberSet: [`+86${mainland}`],
    SmsSdkAppId: SMS_TENCENT_SDK_APP_ID,
    SignName: SMS_SIGN_NAME,
    TemplateId: templateId,
    TemplateParamSet: templateParamSet,
    SessionContext: String(messageType || '')
  })

  const service = 'sms'
  const host = 'sms.tencentcloudapi.com'
  const endpoint = `https://${host}/`
  const action = 'SendSms'
  const version = '2021-01-11'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(body)}`
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`
  const secretDate = hmacSha256(`TC3${SMS_TENCENT_SECRET_KEY}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = hmacSha256(secretSigning, stringToSign, 'hex')
  const authorization = `TC3-HMAC-SHA256 Credential=${SMS_TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': version,
        'X-TC-Region': SMS_REGION
      },
      body,
      signal: controller.signal
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return { sent: false, reason: `http ${response.status}` }
    }
    const apiError = payload?.Response?.Error
    if (apiError) {
      return { sent: false, reason: `${apiError.Code || 'SmsError'} ${apiError.Message || ''}`.trim() }
    }
    const status = payload?.Response?.SendStatusSet?.[0]
    if (status && status.Code && status.Code !== 'Ok') {
      return { sent: false, reason: `${status.Code} ${status.Message || ''}`.trim() }
    }
    return { sent: true, mock: false, provider: 'tencent' }
  } catch (error) {
    return { sent: false, reason: error?.message || 'unknown error' }
  } finally {
    clearTimeout(timeout)
  }
}

const sendSms = async ({ phone, templateCode, templateParams, messageType }) => {
  const normalizedPhone = String(phone || '').replace(/\s+/g, '')
  if (!normalizedPhone) return { sent: false, reason: 'missing phone' }

  if (SMS_PROVIDER === 'tencent') {
    return sendTencentSms({ phone: normalizedPhone, templateCode, templateParams, messageType })
  }

  if (!SMS_WEBHOOK_URL || SMS_PROVIDER === 'mock') {
    console.log(
      `[sms][mock] type=${messageType} phone=${maskPhone(normalizedPhone)} template=${templateCode} params=${JSON.stringify(templateParams)}`
    )
    return { sent: true, mock: true }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS)
  try {
    const response = await fetch(SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${SMS_WEBHOOK_TOKEN}` } : {})
      },
      body: JSON.stringify({
        provider: SMS_PROVIDER,
        signName: SMS_SIGN_NAME,
        phone: normalizedPhone,
        templateCode,
        templateParams,
        messageType
      }),
      signal: controller.signal
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { sent: false, reason: `http ${response.status}${text ? ` ${text}` : ''}` }
    }
    return { sent: true, mock: false }
  } catch (error) {
    return { sent: false, reason: error?.message || 'unknown error' }
  } finally {
    clearTimeout(timeout)
  }
}

const sendVerificationSms = async (role, phone, code) => {
  const result = await sendSms({
    phone,
    templateCode: SMS_VERIFY_TEMPLATE,
    templateParams: { code, ttlMinutes: Math.floor(SMS_CODE_TTL_SECONDS / 60) },
    messageType: `${role}_register_verify`
  })
  if (!result.sent) {
    console.error(`[sms] failed to send verify code for ${role}:`, result.reason)
  }
  return result
}

const sendMembershipRenewReminder = async ({ userId, phone, nickname, planName, expireAt }) => {
  const result = await sendSms({
    phone,
    templateCode: SMS_RENEW_TEMPLATE,
    templateParams: { nickname: nickname || '用户', planName, expireAt },
    messageType: 'membership_renew_reminder'
  })
  if (!result.sent) {
    console.error(`[sms] failed to send renew reminder userId=${userId}:`, result.reason)
  }
  return result
}

const buildAuthPayload = (user) => {
  const issued = issueToken(user)
  return {
    user: {
      id: Number(user.id),
      role: user.role,
      nickname: user.nickname,
      phone: user.phone
    },
    token: issued.token,
    tokenExpiresIn: issued.tokenExpiresIn,
    tokenExpiresAt: issued.tokenExpiresAt
  }
}

const saveUserConsent = async (conn, { userId, role, phone, policyVersion, ip, userAgent }) => {
  await conn.query(
    `INSERT INTO user_consents (user_id, role, phone, policy_version, agreed_at, ip, user_agent)
     VALUES (?, ?, ?, ?, NOW(), ?, ?)`,
    [userId, role, phone, policyVersion || CURRENT_POLICY_VERSION, ip, userAgent]
  )
}

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
  await ensureColumn('memberships', 'renew_reminder_sent_at', 'renew_reminder_sent_at DATETIME NULL')
  await ensureColumn('teacher_profiles', 'teaching_mode', "teaching_mode VARCHAR(32) NOT NULL DEFAULT 'both'")
  await ensureColumn('teacher_profiles', 'available_time_text', "available_time_text VARCHAR(255) NOT NULL DEFAULT ''")
  await ensureColumn('teacher_profiles', 'rating_avg', 'rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0')
  await ensureColumn('teacher_profiles', 'rating_count', 'rating_count INT NOT NULL DEFAULT 0')
  await ensureColumn('teacher_profiles', 'teaching_style', "teaching_style VARCHAR(64) NOT NULL DEFAULT ''")
  await ensureColumn('teacher_profiles', 'student_type', "student_type VARCHAR(64) NOT NULL DEFAULT ''")
  await ensureColumn('teacher_profiles', 'areas', 'areas JSON')
  await ensureColumn('teacher_profiles', 'verify_status', "verify_status VARCHAR(32) NOT NULL DEFAULT 'pending'")
  await ensureColumn('teacher_profiles', 'verify_remark', "verify_remark VARCHAR(255) NOT NULL DEFAULT ''")
  await ensureColumn('teacher_profiles', 'verified', 'verified TINYINT(1) NOT NULL DEFAULT 0')
  await ensureColumn('teacher_profiles', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1')
  await ensureColumn('teacher_profiles', 'hourly_price_min', 'hourly_price_min DECIMAL(10,2) NULL')
  await ensureColumn('teacher_profiles', 'hourly_price_max', 'hourly_price_max DECIMAL(10,2) NULL')
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_consents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      role ENUM('parent','teacher') NOT NULL,
      phone VARCHAR(20) NOT NULL,
      policy_version VARCHAR(40) NOT NULL,
      agreed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip VARCHAR(64) NOT NULL DEFAULT '',
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_consents_user_time(user_id, agreed_at)
    ) ENGINE=InnoDB
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_restrictions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      restriction_type ENUM('mute','ban') NOT NULL,
      reason VARCHAR(255) NOT NULL DEFAULT '',
      source_complaint_id INT DEFAULT NULL,
      start_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_at DATETIME DEFAULT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_restrictions_active(user_id, restriction_type, is_active, end_at)
    ) ENGINE=InnoDB
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_type ENUM('user','admin','system') NOT NULL,
      actor_id VARCHAR(64) NOT NULL DEFAULT '',
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50) NOT NULL DEFAULT '',
      target_id VARCHAR(64) NOT NULL DEFAULT '',
      details JSON,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_logs_time(created_at),
      INDEX idx_audit_logs_action(action)
    ) ENGINE=InnoDB
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_archives (
      id INT AUTO_INCREMENT PRIMARY KEY,
      message_id INT NOT NULL UNIQUE,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at DATETIME NOT NULL,
      archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archive_reason VARCHAR(50) NOT NULL DEFAULT 'retention_policy',
      INDEX idx_message_archives_time(created_at)
    ) ENGINE=InnoDB
  `)
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

const runRenewReminderJob = async () => {
  const [rows] = await pool.query(
    `SELECT m.id, m.user_id, m.plan_name, m.expire_at, u.phone, u.nickname
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.auto_renew = TRUE
        AND m.expire_at IS NOT NULL
        AND DATE(m.expire_at) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND m.renew_reminder_sent_at IS NULL`
  )
  if (!rows.length) return { checked: 0, sent: 0 }

  let sent = 0
  for (const row of rows) {
    const result = await sendMembershipRenewReminder({
      userId: Number(row.user_id),
      phone: row.phone,
      nickname: row.nickname,
      planName: row.plan_name,
      expireAt: toDate(row.expire_at)
    })
    if (result.sent) {
      await pool.query('UPDATE memberships SET renew_reminder_sent_at = NOW() WHERE id = ?', [row.id])
      sent += 1
    }
  }
  return { checked: rows.length, sent }
}

let runningRenewReminderJob = false
const maybeRunRenewReminderJob = async () => {
  if (runningRenewReminderJob) return
  runningRenewReminderJob = true
  try {
    const result = await runRenewReminderJob()
    if (result.checked > 0) {
      console.log(`[sms] renew reminder checked=${result.checked}, sent=${result.sent}`)
    }
  } catch (error) {
    console.error('[sms] renew reminder job failed:', error?.message || error)
  } finally {
    runningRenewReminderJob = false
  }
}

let runningRetentionJob = false
const maybeRunRetentionJob = async () => {
  if (!RETENTION_JOB_ENABLED || runningRetentionJob) return
  runningRetentionJob = true
  try {
    const result = await runRetentionJobs(pool)
    await createAuditLog({
      actorType: 'system',
      actorId: 'retention-job',
      action: 'retention_job_ran',
      targetType: 'retention',
      targetId: '',
      details: result
    })
    console.log('[retention] job done:', JSON.stringify(result))
  } catch (error) {
    console.error('[retention] job failed:', error?.message || error)
  } finally {
    runningRetentionJob = false
  }
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
  const code = String(req.body?.code || '').trim()
  const inviteCode = String(req.body?.inviteCode || '').trim()
  const agree = Boolean(req.body?.agree)
  const policyVersion = String(req.body?.policyVersion || '').trim()
  const ip = getClientIp(req)
  const userAgent = getUserAgent(req)
  if (!phone || !password || !nickname) return fail(res, 400, 'phone, password and nickname are required')
  if (!code) return fail(res, 400, 'code is required')
  if (!agree) return fail(res, 400, 'privacy agreement required')
  if (!policyVersion) return fail(res, 400, 'policyVersion is required')
  if (!verifySmsCode('parent', phone, code)) return fail(res, 400, '验证码错误或已过期')
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
       VALUES ('parent', ?, ?, ?, '', '', '', '[]')`,
      [nickname, phone, hash]
    )
    await conn.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
       VALUES (?, '体验用户', NULL, 3, 0, FALSE)`,
      [result.insertId]
    )
    await saveUserConsent(conn, { userId: result.insertId, role: 'parent', phone, policyVersion, ip, userAgent })

    if (inviteCode) {
      const [inviteRows] = await conn.query(
        `SELECT id, inviter_id, invitee_id, status
           FROM invite_records
          WHERE invite_code = ? AND role = 'parent'
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE`,
        [inviteCode]
      )
      const invite = inviteRows[0]
      if (invite && Number(invite.inviter_id || 0) !== Number(result.insertId) && !invite.invitee_id) {
        await conn.query(
          `UPDATE invite_records
              SET invitee_id = ?, status = 'verified', reward_granted = 1, updated_at = NOW()
            WHERE id = ?`,
          [result.insertId, invite.id]
        )
        await conn.query(
          `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
           VALUES (?, '体验用户', NULL, 1, 0, FALSE)
           ON DUPLICATE KEY UPDATE remaining_unlock = remaining_unlock + 1`,
          [invite.inviter_id]
        )
      }
    }

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

app.post('/api/auth/parent/send-code', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const ip = getClientIp(req)
  if (!phone) return fail(res, 400, 'phone is required')
  const [exists] = await pool.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
  if (exists.length) return fail(res, 409, '手机号已注册')
  if (isRateLimited(authSendCodeLimitStore, `parent|${ip}|${phone}`, AUTH_SEND_CODE_WINDOW_MS, AUTH_SEND_CODE_MAX)) {
    return fail(res, 429, '发送过于频繁，请稍后再试')
  }
  const debugCode = issueSmsCode('parent', phone)
  const smsResult = await sendVerificationSms('parent', phone, debugCode)
  if (!smsResult.sent) {
    const reason = String(smsResult.reason || '').trim()
    const message =
      process.env.NODE_ENV === 'production'
        ? '短信发送失败，请稍后重试'
        : `短信发送失败，请稍后重试${reason ? `（${reason}）` : ''}`
    return fail(res, 500, message)
  }
  ok(res, {
    sent: true,
    ttlSeconds: SMS_CODE_TTL_SECONDS,
    debugCode: process.env.NODE_ENV === 'production' ? undefined : debugCode,
    fallbackCode: process.env.NODE_ENV === 'production' ? undefined : DEV_FALLBACK_SMS_CODE
  })
})

app.post('/api/auth/parent/verify-code', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const code = String(req.body?.code || '').trim()
  if (!phone || !code) return fail(res, 400, 'phone and code are required')
  if (!checkSmsCode('parent', phone, code)) return fail(res, 400, '验证码错误或已过期')
  ok(res, { verified: true }, '验证码校验通过')
})

app.post('/api/auth/parent/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const password = String(req.body?.password || '')
  const ip = getClientIp(req)
  const rateKey = `parent|${ip}|${phone}`
  if (!phone || !password) return fail(res, 400, 'phone and password are required')
  if (isRateLimited(authLoginLimitStore, rateKey, AUTH_LOGIN_WINDOW_MS, AUTH_LOGIN_MAX)) {
    return fail(res, 429, '登录请求过于频繁，请稍后再试')
  }
  if (getLoginFailureCount(rateKey) >= AUTH_LOGIN_FAIL_MAX) {
    return fail(res, 429, '登录失败次数过多，请稍后再试')
  }
  try {
    const user = await getUserByPhone(phone, 'parent')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) return fail(res, 401, '用户名或密码错误')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
      incrementLoginFailure(rateKey)
      return fail(res, 401, 'Unauthorized')
    }
    const [settingRows] = await pool.query('SELECT deactivated FROM user_settings WHERE user_id = ? LIMIT 1', [user.id])
    if (settingRows[0]?.deactivated) return fail(res, 403, 'Account deactivated')
    const restrictions = await getActiveRestrictions(user.id)
    if (restrictions.some((item) => item.restriction_type === 'ban')) return fail(res, 403, 'Account restricted')
    clearLoginFailure(rateKey)
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
  const code = String(req.body?.code || '').trim()
  const agree = Boolean(req.body?.agree)
  const policyVersion = String(req.body?.policyVersion || '').trim()
  const ip = getClientIp(req)
  const userAgent = getUserAgent(req)
  if (!phone || !password || !nickname) return fail(res, 400, 'phone, password and nickname are required')
  if (!code) return fail(res, 400, 'code is required')
  if (!agree) return fail(res, 400, 'privacy agreement required')
  if (!policyVersion) return fail(res, 400, 'policyVersion is required')
  if (!verifySmsCode('teacher', phone, code)) return fail(res, 400, '验证码错误或已过期')
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
    await saveUserConsent(conn, { userId: result.insertId, role: 'teacher', phone, policyVersion, ip, userAgent })
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
  const ip = getClientIp(req)
  const rateKey = `teacher|${ip}|${phone}`
  if (!phone || !password) return fail(res, 400, 'phone and password are required')
  if (isRateLimited(authLoginLimitStore, rateKey, AUTH_LOGIN_WINDOW_MS, AUTH_LOGIN_MAX)) {
    return fail(res, 429, '登录请求过于频繁，请稍后再试')
  }
  if (getLoginFailureCount(rateKey) >= AUTH_LOGIN_FAIL_MAX) {
    return fail(res, 429, '登录失败次数过多，请稍后再试')
  }
  try {
    const user = await getUserByPhone(phone, 'teacher')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) return fail(res, 401, '用户名或密码错误')
    if (!user || !(await bcrypt.compare(password, user.password_hash || ''))) {
      incrementLoginFailure(rateKey)
      return fail(res, 401, 'Unauthorized')
    }
    const [settingRows] = await pool.query('SELECT deactivated FROM user_settings WHERE user_id = ? LIMIT 1', [user.id])
    if (settingRows[0]?.deactivated) return fail(res, 403, 'Account deactivated')
    const restrictions = await getActiveRestrictions(user.id)
    if (restrictions.some((item) => item.restriction_type === 'ban')) return fail(res, 403, 'Account restricted')
    clearLoginFailure(rateKey)
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
app.post('/api/teacher/auth/send-code', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const ip = getClientIp(req)
  if (!phone) return fail(res, 400, 'phone is required')
  const [exists] = await pool.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
  if (exists.length) return fail(res, 409, '手机号已注册')
  if (isRateLimited(authSendCodeLimitStore, `teacher|${ip}|${phone}`, AUTH_SEND_CODE_WINDOW_MS, AUTH_SEND_CODE_MAX)) {
    return fail(res, 429, '发送过于频繁，请稍后再试')
  }
  const debugCode = issueSmsCode('teacher', phone)
  const smsResult = await sendVerificationSms('teacher', phone, debugCode)
  if (!smsResult.sent) {
    const reason = String(smsResult.reason || '').trim()
    const message =
      process.env.NODE_ENV === 'production'
        ? '短信发送失败，请稍后重试'
        : `短信发送失败，请稍后重试${reason ? `（${reason}）` : ''}`
    return fail(res, 500, message)
  }
  ok(res, {
    sent: true,
    ttlSeconds: SMS_CODE_TTL_SECONDS,
    debugCode: process.env.NODE_ENV === 'production' ? undefined : debugCode,
    fallbackCode: process.env.NODE_ENV === 'production' ? undefined : DEV_FALLBACK_SMS_CODE
  })
})
app.post('/api/auth/teacher/verify-code', async (req, res) => {
  const phone = String(req.body?.phone || '').trim()
  const code = String(req.body?.code || '').trim()
  if (!phone || !code) return fail(res, 400, 'phone and code are required')
  if (!checkSmsCode('teacher', phone, code)) return fail(res, 400, '验证码错误或已过期')
  ok(res, { verified: true }, '验证码校验通过')
})
app.post('/api/teacher/auth/register', async (req, res) => {
  req.url = '/api/auth/teacher/register'
  app._router.handle(req, res, () => { })
})
app.post('/api/teacher/auth/verify-code', async (req, res) => {
  req.url = '/api/auth/teacher/verify-code'
  app._router.handle(req, res, () => { })
})
app.post('/api/teacher/auth/login', async (req, res) => {
  req.url = '/api/auth/teacher/login'
  app._router.handle(req, res, () => { })
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
      createdAt: toDate(user.created_at),
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
    let requestId = 0
    try {
      const [result] = await pool.query(
        `INSERT INTO requests (parent_id, title, subject, grade, budget, schedule, description, status, teacher_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [req.user.id, title, String(p.subject || ''), String(p.grade || ''), String(p.budget || ''), String(p.schedule || ''), String(p.description || ''), String(p.teacherName || '')]
      )
      requestId = Number(result.insertId || 0)
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
      const [result] = await pool.query(
        `INSERT INTO requests (parent_id, title, subject, grade, budget, schedule, status, teacher_name)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [req.user.id, title, String(p.subject || ''), String(p.grade || ''), String(p.budget || ''), String(p.schedule || ''), String(p.teacherName || '')]
      )
      requestId = Number(result.insertId || 0)
    }

    // Create a request first, then try immediate matching so parent/teacher pages stay in sync.
    let matchedCount = 0
    let teacherName = ''
    try {
      const matchResult = await runMatchingForRequests([requestId])
      matchedCount = Number(matchResult?.generated || 0)
      if (matchedCount > 0) {
        const [topMatchRows] = await pool.query(
          `SELECT u.nickname
             FROM matches m
             JOIN users u ON u.id = m.teacher_id
            WHERE m.request_id = ?
            ORDER BY m.match_score DESC, m.matched_at DESC
            LIMIT 1`,
          [requestId]
        )
        teacherName = String(topMatchRows[0]?.nickname || '')
        await pool.query('UPDATE requests SET status = ?, teacher_name = ? WHERE id = ? AND parent_id = ?', ['matching', teacherName, requestId, req.user.id])
      }
    } catch (matchError) {
      console.error('[matching] immediate run failed after parent request create:', matchError?.message || matchError)
    }

    ok(res, {
      id: requestId,
      status: matchedCount > 0 ? 'matching' : 'pending',
      teacherName: teacherName || '',
      matchedCount
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/requests/:id', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid request id')
  const p = req.body || {}
  const title = String(p.title || '').trim()
  if (!title) return fail(res, 400, 'title is required')
  const [rows] = await pool.query('SELECT id FROM requests WHERE id = ? AND parent_id = ? LIMIT 1', [id, req.user.id])
  if (!rows.length) return fail(res, 404, 'Request not found')
  try {
    try {
      await pool.query(
        `UPDATE requests
            SET title = ?, subject = ?, grade = ?, budget = ?, schedule = ?, description = ?, teacher_name = '', status = 'pending', updated_at = NOW()
          WHERE id = ? AND parent_id = ?`,
        [title, String(p.subject || ''), String(p.grade || ''), String(p.budget || ''), String(p.schedule || ''), String(p.description || ''), id, req.user.id]
      )
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
      await pool.query(
        `UPDATE requests
            SET title = ?, subject = ?, grade = ?, budget = ?, schedule = ?, teacher_name = '', status = 'pending'
          WHERE id = ? AND parent_id = ?`,
        [title, String(p.subject || ''), String(p.grade || ''), String(p.budget || ''), String(p.schedule || ''), id, req.user.id]
      )
    }

    // Request content changed, remove previous candidates and rerun matching.
    await pool.query('DELETE FROM matches WHERE request_id = ? AND parent_id = ?', [id, req.user.id])

    let matchedCount = 0
    let teacherName = ''
    try {
      const matchResult = await runMatchingForRequests([id])
      matchedCount = Number(matchResult?.generated || 0)
      if (matchedCount > 0) {
        const [topMatchRows] = await pool.query(
          `SELECT u.nickname
             FROM matches m
             JOIN users u ON u.id = m.teacher_id
            WHERE m.request_id = ?
            ORDER BY m.match_score DESC, m.matched_at DESC
            LIMIT 1`,
          [id]
        )
        teacherName = String(topMatchRows[0]?.nickname || '')
      }
    } catch (matchError) {
      console.error('[matching] rerun failed after parent request update:', matchError?.message || matchError)
    }

    await pool.query('UPDATE requests SET status = ?, teacher_name = ? WHERE id = ? AND parent_id = ?', [matchedCount > 0 ? 'matching' : 'pending', teacherName, id, req.user.id])
    ok(res, { id, status: matchedCount > 0 ? 'matching' : 'pending', teacherName: teacherName || '', matchedCount })
  } catch (error) {
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
  try {
    const [rows] = await pool.query('SELECT * FROM reviews WHERE parent_id = ? ORDER BY created_at DESC', [req.user.id])
    ok(
      res,
      rows.map((r) => ({ id: Number(r.id), teacherName: r.teacher_name, subject: r.subject, rating: Number(r.rating || 0), content: r.content || '', reply: r.reply || '', date: toDate(r.created_at) }))
    )
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, [])
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/reviews/:id/reply', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const reply = String(req.body?.reply || '').trim()
  if (!reply) return fail(res, 400, 'reply cannot be empty')
  try {
    const [result] = await pool.query('UPDATE reviews SET reply = ? WHERE id = ? AND parent_id = ?', [reply, id, req.user.id])
    if (!result.affectedRows) return fail(res, 404, 'Review not found')
    ok(res, { id, reply })
  } catch (error) {
    if (isOptionalSchemaError(error)) return fail(res, 404, 'Review module not enabled')
    fail(res, 500, error.message)
  }
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
      if (row.unlock_granted) content = `\u53cc\u65b9\u90fd\u5df2\u63a5\u53d7\uff0c\u5df2\u81ea\u52a8\u5f00\u653e\u4e0e\u8001\u5e08 ${row.teacher_name} \u7684\u8054\u7cfb\u65b9\u5f0f\u3002`
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

// 账单流水
app.get('/api/parent/billing', authRequired('parent'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    )
    ok(res, rows.map((r) => ({
      id: Number(r.id),
      orderNo: r.order_no || '',
      type: r.type || 'other',
      title: r.title || '',
      amount: Number(r.amount || 0),
      status: r.status || 'pending',
      payMethod: r.pay_method || '',
      remark: r.remark || '',
      createdAt: toDate(r.created_at)
    })))
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, [])
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/billing/stats', authRequired('parent'), async (req, res) => {
  try {
    const [totalRows] = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_spent, COUNT(*) AS total_count FROM payment_transactions WHERE user_id = ? AND status IN ('paid','refunded')",
      [req.user.id]
    )
    const [monthRows] = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS month_spent FROM payment_transactions WHERE user_id = ? AND status IN ('paid','refunded') AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())",
      [req.user.id]
    )
    ok(res, {
      totalSpent: Number(totalRows[0]?.total_spent || 0),
      monthSpent: Number(monthRows[0]?.month_spent || 0),
      totalCount: Number(totalRows[0]?.total_count || 0)
    })
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, { totalSpent: 0, monthSpent: 0, totalCount: 0 })
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
  try {
    await pool.query('INSERT INTO teacher_verifications (user_id, cert_type, cert_url, status) VALUES (?, ?, ?, ?)', [req.user.id, certType, certUrl, 'pending'])
    await pool.query('UPDATE teacher_profiles SET verify_status=?, verify_remark=? WHERE user_id=?', ['pending', '', req.user.id])
    ok(res, { submitted: true })
  } catch (error) {
    if (isOptionalSchemaError(error)) return fail(res, 404, 'Verification module not enabled')
    if (String(error?.code || '') === 'ER_DATA_TOO_LONG') return fail(res, 400, '认证文件过大，请压缩后重试')
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/verification/status', authRequired('teacher'), async (req, res) => {
  try {
    const [profileRows] = await pool.query('SELECT verify_status, verified, verify_remark FROM teacher_profiles WHERE user_id=?', [req.user.id])
    const [certRows] = await pool.query('SELECT cert_type, cert_url, status, review_remark, created_at FROM teacher_verifications WHERE user_id=? ORDER BY created_at DESC', [req.user.id])
    ok(res, {
      verifyStatus: profileRows[0]?.verify_status || 'pending',
      verified: !!profileRows[0]?.verified,
      verifyRemark: profileRows[0]?.verify_remark || '',
      certificates: certRows.map((c) => ({ certType: c.cert_type, certUrl: c.cert_url, status: c.status, reviewRemark: c.review_remark, createdAt: toISO(c.created_at) }))
    })
  } catch (error) {
    if (isOptionalSchemaError(error)) {
      return ok(res, {
        verifyStatus: 'pending',
        verified: false,
        verifyRemark: '',
        certificates: []
      })
    }
    fail(res, 500, error.message)
  }
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
  try {
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
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, [])
    fail(res, 500, error.message)
  }
})

app.get('/api/teacher/analytics', authRequired('teacher'), async (req, res) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) return fail(res, 404, 'Teacher not found')
    const [requestRows] = await pool.query('SELECT status, COUNT(*) AS count FROM requests WHERE teacher_name=? GROUP BY status', [user.nickname])
    let reviewRows = [{ total_reviews: 0, average_rating: 0 }]
    try {
      const [rows] = await pool.query('SELECT COUNT(*) AS total_reviews, AVG(rating) AS average_rating FROM reviews WHERE teacher_name=?', [user.nickname])
      reviewRows = rows
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
    }
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
  } catch (error) {
    fail(res, 500, error.message)
  }
})

const mapMatchItem = (row) => ({
  decisionMessage:
    String(row.teacher_accept_status || '') === 'rejected'
      ? '老师已拒绝该需求，联系方式不会解锁。'
      : String(row.parent_accept_status || '') === 'rejected'
        ? '家长已拒绝该需求，联系方式不会解锁。'
        : !!row.unlock_granted
          ? '双方已接受，联系方式已自动解锁。'
          : String(row.teacher_accept_status || '') === 'accepted' || String(row.parent_accept_status || '') === 'accepted'
            ? '已单方接受，待双方确认后自动解锁联系方式。'
            : '请先选择接受或拒绝，双方接受后会自动解锁联系方式。',
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
  parentPhone: row.unlock_granted ? String(row.parent_phone || '') : '',
  parentWechat: row.unlock_granted ? String(row.parent_wechat || '') : '',
  teacherPhone: row.unlock_granted ? String(row.teacher_phone || '') : '',
  teacherWechat: row.unlock_granted ? String(row.teacher_wechat || '') : '',
  teacherCity: String(row.teacher_city || row.user_city || ''),
  teacherIntro: String(row.teacher_intro || row.teacher_bio || ''),
  teacherSubjects: parseArrayField(row.teacher_subjects || ''),
  teacherGrades: parseArrayField(row.teacher_grades || ''),
  teacherExperienceYears: Number(row.teacher_experience_years || 0),
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
  if (!match) return { exists: false, unlockGranted: false, justGranted: false }
  if (!match.unlock_granted && match.parent_accept_status === 'accepted' && match.teacher_accept_status === 'accepted') {
    await pool.query("UPDATE matches SET unlock_granted = 1, status = 'accepted' WHERE id = ?", [matchId])
    return { exists: true, unlockGranted: true, justGranted: true }
  }
  return { exists: true, unlockGranted: !!match.unlock_granted, justGranted: false }
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
              u.nickname AS parent_name, u.city AS parent_city, u.phone AS parent_phone, u.wechat AS parent_wechat
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
      return fail(res, 403, '\u9700\u53cc\u65b9\u90fd\u63a5\u53d7\u9700\u6c42\u540e\u624d\u4f1a\u81ea\u52a8\u5f00\u653e\u8054\u7cfb\u65b9\u5f0f\u3002')
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
  const unlockState = await grantUnlockIfBothAccepted(id)
  ok(res, {
    id,
    accepted: true,
    unlockGranted: unlockState.unlockGranted,
    message: unlockState.unlockGranted ? '双方已接受，联系方式已自动解锁。' : '已接受需求，等待家长确认后自动解锁联系方式。'
  })
})

app.post('/api/teacher/matches/:id/reject', authRequired('teacher'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET teacher_accept_status='rejected', status='rejected' WHERE id = ? AND teacher_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  ok(res, { id, rejected: true, unlockGranted: false, message: '你已拒绝该需求，联系方式不会解锁。' })
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
  try {
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
    let reviewRows = [{ total_reviews: 0, avg_rating: 0 }]
    try {
      const [rows] = await pool.query(
        'SELECT COUNT(*) AS total_reviews, AVG(rating) AS avg_rating FROM reviews WHERE teacher_name = (SELECT nickname FROM users WHERE id = ?)',
        [req.user.id]
      )
      reviewRows = rows
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
    }
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
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/matches', authRequired('parent'), async (req, res) => {
  const status = String(req.query?.status || '').trim()
  try {
    let rows = []
    try {
      const [joinedRows] = await pool.query(
        `SELECT m.*, r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status,
                u.nickname AS teacher_name, u.phone AS teacher_phone, u.wechat AS teacher_wechat, u.city AS user_city, u.bio AS teacher_bio,
                tp.city AS teacher_city, tp.intro AS teacher_intro, tp.subjects AS teacher_subjects, tp.grades AS teacher_grades, tp.experience_years AS teacher_experience_years
           FROM matches m
           JOIN requests r ON r.id = m.request_id
           JOIN users u ON u.id = m.teacher_id
           LEFT JOIN teacher_profiles tp ON tp.user_id = m.teacher_id
          WHERE m.parent_id = ?
          ORDER BY m.matched_at DESC, m.match_score DESC`,
        [req.user.id]
      )
      rows = joinedRows
    } catch (error) {
      if (!isOptionalSchemaError(error)) throw error
      const [basicRows] = await pool.query(
        `SELECT m.*, r.title, r.subject, r.grade, r.budget, r.schedule, r.status AS request_status,
                u.nickname AS teacher_name, u.phone AS teacher_phone, u.wechat AS teacher_wechat, u.city AS user_city, u.bio AS teacher_bio
           FROM matches m
           JOIN requests r ON r.id = m.request_id
           JOIN users u ON u.id = m.teacher_id
          WHERE m.parent_id = ?
          ORDER BY m.matched_at DESC, m.match_score DESC`,
        [req.user.id]
      )
      rows = basicRows
    }
    const filtered = status ? rows.filter((row) => row.status === status) : rows
    ok(
      res,
      filtered.map((row) => ({
        ...mapMatchItem({ ...row, parent_name: '' }),
        teacherName: String(row.teacher_name || '老师')
      }))
    )
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/matches/:id/accept', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET parent_accept_status='accepted', status='accepted' WHERE id = ? AND parent_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  const unlockState = await grantUnlockIfBothAccepted(id)
  ok(res, {
    id,
    accepted: true,
    unlockGranted: unlockState.unlockGranted,
    message: unlockState.unlockGranted ? '双方已接受，联系方式已自动解锁。' : '已接受需求，等待老师确认后自动解锁联系方式。'
  })
})

app.post('/api/parent/matches/:id/reject', authRequired('parent'), async (req, res) => {
  const id = Number(req.params.id)
  const [result] = await pool.query(
    "UPDATE matches SET parent_accept_status='rejected', status='rejected' WHERE id = ? AND parent_id = ?",
    [id, req.user.id]
  )
  if (!result.affectedRows) return fail(res, 404, 'Match not found')
  ok(res, { id, rejected: true, unlockGranted: false, message: '你已拒绝该需求，联系方式不会解锁。' })
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
  const [rows] = await pool.query('SELECT * FROM memberships WHERE user_id=? ORDER BY id DESC LIMIT 1', [req.user.id])
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
         auto_renew=VALUES(auto_renew),
         renew_reminder_sent_at=NULL`,
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
       auto_renew=VALUES(auto_renew),
       renew_reminder_sent_at=NULL`,
    [req.user.id, plan.name, expire, unlock, quota, autoRenew]
  )
  ok(res, { planName: plan.name, expireAt: toDate(expire), remainingUnlock: unlock, weeklyPriorityQuota: quota, autoRenew })
})

app.get('/api/teacher/membership/status', authRequired('teacher'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM memberships WHERE user_id=? ORDER BY id DESC LIMIT 1', [req.user.id])
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
       auto_renew=VALUES(auto_renew),
       renew_reminder_sent_at=NULL`,
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
              ? '\u53cc\u65b9\u5df2\u63a5\u53d7\uff0c\u8054\u7cfb\u65b9\u5f0f\u5df2\u81ea\u52a8\u89e3\u9501\uff0c\u53ef\u76f4\u63a5\u6c9f\u901a\u3002'
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

app.get('/api/parent/invite/summary', authRequired('parent'), async (req, res) => {
  let rows = []
  let latest = []
  try {
    ;[rows] = await pool.query(
      `SELECT
          SUM(CASE WHEN invitee_id IS NOT NULL THEN 1 ELSE 0 END) AS invited_count,
          SUM(CASE WHEN status = 'verified' AND invitee_id IS NOT NULL THEN 1 ELSE 0 END) AS verified_count
         FROM invite_records
        WHERE inviter_id = ? AND role = 'parent'`,
      [req.user.id]
    )
      ;[latest] = await pool.query(
        `SELECT invite_code
         FROM invite_records
        WHERE inviter_id = ? AND role = 'parent'
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
    totalInvited: Number(rows[0]?.invited_count || 0),
    verifiedInvited: verified,
    extraUnlockReward: verified
  })
})

app.post('/api/parent/invite/create', authRequired('parent'), async (req, res) => {
  const inviteCode = `P${req.user.id}${Date.now().toString().slice(-6)}`
  try {
    await pool.query(
      'INSERT INTO invite_records (inviter_id, role, invite_code, status, reward_granted) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, 'parent', inviteCode, 'pending', 0]
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
  try {
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
  } catch (error) {
    if (!isOptionalSchemaError(error)) throw error
    const [rows] = await pool.query(
      `SELECT u.id, u.nickname, u.avatar, u.city AS user_city, u.bio, u.preferred_subjects, u.preferred_grade,
              NULL AS user_id, NULL AS real_name, NULL AS gender, NULL AS city, NULL AS district, NULL AS subjects, NULL AS grades,
              NULL AS experience_years, NULL AS intro, NULL AS verified, NULL AS hourly_price_min, NULL AS hourly_price_max,
              NULL AS teaching_mode, NULL AS available_time_text, NULL AS rating_avg, NULL AS rating_count, 1 AS is_active,
              u.updated_at, m.plan_name
         FROM users u
         LEFT JOIN memberships m ON m.user_id = u.id
        WHERE u.role='teacher'`
    )
    return rows.map(discoverDTO).filter((t) => t.isActive !== false)
  }
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
            u.id AS contact_id, u.nickname AS contact_name, u.role AS contact_role, u.avatar AS contact_avatar
       FROM conversations c
       JOIN users u ON (c.parent_id = u.id OR c.teacher_id = u.id)
      WHERE (c.parent_id = ? OR c.teacher_id = ?) AND u.id != ?
      ORDER BY c.updated_at DESC`,
    [req.user.id, req.user.id, req.user.id]
  )
  ok(
    res,
    rows.map((r) => ({
      id: Number(r.id),
      contactId: Number(r.contact_id),
      contactName: r.contact_name,
      contactRole: r.contact_role,
      contactAvatar: String(r.contact_avatar || ''),
      lastMessage: r.last_message || '',
      updatedAt: toISO(r.updated_at)
    }))
  )
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
    `SELECT m.*, u.avatar AS sender_avatar
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
        AND (c.parent_id = ? OR c.teacher_id = ?)
      ORDER BY m.created_at ASC`,
    [conversationId, req.user.id, req.user.id]
  )
  ok(
    res,
    rows.map((m) => ({
      id: Number(m.id),
      conversationId: Number(m.conversation_id),
      senderId: Number(m.sender_id),
      senderAvatar: String(m.sender_avatar || ''),
      content: m.content,
      isRead: !!m.is_read,
      createdAt: toISO(m.created_at)
    }))
  )
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

app.post('/api/reports/messages/:messageId', authRequired(), async (req, res) => {
  const messageId = Number(req.params.messageId)
  const type = normalizeComplaintType(req.body?.type)
  const content = String(req.body?.content || '').trim()
  const evidence = req.body?.evidence && typeof req.body.evidence === 'object' ? req.body.evidence : {}
  if (!Number.isInteger(messageId) || messageId <= 0) return fail(res, 400, 'Invalid message id')
  if (content.length < 5 || content.length > 500) return fail(res, 400, '举报内容需在 5~500 字')
  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, c.parent_id, c.teacher_id
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.id = ?
        LIMIT 1`,
      [messageId]
    )
    const message = rows[0]
    if (!message) return fail(res, 404, 'Message not found')
    if (Number(message.parent_id) !== req.user.id && Number(message.teacher_id) !== req.user.id) return fail(res, 403, 'Forbidden')
    if (Number(message.sender_id) === req.user.id) return fail(res, 400, '不能举报自己发送的消息')
    const payload = {
      messageId: Number(message.id),
      conversationId: Number(message.conversation_id),
      snippet: String(message.content || '').slice(0, 120),
      ...evidence
    }
    const [result] = await pool.query(
      `INSERT INTO complaints (complainant_id, respondent_id, match_id, type, content, evidence, status)
       VALUES (?, ?, NULL, ?, ?, ?, 'pending')`,
      [req.user.id, Number(message.sender_id), type, content, JSON.stringify(payload)]
    )
    await createAuditLog({
      actorType: 'user',
      actorId: req.user.id,
      action: 'report_message_created',
      targetType: 'complaint',
      targetId: result.insertId,
      details: payload
    })
    ok(res, { reportId: Number(result.insertId), status: 'pending' }, '举报已提交')
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/reports/mine', authRequired(), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.type, c.content, c.status, c.result, c.appeal_status, c.created_at,
              c.evidence, u.nickname AS respondent_name, u.role AS respondent_role
         FROM complaints c
         JOIN users u ON u.id = c.respondent_id
        WHERE c.complainant_id = ?
        ORDER BY c.created_at DESC
        LIMIT 200`,
      [req.user.id]
    )
    ok(
      res,
      rows.map((row) => ({
        id: Number(row.id),
        type: row.type || 'other',
        content: row.content || '',
        status: row.status || 'pending',
        result: row.result || '',
        appealStatus: row.appeal_status || 'none',
        respondentName: row.respondent_name || '',
        respondentRole: row.respondent_role || '',
        evidence: parseObjectField(row.evidence),
        createdAt: toISO(row.created_at)
      }))
    )
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, [])
    fail(res, 500, error.message)
  }
})

app.get('/api/admin/reports/review-queue', adminReviewRequired(), async (req, res) => {
  const status = String(req.query?.status || '').trim()
  const validStatus = new Set(['pending', 'processing', 'resolved', 'rejected'])
  const withStatus = validStatus.has(status)
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.type, c.content, c.status, c.result, c.created_at, c.updated_at, c.evidence,
              cu.nickname AS complainant_name, cu.role AS complainant_role,
              ru.nickname AS respondent_name, ru.role AS respondent_role
         FROM complaints c
         JOIN users cu ON cu.id = c.complainant_id
         JOIN users ru ON ru.id = c.respondent_id
        WHERE (? = 0 OR c.status = ?)
        ORDER BY c.created_at DESC
        LIMIT 300`,
      [withStatus ? 1 : 0, status]
    )
    ok(
      res,
      rows.map((row) => ({
        id: Number(row.id),
        type: row.type || 'other',
        content: row.content || '',
        status: row.status || 'pending',
        result: row.result || '',
        complainantName: row.complainant_name || '',
        complainantRole: row.complainant_role || '',
        respondentName: row.respondent_name || '',
        respondentRole: row.respondent_role || '',
        evidence: parseObjectField(row.evidence),
        createdAt: toISO(row.created_at),
        updatedAt: toISO(row.updated_at)
      }))
    )
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, [])
    fail(res, 500, error.message)
  }
})

app.patch('/api/admin/reports/:id/review', adminReviewRequired(), async (req, res) => {
  const id = Number(req.params.id)
  const nextStatus = String(req.body?.status || '').trim()
  const resultText = String(req.body?.result || '').trim().slice(0, 500)
  const action = String(req.body?.action || 'none').trim()
  const muteHours = Math.max(1, Number(req.body?.muteHours || 24))
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid report id')
  if (!['processing', 'resolved', 'rejected'].includes(nextStatus)) return fail(res, 400, 'Invalid status')
  if (!['none', 'warn', 'mute', 'ban'].includes(action)) return fail(res, 400, 'Invalid action')

  const conn = await pool.getConnection()
  let restrictionId = 0
  let complaint = null
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT id, respondent_id, status FROM complaints WHERE id = ? LIMIT 1 FOR UPDATE', [id])
    complaint = rows[0]
    if (!complaint) {
      await conn.rollback()
      return fail(res, 404, 'Report not found')
    }

    await conn.query(
      `UPDATE complaints
          SET status = ?, result = ?, handled_by = 0, handled_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [nextStatus, resultText, id]
    )

    if (action === 'mute' || action === 'ban') {
      const endAt = action === 'mute' ? new Date(Date.now() + muteHours * 60 * 60 * 1000) : null
      const [insertRestriction] = await conn.query(
        `INSERT INTO user_restrictions (user_id, restriction_type, reason, source_complaint_id, start_at, end_at, is_active)
         VALUES (?, ?, ?, ?, NOW(), ?, TRUE)`,
        [Number(complaint.respondent_id), action, resultText || '管理员处置', id, endAt]
      )
      restrictionId = Number(insertRestriction.insertId || 0)
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    return fail(res, 500, error.message)
  } finally {
    conn.release()
  }

  await createAuditLog({
    actorType: 'admin',
    actorId: req.adminId,
    action: 'complaint_reviewed',
    targetType: 'complaint',
    targetId: id,
    details: { nextStatus, action, muteHours, restrictionId, respondentId: Number(complaint?.respondent_id || 0) }
  })

  ok(res, { reviewed: true, status: nextStatus, action, restrictionId })
})

app.get('/api/admin/restrictions', adminReviewRequired(), async (req, res) => {
  const userId = Number(req.query?.userId || 0)
  const onlyActive = String(req.query?.active || 'true').trim().toLowerCase() !== 'false'
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.user_id, r.restriction_type, r.reason, r.source_complaint_id, r.start_at, r.end_at, r.is_active, r.created_at,
              u.nickname, u.role
         FROM user_restrictions r
         JOIN users u ON u.id = r.user_id
        WHERE (? = 0 OR r.user_id = ?)
          AND (? = 0 OR r.is_active = TRUE)
        ORDER BY r.created_at DESC
        LIMIT 300`,
      [userId > 0 ? 1 : 0, userId, onlyActive ? 1 : 0]
    )
    ok(
      res,
      rows.map((row) => ({
        id: Number(row.id),
        userId: Number(row.user_id),
        nickname: row.nickname || '',
        role: row.role || '',
        restrictionType: row.restriction_type,
        reason: row.reason || '',
        sourceComplaintId: row.source_complaint_id ? Number(row.source_complaint_id) : null,
        isActive: !!row.is_active,
        startAt: toISO(row.start_at),
        endAt: toISO(row.end_at),
        createdAt: toISO(row.created_at)
      }))
    )
  } catch (error) {
    if (isOptionalSchemaError(error)) return ok(res, [])
    fail(res, 500, error.message)
  }
})

app.post('/api/admin/restrictions/:id/release', adminReviewRequired(), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, 'Invalid restriction id')
  try {
    const [result] = await pool.query(
      `UPDATE user_restrictions
          SET is_active = FALSE, end_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [id]
    )
    if (!result.affectedRows) return fail(res, 404, 'Restriction not found')
    await createAuditLog({
      actorType: 'admin',
      actorId: req.adminId,
      action: 'restriction_released',
      targetType: 'user_restriction',
      targetId: id,
      details: {}
    })
    ok(res, { released: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

io.use((socket, next) => {
  ; (async () => {
    const tokenFromAuth = socket.handshake.auth?.token
    const tokenFromHeader = String(socket.handshake.headers?.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    const user = verifyToken(tokenFromAuth || tokenFromHeader)
    if (!user) return next(new Error('Unauthorized'))
    const [settingRows] = await pool.query('SELECT deactivated FROM user_settings WHERE user_id = ? LIMIT 1', [user.id])
    if (settingRows[0]?.deactivated) return next(new Error('Account deactivated'))
    const restrictions = await getActiveRestrictions(user.id)
    if (restrictions.some((item) => item.restriction_type === 'ban')) return next(new Error('Account restricted'))
    socket.user = user
    next()
  })().catch(() => next(new Error('Unauthorized')))
})

io.on('connection', (socket) => {
  const userId = Number(socket.user.id)
  socket.join(`user_${userId}`)
  socket.on('send_message', async (data) => {
    const conversationId = Number(data?.conversationId || 0)
    const content = String(data?.content || '').trim()
    if (!conversationId || !content) return
    if (content.length > MESSAGE_MAX_LENGTH) {
      socket.emit('message_error', { code: 'MESSAGE_TOO_LONG', message: `单条消息不能超过${MESSAGE_MAX_LENGTH}字` })
      return
    }
    if (isMessageRateLimited(userId)) {
      socket.emit('message_error', { code: 'MESSAGE_RATE_LIMITED', message: '发送过于频繁，请稍后再试' })
      return
    }
    const matchedSensitiveWords = findSensitiveWords(content)
    if (matchedSensitiveWords.length > 0) {
      socket.emit('message_error', {
        code: 'MESSAGE_SENSITIVE_BLOCKED',
        message: '消息包含敏感词，请修改后发送',
        matchedWords: matchedSensitiveWords
      })
      return
    }
    const restrictions = await getActiveRestrictions(userId)
    if (restrictions.some((item) => item.restriction_type === 'mute' || item.restriction_type === 'ban')) {
      socket.emit('message_error', { code: 'MESSAGE_RESTRICTED', message: '当前账号被限制发言' })
      return
    }
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
      const [savedRows] = await pool.query(
        `SELECT m.*, u.avatar AS sender_avatar
           FROM messages m
           JOIN users u ON u.id = m.sender_id
          WHERE m.id = ?`,
        [result.insertId]
      )
      const saved = savedRows[0]
      const payload = {
        id: Number(saved.id),
        conversationId: Number(saved.conversation_id),
        senderId: Number(saved.sender_id),
        senderAvatar: String(saved.sender_avatar || ''),
        content: saved.content,
        isRead: !!saved.is_read,
        createdAt: toISO(saved.created_at)
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

setInterval(() => {
  maybeRunScheduledMatching().catch((error) => {
    console.error('[matching] scheduler error:', error?.message || error)
  })
}, 60 * 1000)

setInterval(() => {
  maybeRunRenewReminderJob().catch((error) => {
    console.error('[sms] scheduler error:', error?.message || error)
  })
}, 10 * 60 * 1000)

setInterval(() => {
  maybeRunRetentionJob().catch((error) => {
    console.error('[retention] scheduler error:', error?.message || error)
  })
}, RETENTION_JOB_INTERVAL_MS)

ensureMatchingSchema()
  .catch((error) => {
    console.error('[schema] ensure matching schema failed:', error?.message || error)
  })
  .finally(() => {
    maybeRunRetentionJob().catch((error) => {
      console.error('[retention] initial run failed:', error?.message || error)
    })
    httpServer.listen(PORT, () => {
      console.log(`[api] running at http://localhost:${PORT} (with WebSocket)`)
    })
  })
