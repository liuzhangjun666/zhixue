/**
 * 知学空间 - 老师匹配任务测试数据种子脚本
 *
 * 功能：
 *   1. 插入 6 名已认证老师（覆盖不同科目、城市、费率、风格）
 *   2. 插入 3 名家长用户（含 parent_profiles 偏好）
 *   3. 插入 5 条辅导请求（pending/matching 状态，供匹配引擎使用）
 *   4. 手动触发一次匹配并打印结果
 *   5. （可选）通过 --reset 参数清除本脚本写入的所有测试数据
 *
 * 用法：
 *   node scripts/seed-match-test.js          # 写入测试数据 + 执行匹配
 *   node scripts/seed-match-test.js --reset  # 清除测试数据
 *   node scripts/seed-match-test.js --match-only  # 仅触发匹配（数据已存在时）
 *
 * 依赖：mysql2（项目已有）、bcryptjs（项目已有）
 * 配置：自动读取项目根目录 .env 文件
 */

import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

// ─────────────────────────────────────────────
// 数据库连接
// ─────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zhixue',
  waitForConnections: true,
  connectionLimit: 5,
  timezone: '+08:00'
})

// ─────────────────────────────────────────────
// 测试数据定义
// ─────────────────────────────────────────────

const PASSWORD_HASH = await bcrypt.hash('test123456', 10)

/**
 * 6 名测试老师，覆盖：
 *  - 不同科目（数学、英语、语文、物理、化学）
 *  - 不同城市/区（上海徐汇、上海浦东、北京海淀、广州天河）
 *  - 不同费率（100-150 / 150-200 / 200+）
 *  - 不同教学风格（strict / gentle / flexible / guiding）
 *  - 不同认证状态（approved × 5，pending × 1 用于反向验证）
 */
const TEST_TEACHERS = [
  {
    phone: '15100000101',
    nickname: '测试_王老师',
    city: '上海',
    gender: 'female',
    real_name: '王晓燕',
    district: '徐汇区',
    subjects: ['数学', '物理'],
    grades: ['初一', '初二', '初三'],
    experience_years: 8,
    fee_range: '150_200',
    school: '上海交通大学',
    teaching_style: 'strict',
    verify_status: 'approved'
  },
  {
    phone: '15100000102',
    nickname: '测试_李老师',
    city: '上海',
    gender: 'male',
    real_name: '李建国',
    district: '浦东新区',
    subjects: ['英语'],
    grades: ['小学', '初一', '初二'],
    experience_years: 5,
    fee_range: '100_150',
    school: '华东师范大学',
    teaching_style: 'gentle',
    verify_status: 'approved'
  },
  {
    phone: '15100000103',
    nickname: '测试_陈老师',
    city: '上海',
    gender: 'female',
    real_name: '陈思琪',
    district: '徐汇区',
    subjects: ['语文', '英语'],
    grades: ['四年级', '五年级', '六年级', '小学'],
    experience_years: 3,
    fee_range: '100_150',
    school: '复旦大学',
    teaching_style: 'guiding',
    verify_status: 'approved'
  },
  {
    phone: '15100000104',
    nickname: '测试_赵老师',
    city: '上海',
    gender: 'male',
    real_name: '赵明远',
    district: '浦东新区',
    subjects: ['数学'],
    grades: ['高一', '高二', '高三'],
    experience_years: 12,
    fee_range: 'over_200',
    school: '同济大学',
    teaching_style: 'strict',
    verify_status: 'approved'
  },
  {
    phone: '15100000105',
    nickname: '测试_刘老师',
    city: '北京',
    gender: 'female',
    real_name: '刘梦洁',
    district: '海淀区',
    subjects: ['数学', '物理', '化学'],
    grades: ['高一', '高二', '高三'],
    experience_years: 7,
    fee_range: '150_200',
    school: '北京大学',
    teaching_style: 'flexible',
    verify_status: 'approved'
  },
  {
    phone: '15100000106',
    nickname: '测试_周老师',
    city: '广州',
    gender: 'male',
    real_name: '周子豪',
    district: '天河区',
    subjects: ['英语'],
    grades: ['初一', '初二', '初三'],
    experience_years: 2,
    fee_range: 'under_100',
    school: '中山大学',
    teaching_style: 'guiding',
    // pending 状态 → 不应被匹配到
    verify_status: 'pending'
  }
]

