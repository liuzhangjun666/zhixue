import pool from '../src/db.js'
import bcrypt from 'bcryptjs'

const SEED_PREFIX = 'MATCH_TEST'
const DEFAULT_PASSWORD = '123456'

const teacherSeeds = [
  {
    phone: '19970010001',
    nickname: `${SEED_PREFIX}_Teacher_A`,
    city: '上海',
    profile: {
      realName: '测试老师A',
      gender: 'male',
      city: '上海',
      district: '浦东新区',
      subjects: ['数学', '英语'],
      grades: ['三年级', '四年级', '五年级'],
      experienceYears: 6,
      teachingStyle: 'guiding',
      studentType: '基础提升',
      areas: ['浦东新区', '线上'],
      feeRange: '150_200',
      hourlyPriceMin: 160,
      hourlyPriceMax: 220,
      teachingMode: 'both',
      availableTimeText: '工作日晚间、周末上午',
      ratingAvg: 4.8,
      ratingCount: 36,
      isActive: 1,
      verified: 1,
      verifyStatus: 'approved'
    }
  },
  {
    phone: '19970010002',
    nickname: `${SEED_PREFIX}_Teacher_B`,
    city: '上海',
    profile: {
      realName: '测试老师B',
      gender: 'female',
      city: '上海',
      district: '徐汇区',
      subjects: ['数学', '英语'],
      grades: ['三年级', '四年级'],
      experienceYears: 4,
      teachingStyle: 'strict',
      studentType: '习惯养成',
      areas: ['徐汇区', '线上'],
      feeRange: '100_150',
      hourlyPriceMin: 120,
      hourlyPriceMax: 170,
      teachingMode: 'both',
      availableTimeText: '周二周四晚间',
      ratingAvg: 4.6,
      ratingCount: 21,
      isActive: 1,
      verified: 1,
      verifyStatus: 'approved'
    }
  },
  {
    phone: '19970010003',
    nickname: `${SEED_PREFIX}_Teacher_C`,
    city: '杭州',
    profile: {
      realName: '测试老师C',
      gender: 'male',
      city: '杭州',
      district: '西湖区',
      subjects: ['语文'],
      grades: ['五年级', '六年级'],
      experienceYears: 8,
      teachingStyle: 'flexible',
      studentType: '阅读写作',
      areas: ['西湖区', '线上'],
      feeRange: 'over_200',
      hourlyPriceMin: 240,
      hourlyPriceMax: 320,
      teachingMode: 'online',
      availableTimeText: '周末全天',
      ratingAvg: 4.9,
      ratingCount: 40,
      isActive: 1,
      verified: 1,
      verifyStatus: 'approved'
    }
  },
  {
    phone: '19970010004',
    nickname: `${SEED_PREFIX}_Teacher_D_Inactive`,
    city: '上海',
    profile: {
      realName: '测试老师D',
      gender: 'female',
      city: '上海',
      district: '闵行区',
      subjects: ['英语'],
      grades: ['三年级'],
      experienceYears: 3,
      teachingStyle: 'gentle',
      studentType: '启蒙',
      areas: ['闵行区'],
      feeRange: '150_200',
      hourlyPriceMin: 150,
      hourlyPriceMax: 200,
      teachingMode: 'offline',
      availableTimeText: '工作日晚间',
      ratingAvg: 4.5,
      ratingCount: 12,
      isActive: 0,
      verified: 1,
      verifyStatus: 'approved'
    }
  },
  {
    phone: '19970010005',
    nickname: `${SEED_PREFIX}_Teacher_E_Pending`,
    city: '上海',
    profile: {
      realName: '测试老师E',
      gender: 'male',
      city: '上海',
      district: '杨浦区',
      subjects: ['数学'],
      grades: ['四年级'],
      experienceYears: 5,
      teachingStyle: 'guiding',
      studentType: '提升',
      areas: ['杨浦区'],
      feeRange: '100_150',
      hourlyPriceMin: 120,
      hourlyPriceMax: 160,
      teachingMode: 'both',
      availableTimeText: '周末上午',
      ratingAvg: 4.4,
      ratingCount: 16,
      isActive: 1,
      verified: 0,
      verifyStatus: 'pending'
    }
  }
]

