import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import './load-env.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const schemaPath = path.resolve(__dirname, 'schema.sql')

async function initDB() {
  // Connect WITHOUT specifying a database so we can create it
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
    multipleStatements: true
  })

  try {
    const schema = await fs.readFile(schemaPath, 'utf-8')
    console.log('正在执行初始化 SQL...')
    // mysql2 with multipleStatements: true allows executing the entire file at once
    await pool.query(schema)
    console.log('数据库初始化并注入种子数据成功！')
  } catch (error) {
    console.error('初始化数据库失败:', error)
  } finally {
    await pool.end()
    process.exit(0)
  }
}

initDB()