/**
 * 3 名测试家长（含 parent_profiles 偏好）
 */
const TEST_PARENTS = [
  {
    phone: '15200000201',
    nickname: '测试_张爸爸',
    city: '上海',
    // parent_profiles
    district: '徐汇区',
    teaching_style_preference: 'strict',
    teacher_gender_preference: 'female'
  },
  {
    phone: '15200000202',
    nickname: '测试_李妈妈',
    city: '上海',
    district: '浦东新区',
    teaching_style_preference: 'gentle',
    teacher_gender_preference: 'any'
  },
  {
    phone: '15200000203',
    nickname: '测试_王家长',
    city: '北京',
    district: '海淀区',
    teaching_style_preference: 'flexible',
    teacher_gender_preference: 'female'
  }
]

/**
 * 5 条辅导请求（匹配引擎只处理 pending / matching 状态）
 *
 * 设计逻辑（方便验证分数）：
 *  req-1：上海 数学 初二 150-200元  → 应匹配到 王老师(strict)、赵老师(strict)
 *  req-2：上海 英语 小学 100-150元  → 应匹配到 李老师(gentle)、陈老师(guiding)
 *  req-3：上海 语文 五年级 100-150元 → 应匹配到 陈老师(guiding)
 *  req-4：北京 数学 高二 150-200元  → 应匹配到 刘老师(flexible)
 *  req-5：上海 物理 高三 预算很高   → 应匹配到 王老师 / 赵老师（降级场景：区外匹配）
 */
const TEST_REQUESTS_TEMPLATE = [
  {
    title: '【测试】初二数学专项提升',
    subject: '数学',
    grade: '初二',
    budget: '150-200 元/小时',
    schedule: '每周三、周五 19:00-20:30',
    status: 'pending',
    parentIndex: 0 // 张爸爸
  },
  {
    title: '【测试】小学英语启蒙',
    subject: '英语',
    grade: '小学',
    budget: '100-150 元/小时',
    schedule: '每周六 10:00-11:30',
    status: 'pending',
    parentIndex: 1 // 李妈妈
  },
  {
    title: '【测试】五年级语文阅读理解',
    subject: '语文',
    grade: '五年级',
    budget: '100-150 元/小时',
    schedule: '每周一 18:30-20:00',
    status: 'matching',
    parentIndex: 1
  },
  {
    title: '【测试】北京高二数学冲刺',
    subject: '数学',
    grade: '高二',
    budget: '150-200 元/小时',
    schedule: '每周二、周四 19:00-21:00',
    status: 'pending',
    parentIndex: 2 // 王家长（北京）
  },
  {
    title: '【测试】高三物理（降级测试）',
    subject: '物理',
    grade: '高三',
    budget: '200-300 元/小时',
    schedule: '每周末',
    status: 'pending',
    parentIndex: 0 // 张爸爸（上海 → 北京老师 degrade_level=2 场景）
  }
]

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

const log = (msg) => console.log(`[seed] ${msg}`)
const ok = (label, val) => console.log(`  ✅ ${label}:`, val)
const warn = (label, val) => console.warn(`  ⚠️  ${label}:`, val)

