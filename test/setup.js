import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.test') });

// Force test-only environment values when they are not already provided.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
process.env.PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE || 'test-passphrase';

// Make sure the local DB is reachable before any tests run.
const db = (await import('../src/db.js')).default;

try {
  await db.query('SELECT 1');
} catch (err) {
  console.error('\nTest database is not reachable.');
  console.error('Please copy .env.test.example to .env.test and update DATABASE_URL.');
  console.error('Original error:', err.message);
  process.exit(1);
}

// Apply the schema (idempotent).
const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');
await db.query(schemaSql);

// Ensure the fixture directory for template downloads exists.
const templatesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'templates');
if (!existsSync(templatesDir)) {
  mkdirSync(templatesDir, { recursive: true });
}
