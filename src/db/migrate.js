/**
 * Applies schema.sql to the database in DATABASE_URL.
 * Safe to re-run: the schema uses IF NOT EXISTS / ON CONFLICT throughout.
 *   node src/db/migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Schema applied successfully.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