const ensureParentProfilesTable = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS parent_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      city VARCHAR(50) DEFAULT '',
      district VARCHAR(50) DEFAULT '',
      teaching_style_preference VARCHAR(50) DEFAULT '',
      teacher_gender_preference VARCHAR(20) DEFAULT 'any',
      CONSTRAINT fk_parent_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `)
}

const getCurrentWeekNumber = () => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), 0, 1)
  const dayOffset = Math.floor((now - firstDay) / (24 * 60 * 60 * 1000))
  return Math.ceil((dayOffset + firstDay.getDay() + 1) / 7)
}

// ─────────────────────────────────────────────
// 匹配引擎（与 server/src/index.js 保持一致）
// ─────────────────────────────────────────────

const parseArrayField = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    }
  }
  return []
}

const parseBudgetRange = (text) => {
  const nums = String(text || '').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite)
  if (!nums?.length) return { min: 0, max: Infinity }
  if (nums.length === 1) return { min: nums[0], max: nums[0] }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

const feeRangeToBudgetRange = (fr) => ({
  under_100: { min: 0, max: 100 },
  '100_150': { min: 100, max: 150 },
  '150_200': { min: 150, max: 200 },
  over_200: { min: 200, max: Infinity }
}[String(fr)] ?? { min: 100, max: 150 })

const hasIntersection = (a, b) => {
  const sa = new Set((a || []).map(String))
  return (b || []).some((x) => sa.has(String(x)))
}

const styleSimilarityScore = (teacherStyle, parentStyle) => {
  const a = String(teacherStyle || '').trim().toLowerCase()
  const b = String(parentStyle || '').trim().toLowerCase()
  if (!a || !b) return 50
  if (a === b) return 100
  const nearby = [['strict','guiding'],['gentle','guiding'],['flexible','guiding']]
  if (nearby.some(([x,y]) => (a===x&&b===y)||(a===y&&b===x))) return 50
  return 0
}

const normalizeCityKeyword = (v) => String(v||'').replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔|自治州|地区|盟/g,'').trim()
const getCityPrefix = (v) => normalizeCityKeyword(v).slice(0,2)

const evaluateCandidate = ({ request, parentProfile, teacherProfile, strictStyle=true, strictCity=true }) => {
  const reqBudget  = parseBudgetRange(request.budget)
  const tchBudget  = feeRangeToBudgetRange(teacherProfile.fee_range)
  const pCity      = String(parentProfile?.city || '')
  const tCity      = String(teacherProfile.city || '')
  const pDistrict  = String(parentProfile?.district || '')
  const tDistrict  = String(teacherProfile.district || '')

  const sameCity     = Boolean(pCity && tCity && pCity === tCity)
  const samePrefect  = Boolean(pCity && tCity && getCityPrefix(pCity) === getCityPrefix(tCity))
  const districtOk   = Boolean(pDistrict && tDistrict && pDistrict === tDistrict)

  const cityMatched  = strictCity ? sameCity : sameCity || samePrefect
  const cityScore    = districtOk ? 100 : cityMatched ? 70 : 0
  const subjectScore = hasIntersection(parseArrayField(teacherProfile.subjects), [request.subject]) ? 100 : 0
  const gradeScore   = hasIntersection(parseArrayField(teacherProfile.grades), [request.grade]) ? 100 : 0
  const rawStyle     = styleSimilarityScore(teacherProfile.teaching_style, parentProfile?.teaching_style_preference)
  const styleScore   = strictStyle ? rawStyle : Math.max(rawStyle, 50)
  const genderPref   = String(parentProfile?.teacher_gender_preference || 'any')
  const genderOk     = genderPref === 'any' || !genderPref || genderPref === teacherProfile.gender
  const genderScore  = genderOk ? 100 : 0
  const budgetOk     = tchBudget.max >= reqBudget.min && tchBudget.min <= reqBudget.max
  const budgetScore  = budgetOk ? 100 : 0

  const score = cityScore*0.25 + subjectScore*0.25 + gradeScore*0.15 + styleScore*0.15 + genderScore*0.1 + budgetScore*0.1

  const tips = []
  if (!budgetOk)  tips.push('预算需协商')
  if (!genderOk)  tips.push('性别不符')

  return { score: Math.round(score*100)/100, tips }
}

const selectCandidates = ({ request, parentProfile, teachers }) => {
  const build = (strictStyle, strictCity, includeZero=false) =>
    teachers
      .map((t) => ({ t, ...evaluateCandidate({ request, parentProfile, teacherProfile: t, strictStyle, strictCity }) }))
      .filter((x) => includeZero ? x.score >= 0 : x.score > 0)
      .sort((a,b) => b.score - a.score)

  const s1 = build(true,  true)
  if (s1.length >= 2) return s1.slice(0,3).map((x) => ({ teacher:x.t, score:x.score, tips:x.tips, degradeLevel:0 }))

  const s2 = build(false, true)
  if (s2.length >= 2) return s2.slice(0,3).map((x) => ({ teacher:x.t, score:x.score, tips:x.tips, degradeLevel:1 }))

  const s3 = build(false, false, true)
  return s3.slice(0,2).map((x) => ({
    teacher: x.t,
    score: x.score,
    tips: [...new Set([...x.tips, '当前区域匹配对象较少'])],
    degradeLevel: 2
  }))
}

// ─────────────────────────────────────────────
// 核心操作
// ─────────────────────────────────────────────

const insertTeachers = async (conn) => {
  const ids = []
  for (const t of TEST_TEACHERS) {
    const [rows] = await conn.query('SELECT id FROM users WHERE phone=? LIMIT 1', [t.phone])
    if (rows.length) {
      ids.push(rows[0].id)
      log(`  老师已存在，跳过插入: ${t.nickname} (id=${rows[0].id})`)
      continue
    }
    const [res] = await conn.query(
      `INSERT INTO users (role,nickname,phone,password_hash,city,bio,preferred_grade,preferred_subjects,wechat)
       VALUES ('teacher',?,?,?,?,'测试老师','',?,'' )`,
      [t.nickname, t.phone, PASSWORD_HASH, t.city, JSON.stringify(t.subjects)]
    )
    const uid = res.insertId
    ids.push(uid)
    await conn.query(
      `INSERT INTO teacher_profiles
       (user_id,real_name,gender,city,district,subjects,grades,experience_years,teaching_methods,fee_range,school,teaching_style,student_type,areas,intro,verified,verify_status,verify_remark)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'','[]','测试老师简介',?,?,'' )`,
      [
        uid, t.real_name, t.gender, t.city, t.district,
        JSON.stringify(t.subjects), JSON.stringify(t.grades),
        t.experience_years, '["讲解","练习"]', t.fee_range,
        t.school, t.teaching_style,
        t.verify_status === 'approved' ? 1 : 0,
        t.verify_status
      ]
    )
    ok(`插入老师`, `${t.nickname} (id=${uid}) verify_status=${t.verify_status}`)
  }
  return ids
}

const insertParents = async (conn) => {
  await ensureParentProfilesTable(conn)
  const ids = []
  for (const p of TEST_PARENTS) {
    const [rows] = await conn.query('SELECT id FROM users WHERE phone=? LIMIT 1', [p.phone])
    let uid
    if (rows.length) {
      uid = rows[0].id
      log(`  家长已存在，跳过插入: ${p.nickname} (id=${uid})`)
    } else {
      const [res] = await conn.query(
        `INSERT INTO users (role,nickname,phone,password_hash,city,bio,preferred_grade,preferred_subjects)
         VALUES ('parent',?,?,?,?,'测试家长','','[]')`,
        [p.nickname, p.phone, PASSWORD_HASH, p.city]
      )
      uid = res.insertId
      ok(`插入家长`, `${p.nickname} (id=${uid})`)
    }
    ids.push(uid)
    // upsert parent_profiles
    await conn.query(
      `INSERT INTO parent_profiles (user_id,city,district,teaching_style_preference,teacher_gender_preference)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE city=VALUES(city),district=VALUES(district),teaching_style_preference=VALUES(teaching_style_preference),teacher_gender_preference=VALUES(teacher_gender_preference)`,
      [uid, p.city, p.district, p.teaching_style_preference, p.teacher_gender_preference]
    )
    ok(`  parent_profiles`, `city=${p.city} district=${p.district} style=${p.teaching_style_preference} gender_pref=${p.teacher_gender_preference}`)
  }
  return ids
}

const insertRequests = async (conn, parentIds) => {
  const ids = []
  for (const r of TEST_REQUESTS_TEMPLATE) {
    const pid = parentIds[r.parentIndex]
    const [res] = await conn.query(
      `INSERT INTO requests (parent_id,title,subject,grade,budget,schedule,status,teacher_name)
       VALUES (?,?,?,?,?,?,?,'')`,
      [pid, r.title, r.subject, r.grade, r.budget, r.schedule, r.status]
    )
    ids.push(res.insertId)
    ok(`插入请求`, `#${res.insertId} "${r.title}" [parent_id=${pid}] status=${r.status}`)
  }
  return ids
}

