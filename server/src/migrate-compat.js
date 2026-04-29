import mysql from 'mysql2/promise'

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || '123456'
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
    await ensureColumn('users', 'created_at', 'created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP')
    await ensureColumn('users', 'updated_at', 'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

    console.log('[done] compatibility migration finished')
  } catch (error) {
    console.error('[error] compatibility migration failed:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

run()
