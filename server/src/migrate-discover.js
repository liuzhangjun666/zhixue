import pool from './db.js'

const DB_NAME = process.env.DB_NAME || 'zhixue'

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

const hasIndex = async (tableName, indexName) => {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1`,
    [DB_NAME, tableName, indexName]
  )
  return rows.length > 0
}

const ensureColumn = async (tableName, columnName, ddl) => {
  if (await hasColumn(tableName, columnName)) {
    console.log(`[skip] ${tableName}.${columnName} exists`)
    return
  }
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`)
  console.log(`[ok] added ${tableName}.${columnName}`)
}

const ensureIndex = async (tableName, indexName, ddl) => {
  if (await hasIndex(tableName, indexName)) {
    console.log(`[skip] ${tableName}.${indexName} exists`)
    return
  }
  await pool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} ${ddl}`)
  console.log(`[ok] added index ${tableName}.${indexName}`)
}

const seedDiscoverTeachers = async () => {
  const passwordHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
  await pool.query(
    `INSERT INTO users (id, role, nickname, phone, password_hash, city, bio, preferred_grade, preferred_subjects)
     VALUES
       (2, 'teacher', '张老师', '13900139000', ?, '上海', '五年教龄，专注小学数学和英语提分。', '', '["数学","英语"]'),
       (3, 'teacher', '陈老师', '13900139001', ?, '上海', '英语启蒙与自然拼读课程，适合低年级孩子。', '', '["英语"]'),
       (4, 'teacher', '周老师', '13900139002', ?, '杭州', '语文阅读理解、作文表达和学习习惯培养。', '', '["语文"]')
     ON DUPLICATE KEY UPDATE
       role=VALUES(role),
       nickname=VALUES(nickname),
       city=VALUES(city),
       bio=VALUES(bio),
       preferred_subjects=VALUES(preferred_subjects)`,
    [passwordHash, passwordHash, passwordHash]
  )

  await pool.query(
    `INSERT INTO teacher_profiles
      (user_id, real_name, city, district, subjects, grades, experience_years, teaching_style, student_type, areas, intro,
       hourly_price_min, hourly_price_max, teaching_mode, available_time_text, rating_avg, rating_count, is_active, verified, verify_status)
     VALUES
      (2, '张老师', '上海', '浦东新区', '["数学","英语"]', '["三年级","四年级","五年级"]', 5, '结构化讲解+错题复盘', '基础巩固/提分', '["浦东新区","线上"]',
       '五年教龄，专注小学数学和英语提分，擅长把薄弱知识点拆成可执行练习。', 180, 260, 'both', '工作日晚间、周末上午', 4.8, 36, TRUE, TRUE, 'approved'),
      (3, '陈老师', '上海', '徐汇区', '["英语"]', '["一年级","二年级","三年级"]', 4, '自然拼读+口语互动', '英语启蒙', '["徐汇区","线上"]',
       '英语启蒙与自然拼读课程，课堂互动强，适合低年级孩子建立开口信心。', 160, 220, 'both', '周二/周四晚间，周六下午', 4.9, 42, TRUE, TRUE, 'approved'),
      (4, '周老师', '杭州', '西湖区', '["语文"]', '["三年级","四年级","五年级","六年级"]', 7, '阅读方法+表达训练', '阅读写作提升', '["西湖区","线上"]',
       '语文阅读理解、作文表达和学习习惯培养，适合需要系统提升表达能力的学生。', 200, 300, 'online', '周末全天可约', 4.7, 28, TRUE, TRUE, 'approved')
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
       hourly_price_min=VALUES(hourly_price_min),
       hourly_price_max=VALUES(hourly_price_max),
       teaching_mode=VALUES(teaching_mode),
       available_time_text=VALUES(available_time_text),
       rating_avg=VALUES(rating_avg),
       rating_count=VALUES(rating_count),
       is_active=VALUES(is_active),
       verified=VALUES(verified),
       verify_status=VALUES(verify_status)`
  )
  console.log('[ok] discover seed teachers upserted')
}

async function run() {
  try {
    if (!(await tableExists('requests'))) {
      console.log('[warn] table requests not found, skip discover migration')
      return
    }
    if (!(await tableExists('parent_profiles'))) {
      await pool.query(
        `CREATE TABLE parent_profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          city VARCHAR(50) DEFAULT '',
          district VARCHAR(50) DEFAULT '',
          teaching_style_preference VARCHAR(50) DEFAULT '',
          teacher_gender_preference VARCHAR(20) DEFAULT 'any',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_parent_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`
      )
      console.log('[ok] created parent_profiles')
    }
    if (!(await tableExists('teacher_profiles'))) {
      await pool.query(
        `CREATE TABLE teacher_profiles (
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
          hourly_price_min DECIMAL(10,2) DEFAULT NULL,
          hourly_price_max DECIMAL(10,2) DEFAULT NULL,
          teaching_mode ENUM('online','offline','both') NOT NULL DEFAULT 'both',
          available_time_text VARCHAR(255) NOT NULL DEFAULT '',
          rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0,
          rating_count INT NOT NULL DEFAULT 0,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          verified TINYINT(1) NOT NULL DEFAULT 0,
          verify_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          verify_remark VARCHAR(255) NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_teacher_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB`
      )
      console.log('[ok] created teacher_profiles')
    }

    await ensureColumn('requests', 'description', 'description TEXT')
    await ensureColumn('teacher_profiles', 'gender', "gender ENUM('male','female') NOT NULL DEFAULT 'male'")
    await ensureColumn('teacher_profiles', 'hourly_price_min', 'hourly_price_min DECIMAL(10,2) DEFAULT NULL')
    await ensureColumn('teacher_profiles', 'hourly_price_max', 'hourly_price_max DECIMAL(10,2) DEFAULT NULL')
    await ensureColumn(
      'teacher_profiles',
      'teaching_mode',
      "teaching_mode ENUM('online','offline','both') NOT NULL DEFAULT 'both'"
    )
    await ensureColumn('teacher_profiles', 'available_time_text', "available_time_text VARCHAR(255) NOT NULL DEFAULT ''")
    await ensureColumn('teacher_profiles', 'rating_avg', 'rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0')
    await ensureColumn('teacher_profiles', 'rating_count', 'rating_count INT NOT NULL DEFAULT 0')
    await ensureColumn('teacher_profiles', 'is_active', 'is_active TINYINT(1) NOT NULL DEFAULT 1')
    await ensureIndex('teacher_profiles', 'idx_teacher_profiles_city', '(city)')
    await ensureIndex('teacher_profiles', 'idx_teacher_profiles_price', '(hourly_price_min, hourly_price_max)')
    await ensureIndex('teacher_profiles', 'idx_teacher_profiles_rating', '(rating_avg)')
    await ensureIndex('teacher_profiles', 'idx_teacher_profiles_active', '(is_active)')
    await seedDiscoverTeachers()
    console.log('[done] discover migration finished')
  } catch (error) {
    console.error('[error] discover migration failed:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

run()