const runMatching = async (conn, requestIds, parentIds) => {
  log('\n──────────────────────────────────────────')
  log('开始执行匹配...')

  // 加载所有已认证老师的 teacher_profiles
  const [teachers] = await conn.query(
    `SELECT u.id AS user_id, u.city AS user_city, tp.*
     FROM users u
     JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE u.role='teacher' AND COALESCE(tp.verify_status,'pending')='approved'`
  )
  log(`  已认证老师数量: ${teachers.length}`)

  // 加载 parent_profiles
  const [parentRows] = await conn.query(
    `SELECT user_id,city,district,teaching_style_preference,teacher_gender_preference
     FROM parent_profiles`
  )
  const parentProfileMap = parentRows.reduce((m,r) => { m[r.user_id]=r; return m }, {})

  const weekNumber = getCurrentWeekNumber()
  let totalGenerated = 0

  for (const reqId of requestIds) {
    const [[req]] = await conn.query(
      'SELECT id,parent_id,subject,grade,budget FROM requests WHERE id=? LIMIT 1', [reqId]
    )
    if (!req) continue
    const parentProfile = parentProfileMap[req.parent_id] || {}
    const candidates = selectCandidates({ request: req, parentProfile, teachers })

    console.log(`\n  📌 请求 #${req.id} [${req.subject} / ${req.grade} / ${req.budget}]`)
    console.log(`     家长偏好: city=${parentProfile.city||'-'} district=${parentProfile.district||'-'} style=${parentProfile.teaching_style_preference||'-'} gender=${parentProfile.teacher_gender_preference||'-'}`)
    if (!candidates.length) {
      warn(`  无匹配候选`, '跳过')
      continue
    }

    for (const c of candidates) {
      const tch = c.teacher
      console.log(`     → 候选老师: ${tch.real_name || tch.nickname} | 科目:${JSON.stringify(parseArrayField(tch.subjects))} | 年级:${JSON.stringify(parseArrayField(tch.grades))} | 费率:${tch.fee_range} | 风格:${tch.teaching_style} | 城市:${tch.city}/${tch.district}`)
      console.log(`       得分: ${c.score}  degrade_level: ${c.degradeLevel}  tips: [${c.tips.join(', ')}]`)

      await conn.query(
        `INSERT INTO matches
         (teacher_id,parent_id,request_id,match_score,status,parent_accept_status,teacher_accept_status,unlock_granted,feedback_submitted,rematch_count,feedback_reason,degrade_level,match_tips,week_number)
         VALUES (?,?,?,?,'new','pending','pending',0,0,0,'',?,?,?)
         ON DUPLICATE KEY UPDATE
           match_score=VALUES(match_score), status='new', parent_accept_status='pending',
           teacher_accept_status='pending', unlock_granted=0, feedback_submitted=0,
           feedback_reason='', degrade_level=VALUES(degrade_level),
           match_tips=VALUES(match_tips), last_feedback_at=NULL, matched_at=NOW()`,
        [
          Number(tch.user_id), Number(req.parent_id), Number(req.id),
          Number(c.score), Number(c.degradeLevel),
          JSON.stringify(c.tips), weekNumber
        ]
      )
      totalGenerated++
    }
  }

  log(`\n匹配完成，共生成 ${totalGenerated} 条 matches 记录`)
  return totalGenerated
}

