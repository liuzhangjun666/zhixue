import pool from '../src/db.js'
import { runRetentionJobs } from '../src/retention.js'

async function main() {
  try {
    const result = await runRetentionJobs(pool)
    console.log('[retention] done:', JSON.stringify(result))
  } catch (error) {
    console.error('[retention] failed:', error?.message || error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