const parentSeeds = [
  {
    phone: '19970020001',
    nickname: `${SEED_PREFIX}_Parent_A`,
    city: '上海',
    profile: {
      city: '上海',
      district: '浦东新区',
      teachingStylePreference: 'guiding',
      teacherGenderPreference: 'any'
    },
    requests: [
      {
        title: `${SEED_PREFIX} 上海四年级数学提升`,
        subject: '数学',
        grade: '四年级',
        budget: '170-220 元/小时',
        schedule: '周二/周四 19:00-20:30',
        status: 'pending'
      }
    ]
  },
  {
    phone: '19970020002',
    nickname: `${SEED_PREFIX}_Parent_B`,
    city: '上海',
    profile: {
      city: '上海',
      district: '闵行区',
      teachingStylePreference: 'strict',
      teacherGenderPreference: 'female'
    },
    requests: [
      {
        title: `${SEED_PREFIX} 上海三年级英语启蒙`,
        subject: '英语',
        grade: '三年级',
        budget: '120-170 元/小时',
        schedule: '周六 10:00-11:30',
        status: 'matching'
      }
    ]
  },
  {
    phone: '19970020003',
    nickname: `${SEED_PREFIX}_Parent_C`,
    city: '南京',
    profile: {
      city: '南京',
      district: '鼓楼区',
      teachingStylePreference: 'flexible',
      teacherGenderPreference: 'male'
    },
    requests: [
      {
        title: `${SEED_PREFIX} 跨城六年级语文阅读`,
        subject: '语文',
        grade: '六年级',
        budget: '260-320 元/小时',
        schedule: '周日 14:00-16:00',
        status: 'pending'
      }
    ]
  }
]

const json = (value) => JSON.stringify(value)

const getTableColumns = async (conn, tableName) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  )
  return new Set(rows.map((row) => String(row.COLUMN_NAME || '')))
}

const buildUpsertSql = (tableName, data, uniqueKeys = []) => {
  const columns = Object.keys(data)
  if (!columns.length) throw new Error(`no columns for ${tableName}`)
  const placeholders = columns.map(() => '?').join(', ')
  const updateColumns = columns.filter((col) => !uniqueKeys.includes(col))
  const updateClause = updateColumns.length
    ? updateColumns.map((col) => `${col} = VALUES(${col})`).join(', ')
    : `${columns[0]} = VALUES(${columns[0]})`
  return {
    sql: `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`,
    values: columns.map((col) => data[col])
  }
}