const printMatchSummary = async (conn, requestIds) => {
  log('\n──────────────────────────────────────────')
  log('匹配结果汇总：')
  const [rows] = await conn.query(
    `SELECT m.id, m.request_id, m.match_score, m.degrade_level, m.status,
            m.match_tips, r.subject, r.grade, r.budget,
            u_t.nickname AS teacher_nick, tp.real_name,
            u_p.nickname AS parent_nick
     FROM matches m
     JOIN requests r ON r.id=m.request_id
     JOIN users u_t ON u_t.id=m.teacher_id
     JOIN users u_p ON u_p.id=m.parent_id
     LEFT JOIN teacher_profiles tp ON tp.user_id=m.teacher_id
     WHERE m.request_id IN (${requestIds.map(()=>'?').join(',')})
     ORDER BY m.request_id, m.match_score DESC`,
    requestIds
  )

  let lastReqId = null
  for (const r of rows) {
    if (r.request_id !== lastReqId) {
      lastReqId = r.request_id
      console.log(`\n  请求 #${r.request_id}  [${r.subject}/${r.grade}]  家长: ${r.parent_nick}`)
    }
    const tips = (() => { try { return JSON.parse(r.match_tips)||[] } catch { return [] } })()
    console.log(`    match#${r.id}  老师: ${r.real_name||r.teacher_nick}  得分:${r.match_score}  degrade:${r.degrade_level}  tips:[${tips.join(',')}]`)
  }
}

