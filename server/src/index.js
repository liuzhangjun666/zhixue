import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import pool from './db.js'
import bcrypt from 'bcryptjs'

const app = express()
const httpServer = createServer(app)
const PORT = Number(process.env.PORT || 8000)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

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

// 为了演示，假定所有请求都属于 parent (user_id = 1)
const CURRENT_USER_ID = 1

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    ok(res, { status: 'up', db: 'connected', timestamp: new Date().toISOString() })
  } catch (e) {
    fail(res, 500, 'Database connection failed')
  }
})

app.get('/api/parent/profile', async (_req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [CURRENT_USER_ID])
    if (users.length === 0) return fail(res, 404, 'User not found')
    
    const user = users[0]
    const [children] = await pool.query('SELECT * FROM children WHERE parent_id = ?', [CURRENT_USER_ID])
    
    ok(res, {
      parentName: user.nickname,
      phone: user.phone,
      city: user.city,
      bio: user.bio,
      avatar: user.avatar,
      preferredGrade: user.preferred_grade,
      preferredSubjects: user.preferred_subjects || [],
      children: children.map(c => ({
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

app.put('/api/parent/profile', async (req, res) => {
  const payload = req.body || {}
  if (!payload.parentName || !payload.phone) return fail(res, 400, 'parentName 和 phone 必填')

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    
    await conn.query(
      'UPDATE users SET nickname=?, phone=?, city=?, bio=?, preferred_grade=?, preferred_subjects=? WHERE id=?',
      [payload.parentName, payload.phone, payload.city || '', payload.bio || '', payload.preferredGrade || '小学', JSON.stringify(payload.preferredSubjects || []), CURRENT_USER_ID]
    )

    await conn.query('DELETE FROM children WHERE parent_id=?', [CURRENT_USER_ID])
    if (Array.isArray(payload.children) && payload.children.length > 0) {
      const childrenData = payload.children.map(c => [CURRENT_USER_ID, c.name, c.grade || '', c.targetSubject || ''])
      await conn.query('INSERT INTO children (parent_id, name, grade, target_subject) VALUES ?', [childrenData])
    }

    await conn.commit()
    
    // Return updated profile
    const [users] = await conn.query('SELECT * FROM users WHERE id = ?', [CURRENT_USER_ID])
    const [children] = await conn.query('SELECT * FROM children WHERE parent_id = ?', [CURRENT_USER_ID])
    ok(res, {
      parentName: users[0].nickname,
      phone: users[0].phone,
      city: users[0].city,
      bio: users[0].bio,
      avatar: users[0].avatar,
      preferredGrade: users[0].preferred_grade,
      preferredSubjects: users[0].preferred_subjects || [],
      children: children.map(c => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        targetSubject: c.target_subject
      }))
    })
  } catch (error) {
    await conn.rollback()
    fail(res, 500, error.message)
  } finally {
    conn.release()
  }
})

app.post('/api/parent/avatar', async (req, res) => {
  const { avatar } = req.body
  if (!avatar) return fail(res, 400, '缺少头像数据')
  try {
    await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, CURRENT_USER_ID])
    ok(res, { avatar })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/requests', async (_req, res) => {
  try {
    const [requests] = await pool.query('SELECT * FROM requests WHERE parent_id = ? ORDER BY created_at DESC', [CURRENT_USER_ID])
    ok(res, requests.map(r => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      grade: r.grade,
      budget: r.budget,
      schedule: r.schedule,
      status: r.status,
      teacherName: r.teacher_name,
      createdAt: new Date(r.created_at).toISOString().slice(0, 10)
    })))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.patch('/api/parent/requests/:id/status', async (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body?.status || '')
  if (!['pending', 'matching', 'scheduled', 'completed', 'cancelled'].includes(status)) {
    return fail(res, 400, '非法状态值')
  }
  try {
    const [result] = await pool.query('UPDATE requests SET status = ? WHERE id = ? AND parent_id = ?', [status, id, CURRENT_USER_ID])
    if (result.affectedRows === 0) return fail(res, 404, '请求不存在')
    ok(res, { id, status })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/parent/reviews', async (_req, res) => {
  try {
    const [reviews] = await pool.query('SELECT * FROM reviews WHERE parent_id = ? ORDER BY created_at DESC', [CURRENT_USER_ID])
    ok(res, reviews.map(r => ({
      id: r.id,
      teacherName: r.teacher_name,
      subject: r.subject,
      rating: r.rating,
      content: r.content,
      reply: r.reply,
      date: new Date(r.created_at).toISOString().slice(0, 10)
    })))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/reviews/:id/reply', async (req, res) => {
  const id = Number(req.params.id)
  const reply = String(req.body?.reply || '').trim()
  if (!reply) return fail(res, 400, 'reply 不能为空')
  
  try {
    const [result] = await pool.query('UPDATE reviews SET reply = ? WHERE id = ? AND parent_id = ?', [reply, id, CURRENT_USER_ID])
    if (result.affectedRows === 0) return fail(res, 404, '评价不存在')
    ok(res, { id, reply })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/membership/status', async (_req, res) => {
  try {
    const [memberships] = await pool.query('SELECT * FROM memberships WHERE user_id = ?', [CURRENT_USER_ID])
    if (memberships.length === 0) {
      return ok(res, { planName: '普通用户', remainingUnlock: 0, weeklyPriorityQuota: 0 })
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
    ok(res, plans.map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      durationMonth: p.duration_month,
      features: p.features || [],
      recommended: !!p.recommended
    })))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/membership/subscribe', async (req, res) => {
  const planId = String(req.body?.plan_id || '')
  const autoRenew = Boolean(req.body?.auto_renew)
  try {
    const [plans] = await pool.query('SELECT * FROM membership_plans WHERE id = ?', [planId])
    if (plans.length === 0) return fail(res, 404, '套餐不存在')
    const plan = plans[0]

    const expire = new Date()
    expire.setMonth(expire.getMonth() + plan.duration_month)
    const unlock = plan.duration_month * 5
    const quota = plan.id === 'year' ? 8 : plan.id === 'quarter' ? 5 : 3

    await pool.query(
      `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew) 
       VALUES (?, ?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name), expire_at=VALUES(expire_at), remaining_unlock=VALUES(remaining_unlock), weekly_priority_quota=VALUES(weekly_priority_quota), auto_renew=VALUES(auto_renew)`,
      [CURRENT_USER_ID, plan.name, expire, unlock, quota, autoRenew]
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

app.get('/api/parent/settings', async (_req, res) => {
  try {
    const [settings] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [CURRENT_USER_ID])
    if (settings.length === 0) return ok(res, { notifications: {}, privacy: {} })
    ok(res, {
      notifications: settings[0].notifications || {},
      privacy: settings[0].privacy || {}
    })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/password', async (req, res) => {
  const currentPassword = String(req.body?.current_password || '')
  const nextPassword = String(req.body?.new_password || '')
  if (nextPassword.length < 6) return fail(res, 400, '新密码长度至少 6 位')

  try {
    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [CURRENT_USER_ID])
    if (users.length === 0) return fail(res, 404, '用户不存在')
    
    const isMatch = await bcrypt.compare(currentPassword, users[0].password_hash)
    if (!isMatch) return fail(res, 400, '当前密码不正确')

    const hash = await bcrypt.hash(nextPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, CURRENT_USER_ID])
    ok(res, { updated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/notifications', async (req, res) => {
  try {
    const [settings] = await pool.query('SELECT notifications FROM user_settings WHERE user_id = ?', [CURRENT_USER_ID])
    const current = settings.length > 0 && settings[0].notifications ? settings[0].notifications : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    
    await pool.query(
      'INSERT INTO user_settings (user_id, notifications) VALUES (?, ?) ON DUPLICATE KEY UPDATE notifications=VALUES(notifications)',
      [CURRENT_USER_ID, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.put('/api/parent/settings/privacy', async (req, res) => {
  try {
    const [settings] = await pool.query('SELECT privacy FROM user_settings WHERE user_id = ?', [CURRENT_USER_ID])
    const current = settings.length > 0 && settings[0].privacy ? settings[0].privacy : {}
    const nextOpts = { ...current, ...(req.body || {}) }
    
    await pool.query(
      'INSERT INTO user_settings (user_id, privacy) VALUES (?, ?) ON DUPLICATE KEY UPDATE privacy=VALUES(privacy)',
      [CURRENT_USER_ID, JSON.stringify(nextOpts)]
    )
    ok(res, nextOpts)
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/parent/settings/deactivate', async (req, res) => {
  if (req.body?.confirm_text !== '注销账号') return fail(res, 400, '确认文案不匹配')
  try {
    await pool.query(
      'INSERT INTO user_settings (user_id, deactivated) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE deactivated=TRUE',
      [CURRENT_USER_ID]
    )
    ok(res, { deactivated: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

// === Messages API ===
app.get('/api/messages/conversations', async (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : CURRENT_USER_ID
  try {
    const [conversations] = await pool.query(`
      SELECT c.id, c.last_message, c.updated_at, 
             u.id as contact_id, u.nickname as contact_name, u.role as contact_role
      FROM conversations c
      JOIN users u ON (c.parent_id = u.id OR c.teacher_id = u.id)
      WHERE (c.parent_id = ? OR c.teacher_id = ?) AND u.id != ?
      ORDER BY c.updated_at DESC
    `, [userId, userId, userId])
    
    ok(res, conversations.map(c => ({
      id: c.id,
      contactId: c.contact_id,
      contactName: c.contact_name,
      contactRole: c.contact_role,
      lastMessage: c.last_message,
      updatedAt: new Date(c.updated_at).toISOString()
    })))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/messages/unread-count', async (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : CURRENT_USER_ID
  try {
    const [rows] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE (c.parent_id = ? OR c.teacher_id = ?) 
        AND m.sender_id != ? 
        AND m.is_read = FALSE
    `, [userId, userId, userId])
    ok(res, { count: rows[0].count })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.get('/api/messages/:conversationId', async (req, res) => {
  const conversationId = Number(req.params.conversationId)
  try {
    const [messages] = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', 
      [conversationId]
    )
    ok(res, messages.map(m => ({
      id: m.id,
      senderId: m.sender_id,
      content: m.content,
      isRead: m.is_read,
      createdAt: new Date(m.created_at).toISOString()
    })))
  } catch (error) {
    fail(res, 500, error.message)
  }
})

app.post('/api/messages/:conversationId/read', async (req, res) => {
  const conversationId = Number(req.params.conversationId)
  const userId = req.body?.userId ? Number(req.body.userId) : CURRENT_USER_ID
  try {
    await pool.query(`
      UPDATE messages 
      SET is_read = TRUE 
      WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE
    `, [conversationId, userId])
    ok(res, { success: true })
  } catch (error) {
    fail(res, 500, error.message)
  }
})

// === Socket.io Logic ===
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId || CURRENT_USER_ID
  socket.join(`user_${userId}`)

  socket.on('send_message', async (data) => {
    const { conversationId, receiverId, content } = data
    if (!conversationId || !receiverId || !content) return

    try {
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        
        // Insert message
        const [result] = await conn.query(
          'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
          [conversationId, userId, content]
        )
        const messageId = result.insertId

        // Update conversation last_message
        await conn.query(
          'UPDATE conversations SET last_message = ?, updated_at = NOW() WHERE id = ?',
          [content, conversationId]
        )
        
        await conn.commit()

        // Fetch the inserted message
        const [msgs] = await conn.query('SELECT * FROM messages WHERE id = ?', [messageId])
        const savedMessage = msgs[0]

        const messagePayload = {
          id: savedMessage.id,
          conversationId: savedMessage.conversation_id,
          senderId: savedMessage.sender_id,
          content: savedMessage.content,
          isRead: savedMessage.is_read,
          createdAt: new Date(savedMessage.created_at).toISOString()
        }

        // Send to receiver
        io.to(`user_${receiverId}`).emit('receive_message', messagePayload)
        
        // Send back to sender
        socket.emit('message_sent', messagePayload)
      } catch (err) {
        await conn.rollback()
        console.error('Failed to send message:', err)
      } finally {
        conn.release()
      }
    } catch (err) {
      console.error('DB error on send_message:', err)
    }
  })
})

app.use((_req, res) => fail(res, 404, 'Not Found'))

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] running at http://localhost:${PORT} (with WebSocket)`)
})
