import pool from './server/src/db.js';
async function alter() {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN avatar LONGTEXT');
    console.log('Column added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists');
    } else {
      console.error(e);
    }
  }
  process.exit(0);
}
alter();