// ─────────────────────────────────────────────
// 清除测试数据
// ─────────────────────────────────────────────

const resetTestData = async (conn) => {
  log('清除测试数据...')

  // 收集测试用户 id
  const allPhones = [...TEST_TEACHERS, ...TEST_PARENTS].map((u) => u.phone)
  if (!allPhones.length) return

  const [users] = await conn.query(
    `SELECT id FROM users WHERE phone IN (${allPhones.map(()=>'?').join(',')})`,
    allPhones
  )
  const userIds = users.map((u) => u.id)
  if (!userIds.length) { log('未找到测试用户，无需清除'); return }

  // 删除测试请求（标题含【测试】）
  const [rResult] = await conn.query(
    `DELETE FROM requests WHERE title LIKE '%【测试】%'`
  )
  ok('删除测试 requests', `${rResult.affectedRows} 条`)

  // 用户级联删除会清理 matches / teacher_profiles / parent_profiles 等
  const [uResult] = await conn.query(
    `DELETE FROM users WHERE id IN (${userIds.map(()=>'?').join(',')})`,
    userIds
  )
  ok('删除测试 users（级联）', `${uResult.affectedRows} 条`)

  log('清除完成')
}

// ─────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────

const args = process.argv.slice(2)
const isReset     = args.includes('--reset')
const isMatchOnly = args.includes('--match-only')

const conn = await pool.getConnection()
try {
  // ── 0. 确保 parent_profiles 表存在 ──
  await ensureParentProfilesTable(conn)

  if (isReset) {
    await resetTestData(conn)
    process.exit(0)
  }

  if (!isMatchOnly) {
    log('=== 插入测试老师 ===')
    await insertTeachers(conn)

    log('\n=== 插入测试家长 ===')
    const parentIds = await insertParents(conn)

    log('\n=== 插入测试辅导请求 ===')
    const requestIds = await insertRequests(conn, parentIds)

    log('\n=== 执行匹配 ===')
    await runMatching(conn, requestIds, parentIds)
    await printMatchSummary(conn, requestIds)
  } else {
    // 仅匹配：找出所有【测试】请求
    log('=== 仅执行匹配（--match-only）===')
    const [reqs] = await conn.query(
      `SELECT id,parent_id FROM requests WHERE title LIKE '%【测试】%' AND status IN ('pending','matching')`
    )
    if (!reqs.length) { warn('找不到待匹配的测试请求', '请先运行不带 --match-only 的脚本'); process.exit(1) }
    const reqIds = reqs.map((r) => r.id)
    const parentIds = [...new Set(reqs.map((r) => r.parent_id))]
    await runMatching(conn, reqIds, parentIds)
    await printMatchSummary(conn, reqIds)
  }

  log('\n✅ 全部完成')
} catch (err) {
  console.error('[seed] 出错：', err.message)
  console.error(err)
  process.exit(1)
} finally {
  conn.release()
  await pool.end()
}
