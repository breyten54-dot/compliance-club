import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import request from 'supertest';
import db from '../src/db.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = join(ROOT, '..', 'content', 'templates');

export async function resetDb() {
  // Clear data from all tables that tests touch. UUID tables have no identity
  // sequences to restart, but the command is kept uniform.
  const tables = [
    'member_alert_reads',
    'cpd_records',
    'ai_conversations',
    'payments',
    'compliance_alerts',
    'templates',
    'email_broadcasts',
    'members',
  ];
  for (const table of tables) {
    await db.query(`TRUNCATE TABLE ${table} CASCADE`).catch(() => {});
  }

  // Remove any fixture files left behind by previous download tests.
  try {
    for (const name of readdirSync(TEMPLATES_DIR)) {
      unlinkSync(join(TEMPLATES_DIR, name));
    }
  } catch {
    // Directory may be empty or missing; ignore.
  }
}

export async function createMember(overrides = {}) {
  const password = overrides.password || `pw-${randomUUID().slice(0, 8)}`;
  const hash = await bcrypt.hash(password, 10);
  const email = overrides.email || `test-${randomUUID()}@example.com`;
  const { rows: [member] } = await db.query(
    `INSERT INTO members (email, password_hash, full_name, fsp_licence, phone, province, tier, status, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, email, full_name, fsp_licence, phone, province, tier, status, is_admin`,
    [
      email,
      hash,
      overrides.full_name || 'Test Member',
      overrides.fsp_licence || null,
      overrides.phone || null,
      overrides.province || null,
      overrides.tier || 'foundation',
      overrides.status || 'active',
      overrides.is_admin ? true : false,
    ]
  );
  return { ...member, password };
}

export async function createAdmin(overrides = {}) {
  return createMember({ ...overrides, is_admin: true, tier: overrides.tier || 'elite', status: 'active' });
}

export async function createTemplate(overrides = {}) {
  const fileName = overrides.fileName || `fixture-${randomUUID()}.docx`;
  const content = overrides.content || Buffer.from('fixture template content');
  writeFileSync(join(TEMPLATES_DIR, fileName), content);

  const { rows: [template] } = await db.query(
    `INSERT INTO templates (title, description, category, tier_access, file_url, active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      overrides.title || 'Fixture Template',
      overrides.description || 'For tests only',
      overrides.category || 'General',
      overrides.tier_access || 'foundation',
      `/content/templates/${fileName}`,
      overrides.active !== false,
    ]
  );
  return { ...template, fileName, content };
}

export async function createAlert(overrides = {}) {
  const { rows: [alert] } = await db.query(
    `INSERT INTO compliance_alerts (title, body, summary, severity, category, tier_access, published, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [
      overrides.title || `Alert ${randomUUID()}`,
      overrides.body || 'Alert body for tests.',
      overrides.summary || 'Summary',
      overrides.severity || 'info',
      overrides.category || 'FSCA',
      overrides.tier_access || 'foundation',
      overrides.published !== false,
    ]
  );
  return alert;
}

export async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAgent failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { agent, token: res.body.token, member: res.body.member };
}

export async function adminAgent(app, overrides = {}) {
  const admin = await createAdmin(overrides);
  return loginAgent(app, admin.email, admin.password);
}

export async function memberAgent(app, overrides = {}) {
  const member = await createMember(overrides);
  return loginAgent(app, member.email, member.password);
}
