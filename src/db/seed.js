/**
 * Seeds the admin account with a real password hash.
 * Run ONCE after applying schema.sql:
 *   node src/db/seed.js
 *
 * Then CHANGE the password via /portal/settings.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../db');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'berkeley@praeto.co.za';
const ADMIN_PASSWORD = 'Admin@Praeto2026'; // Change immediately after first login

async function seed() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const { rowCount } = await db.query(
    `UPDATE members SET password_hash = $1 WHERE email = $2`,
    [hash, ADMIN_EMAIL]
  );

  if (rowCount === 0) {
    await db.query(
      `INSERT INTO members (email, password_hash, full_name, fsp_licence, tier, status, is_admin)
       VALUES ($1, $2, 'Berkeley Pretorius', '1457', 'elite', 'active', TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_admin = TRUE`,
      [ADMIN_EMAIL, hash]
    );
    console.log('Admin account created:', ADMIN_EMAIL);
  } else {
    console.log('Admin password updated for:', ADMIN_EMAIL);
  }

  console.log('Temporary password:', ADMIN_PASSWORD);
  console.log('IMPORTANT: Log in and change your password immediately.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
