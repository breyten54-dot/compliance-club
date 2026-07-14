/**
 * Seeds the Launch Content Pack into the three content tables.
 * Idempotent: upserts by title (re-running refreshes content, never duplicates).
 *
 *   node src/db/seed-content.js
 *
 * Source JSONs (from Praeto_Compliance_Club_Launch_Content_Pack) live in
 * ./content/ ; the 30 template files live in ../content/templates/ and are
 * served by the gated /portal/templates/download/:file route.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../db');

const CONTENT = path.join(__dirname, 'content');
const read = (f) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8'));
const lc = (t) => String(t || '').toLowerCase();

// Curated severities for the launch alert set (deadline/action items = warning).
const ALERT_SEVERITY = {
  'ALR-003': 'warning', 'ALR-005': 'warning', 'ALR-006': 'warning',
  'ALR-007': 'warning', 'ALR-008': 'warning',
};

async function existsByTitle(table, title) {
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE title = $1 LIMIT 1`, [title]);
  return rows[0]?.id || null;
}

async function seedTemplates() {
  const items = read('templates.seed.json');
  let ins = 0, upd = 0;
  for (const t of items) {
    const tier = lc(t.tier);
    const fileUrl = `/portal/templates/download/${t.file}`;
    const isReg = t.format === 'xlsx';
    const description = t.description && t.description.trim()
      ? t.description
      : (isReg
          ? `${t.category} register/checklist — maintain per your compliance calendar.`
          : `Ready-to-adopt ${t.category} template. Complete the [PLACEHOLDER] fields and adopt via the sign-off block.`);
    const id = await existsByTitle('templates', t.title);
    if (id) {
      await db.query(
        `UPDATE templates SET description=$1, category=$2, tier_access=$3, file_url=$4, active=TRUE, updated_at=NOW() WHERE id=$5`,
        [description, t.category, tier, fileUrl, id]);
      upd++;
    } else {
      await db.query(
        `INSERT INTO templates (title, description, category, tier_access, file_url, active) VALUES ($1,$2,$3,$4,$5,TRUE)`,
        [t.title, description, t.category, tier, fileUrl]);
      ins++;
    }
  }
  console.log(`templates: ${ins} inserted, ${upd} updated (${items.length} total)`);
}

async function seedCpd() {
  const items = read('cpd_modules.seed.json');
  let ins = 0, upd = 0, i = 0;
  for (const m of items) {
    const tier = lc(m.tier);
    const description = (m.status === 'live'
      ? `${m.cpd_hours} ${m.verifiable_cpd ? 'verifiable ' : ''}CPD hour${m.cpd_hours === 1 ? '' : 's'}.`
      : `${m.cpd_hours} ${m.verifiable_cpd ? 'verifiable ' : 'non-verifiable '}CPD hour${m.cpd_hours === 1 ? '' : 's'}. Recorded material coming soon.`).trim();
    const id = await existsByTitle('cpd_modules', m.title);
    if (id) {
      await db.query(
        `UPDATE cpd_modules SET description=$1, hours=$2, tier_access=$3, active=TRUE, sort_order=$4 WHERE id=$5`,
        [description, m.cpd_hours, tier, i, id]);
      upd++;
    } else {
      await db.query(
        `INSERT INTO cpd_modules (title, description, hours, tier_access, active, sort_order) VALUES ($1,$2,$3,$4,TRUE,$5)`,
        [m.title, description, m.cpd_hours, tier, i]);
      ins++;
    }
    i++;
  }
  console.log(`cpd_modules: ${ins} inserted, ${upd} updated (${items.length} total)`);
}

async function seedAlerts() {
  const items = read('compliance_alerts.seed.json');
  let ins = 0, upd = 0;
  for (const a of items) {
    const severity = ALERT_SEVERITY[a.id] || 'info';
    const id = await existsByTitle('compliance_alerts', a.title);
    if (id) {
      await db.query(
        `UPDATE compliance_alerts SET body=$1, summary=$2, severity=$3, category=$4, tier_access='foundation', published=TRUE, published_at=$5 WHERE id=$6`,
        [a.body, a.summary, severity, a.category, a.published_date, id]);
      upd++;
    } else {
      await db.query(
        `INSERT INTO compliance_alerts (title, body, summary, severity, category, tier_access, published, published_at)
         VALUES ($1,$2,$3,$4,$5,'foundation',TRUE,$6)`,
        [a.title, a.body, a.summary, severity, a.category, a.published_date]);
      ins++;
    }
  }
  console.log(`compliance_alerts: ${ins} inserted, ${upd} updated (${items.length} total)`);
}

(async () => {
  try {
    await seedTemplates();
    await seedCpd();
    await seedAlerts();
    console.log('\nLaunch content seeded.');
  } catch (err) {
    console.error('seed-content error:', err);
    process.exit(1);
  } finally {
    await db.pool.end().catch(() => {});
  }
})();
