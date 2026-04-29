import mysql from 'mysql2/promise'

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || 'zx456852'
const DB_NAME = process.env.DB_NAME || 'zhixue'

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 3,
  charset: 'utf8mb4'
})

const hasColumn = async (tableName, columnName) => {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [DB_NAME, tableName, columnName]
  )
  return rows.length > 0
}

const ensureColumn = async (tableName, columnName, ddl) => {
  const exists = await hasColumn(tableName, columnName)
  if (exists) {
    console.log(`[skip] ${tableName}.${columnName} exists`)
    return
  }
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`)
  console.log(`[ok] added ${tableName}.${columnName}`)
}

const ensureComplaintsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INT AUTO_INCREMENT PRIMARY KEY,
      complainant_id INT NOT NULL,
      respondent_id INT NOT NULL,
      match_id INT DEFAULT NULL,
      type ENUM('fake_info','harassment','service_issue','other') NOT NULL DEFAULT 'other',
      content TEXT NOT NULL,
      evidence JSON,
      status ENUM('pending','processing','resolved','rejected') NOT NULL DEFAULT 'pending',
      result TEXT,
      appeal_content TEXT,
      appealed_at DATETIME DEFAULT NULL,
      appeal_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
      handled_by INT DEFAULT NULL,
      handled_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_complaints_respondent (respondent_id, status, created_at)
    ) ENGINE=InnoDB;
  `)
}

const ensureInviteRecordsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invite_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inviter_id INT NOT NULL,
      invitee_id INT DEFAULT NULL,
      role ENUM('teacher','parent') NOT NULL,
      invite_code VARCHAR(32) NOT NULL,
      status ENUM('pending','verified') NOT NULL DEFAULT 'pending',
      reward_granted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inviter_role_status(inviter_id, role, status),
      UNIQUE KEY uk_inviter_code(inviter_id, invite_code)
    ) ENGINE=InnoDB;
  `)
}

const tableExists = async (tableName) => {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      LIMIT 1`,
    [DB_NAME, tableName]
  )
  return rows.length > 0
}

async function run() {
  try {
    const usersExists = await tableExists('users')
    if (!usersExists) {
      console.log('[warn] table users not found, skip compatibility migration')
      return
    }

    await ensureColumn('users', 'phone', "phone VARCHAR(20) NULL")
    await ensureColumn('users', 'password_hash', "password_hash VARCHAR(255) NOT NULL DEFAULT ''")
    await ensureColumn('users', 'role', "role ENUM('parent','teacher') NOT NULL DEFAULT 'parent'")
    await ensureColumn('users', 'nickname', "nickname VARCHAR(50) NOT NULL DEFAULT ''")
    await ensureColumn('users', 'avatar', 'avatar LONGTEXT')
    await ensureColumn('users', 'wechat', "wechat VARCHAR(50) NOT NULL DEFAULT ''")
    await ensureColumn('users', 'created_at', 'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ensureColumn('users', 'updated_at', 'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

    const teacherProfilesExists = await tableExists('teacher_profiles')
    if (teacherProfilesExists) {
      await ensureColumn('teacher_profiles', 'gender', "gender ENUM('male','female') NOT NULL DEFAULT 'male'")
      await ensureColumn('teacher_profiles', 'teaching_methods', 'teaching_methods JSON')
      await ensureColumn(
        'teacher_profiles',
        'fee_range',
        "fee_range ENUM('under_100','100_150','150_200','over_200') NOT NULL DEFAULT '100_150'"
      )
      await ensureColumn('teacher_profiles', 'school', "school VARCHAR(100) NOT NULL DEFAULT ''")
    }

    const matchesExists = await tableExists('matches')
    if (matchesExists) {
      await ensureColumn(
        'matches',
        'parent_accept_status',
        "parent_accept_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending'"
      )
      await ensureColumn(
        'matches',
        'teacher_accept_status',
        "teacher_accept_status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending'"
      )
      await ensureColumn('matches', 'unlock_granted', 'unlock_granted TINYINT(1) NOT NULL DEFAULT 0')
      await ensureColumn('matches', 'feedback_submitted', 'feedback_submitted TINYINT(1) NOT NULL DEFAULT 0')
      await ensureColumn('matches', 'rematch_count', 'rematch_count TINYINT UNSIGNED NOT NULL DEFAULT 0')
      await ensureColumn('matches', 'feedback_reason', "feedback_reason VARCHAR(255) NOT NULL DEFAULT ''")
      await ensureColumn('matches', 'degrade_level', 'degrade_level TINYINT UNSIGNED NOT NULL DEFAULT 0')
      await ensureColumn('matches', 'match_tips', 'match_tips JSON')
      await ensureColumn('matches', 'last_feedback_at', 'last_feedback_at DATETIME NULL')
    }

    const reviewsExists = await tableExists('reviews')
    if (reviewsExists) {
      await ensureColumn('reviews', 'match_id', 'match_id INT NULL')
      await ensureColumn('reviews', 'reviewer_id', 'reviewer_id INT NULL')
      await ensureColumn('reviews', 'reviewee_id', 'reviewee_id INT NULL')
      await ensureColumn('reviews', 'integrity_rating', 'integrity_rating TINYINT UNSIGNED DEFAULT 5')
      await ensureColumn('reviews', 'responsibility_rating', 'responsibility_rating TINYINT UNSIGNED DEFAULT 5')
    }

    await ensureComplaintsTable()
    await ensureColumn('complaints', 'appeal_content', 'appeal_content TEXT')
    await ensureColumn('complaints', 'appealed_at', 'appealed_at DATETIME NULL')
    await ensureColumn(
      'complaints',
      'appeal_status',
      "appeal_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none'"
    )
    await ensureInviteRecordsTable()

    console.log('[done] compatibility migration finished')
  } catch (error) {
    console.error('[error] compatibility migration failed:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

run()