const getUserIdByPhone = async (conn, phone) => {
  const [rows] = await conn.query('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone])
  return Number(rows[0]?.id || 0)
}

const ensureUser = async (conn, { role, nickname, phone, city }, passwordHash) => {
  await conn.query(
    `INSERT INTO users (role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
     VALUES (?, ?, ?, ?, ?, ?, '', ?)
     ON DUPLICATE KEY UPDATE
       role = VALUES(role),
       nickname = VALUES(nickname),
       city = VALUES(city),
       bio = VALUES(bio),
       preferred_subjects = VALUES(preferred_subjects)`,
    [role, nickname, phone, passwordHash, city || '', `${SEED_PREFIX} seeded user`, json([])]
  )
  const id = await getUserIdByPhone(conn, phone)
  if (!id) throw new Error(`failed to resolve user id for phone=${phone}`)
  return id
}

const ensureTeacherProfile = async (conn, teacherProfileColumns, userId, profile) => {
  const data = {}
  const trySet = (column, value) => {
    if (teacherProfileColumns.has(column)) data[column] = value
  }

  trySet('user_id', userId)
  trySet('real_name', profile.realName)
  trySet('gender', profile.gender)
  trySet('city', profile.city)
  trySet('district', profile.district)
  trySet('subjects', json(profile.subjects))
  trySet('grades', json(profile.grades))
  trySet('experience_years', profile.experienceYears)
  trySet('fee_range', profile.feeRange)
  trySet('teaching_style', profile.teachingStyle)
  trySet('student_type', profile.studentType)
  trySet('areas', json(profile.areas))
  trySet('intro', `${SEED_PREFIX} seeded teacher profile`)
  trySet('hourly_price_min', profile.hourlyPriceMin)
  trySet('hourly_price_max', profile.hourlyPriceMax)
  trySet('teaching_mode', profile.teachingMode)
  trySet('available_time_text', profile.availableTimeText)
  trySet('rating_avg', profile.ratingAvg)
  trySet('rating_count', profile.ratingCount)
  trySet('is_active', profile.isActive)
  trySet('verified', profile.verified)
  trySet('verify_status', profile.verifyStatus)

  if (!('user_id' in data)) {
    throw new Error('teacher_profiles.user_id is required but missing from current schema')
  }
  const query = buildUpsertSql('teacher_profiles', data, ['user_id'])
  await conn.query(query.sql, query.values)
}

const ensureParentProfile = async (conn, parentProfileColumns, userId, profile) => {
  const data = {}
  const trySet = (column, value) => {
    if (parentProfileColumns.has(column)) data[column] = value
  }
  trySet('user_id', userId)
  trySet('city', profile.city)
  trySet('district', profile.district)
  trySet('teaching_style_preference', profile.teachingStylePreference)
  trySet('teacher_gender_preference', profile.teacherGenderPreference)
  if (!('user_id' in data)) {
    throw new Error('parent_profiles.user_id is required but missing from current schema')
  }
  const query = buildUpsertSql('parent_profiles', data, ['user_id'])
  await conn.query(query.sql, query.values)
}

const ensureParentMembership = async (conn, userId) => {
  await conn.query(
    `INSERT INTO memberships (user_id, plan_name, expire_at, remaining_unlock, weekly_priority_quota, auto_renew)
     VALUES (?, '体验用户', NULL, 3, 0, FALSE)
     ON DUPLICATE KEY UPDATE
       plan_name = VALUES(plan_name)`,
    [userId]
  )
}

const deleteOldSeedRequests = async (conn, parentIds) => {
  let deletedRequests = 0
  let deletedMatches = 0
  for (const parentId of parentIds) {
    const [rows] = await conn.query('SELECT id FROM requests WHERE parent_id = ? AND title LIKE ?', [parentId, `${SEED_PREFIX}%`])
    const requestIds = rows.map((row) => Number(row.id)).filter(Boolean)
    if (!requestIds.length) continue
    const placeholders = requestIds.map(() => '?').join(',')
    const [delMatchResult] = await conn.query(`DELETE FROM matches WHERE request_id IN (${placeholders})`, requestIds)
    const [delRequestResult] = await conn.query(`DELETE FROM requests WHERE id IN (${placeholders})`, requestIds)
    deletedMatches += Number(delMatchResult?.affectedRows || 0)
    deletedRequests += Number(delRequestResult?.affectedRows || 0)
  }
  return { deletedRequests, deletedMatches }
}

const createSeedRequests = async (conn, requestColumns, parentUserId, requests) => {
  const inserted = []
  for (const req of requests) {
    const data = {}
    if (requestColumns.has('parent_id')) data.parent_id = parentUserId
    if (requestColumns.has('title')) data.title = req.title
    if (requestColumns.has('subject')) data.subject = req.subject
    if (requestColumns.has('grade')) data.grade = req.grade
    if (requestColumns.has('budget')) data.budget = req.budget
    if (requestColumns.has('schedule')) data.schedule = req.schedule
    if (requestColumns.has('description')) data.description = `${SEED_PREFIX} seeded request`
    if (requestColumns.has('status')) data.status = req.status
    if (requestColumns.has('teacher_name')) data.teacher_name = ''
    const columns = Object.keys(data)
    const placeholders = columns.map(() => '?').join(', ')
    const [result] = await conn.query(
      `INSERT INTO requests (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map((col) => data[col])
    )
    inserted.push(Number(result.insertId))
  }
  return inserted
}

const run = async () => {
  const conn = await pool.getConnection()
  try {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
    const teacherProfileColumns = await getTableColumns(conn, 'teacher_profiles')
    const parentProfileColumns = await getTableColumns(conn, 'parent_profiles')
    const requestColumns = await getTableColumns(conn, 'requests')
    if (!teacherProfileColumns.size) throw new Error('table teacher_profiles not found, please run schema init/migration first')
    if (!parentProfileColumns.size) throw new Error('table parent_profiles not found, please run schema init/migration first')
    if (!requestColumns.size) throw new Error('table requests not found, please run schema init/migration first')

    await conn.beginTransaction()

    const teacherIds = []
    for (const seed of teacherSeeds) {
      const userId = await ensureUser(conn, {
        role: 'teacher',
        nickname: seed.nickname,
        phone: seed.phone,
        city: seed.city
      }, passwordHash)
      teacherIds.push(userId)
      await ensureTeacherProfile(conn, teacherProfileColumns, userId, seed.profile)
    }

    const parentIds = []
    const parentRequestPlan = []
    for (const seed of parentSeeds) {
      const userId = await ensureUser(conn, {
        role: 'parent',
        nickname: seed.nickname,
        phone: seed.phone,
        city: seed.city
      }, passwordHash)
      parentIds.push(userId)
      await ensureParentProfile(conn, parentProfileColumns, userId, seed.profile)
      await ensureParentMembership(conn, userId)
      parentRequestPlan.push({ userId, requests: seed.requests })
    }

    const cleanup = await deleteOldSeedRequests(conn, parentIds)
    const requestIds = []
    for (const item of parentRequestPlan) {
      const ids = await createSeedRequests(conn, requestColumns, item.userId, item.requests)
      requestIds.push(...ids)
    }

    await conn.commit()

    console.log(`[seed-matching] done`)
    console.log(`[seed-matching] teachers=${teacherIds.length}, parents=${parentIds.length}, requests=${requestIds.length}`)
    console.log(`[seed-matching] cleaned requests=${cleanup.deletedRequests}, cleaned matches=${cleanup.deletedMatches}`)
    console.log(`[seed-matching] requestIds=${requestIds.join(',')}`)
    console.log(`[seed-matching] next step: call POST /api/matching/run-weekly or open GET /api/teacher/matches`)
  } catch (error) {
    await conn.rollback()
    console.error('[seed-matching] failed:', error?.message || error)
    process.exitCode = 1
  } finally {
    conn.release()
    await pool.end().catch(() => {})
  }
}

run()
