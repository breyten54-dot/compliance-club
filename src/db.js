const { Pool } = require('pg');
const config = require('./config');

// In serverless environments like Vercel, modules may be reused across invocations.
// Cache the pool on globalThis to avoid creating new pools on every request.
const globalPool = globalThis.__praeto_pg_pool__;

const pool = globalPool || new Pool({
  connectionString: config.db.connectionString,
  ssl: config.isProd ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

if (!globalPool) {
  globalThis.__praeto_pg_pool__ = pool;
}

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
