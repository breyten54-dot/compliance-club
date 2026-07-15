const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const db = require('../db');
const config = require('../config');

const router = express.Router();

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'content', 'templates');
const TIER_ORDER = { foundation: 0, practitioner: 1, elite: 2 };

// ─── Gated template download ─────────────────────────────────────────────────
// Streams a template file only if the member's tier is high enough. Prevents
// path traversal (basename + extension whitelist) and re-checks tier server-side
// so a lower-tier member can't reach an Elite template by guessing the URL.
router.get('/templates/download/:file', requireAuth, async (req, res) => {
  const file = path.basename(req.params.file);
  if (!/^[\w.\-]+\.(docx|xlsx)$/i.test(file)) return res.status(400).send('Invalid file.');
  try {
    const { rows } = await db.query(
      `SELECT tier_access FROM templates WHERE file_url LIKE $1 AND active = TRUE LIMIT 1`,
      ['%/' + file]
    );
    if (!rows.length) return res.status(404).send('Template not found.');
    const memberLevel = TIER_ORDER[req.member.tier] ?? 0;
    if ((TIER_ORDER[rows[0].tier_access] ?? 0) > memberLevel) {
      return res.status(403).send('Upgrade your membership to access this template.');
    }
    const filePath = path.join(TEMPLATES_DIR, file);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not available yet.');
    return res.download(filePath, file);
  } catch (err) {
    console.error('template download error:', err);
    return res.status(500).send('Download failed.');
  }
});

// ─── Login page ───────────────────────────────────────────────────────────────
router.get('/login', optionalAuth, (req, res) => {
  if (req.member) return res.redirect('/portal');
  res.render('login', {
    title: 'Member Login — Praeto Compliance Club',
    layout: 'layout_auth',
    error: req.query.error || null,
    next: req.query.next || '/portal',
  });
});

// ─── Register page ────────────────────────────────────────────────────────────
router.get('/register', optionalAuth, (req, res) => {
  if (req.member) return res.redirect('/portal');
  res.render('register', {
    title: 'Join Praeto Compliance Club',
    layout: 'layout_auth',
    selectedTier: req.query.tier || 'practitioner',
    error: null,
  });
});

// ─── Forgot / Reset password pages ───────────────────────────────────────────
router.get('/forgot-password', (req, res) => {
  res.render('forgot_password', {
    title: 'Reset Password — Praeto',
    layout: 'layout_auth',
  });
});

router.get('/reset-password', (req, res) => {
  res.render('reset_password', {
    title: 'Set New Password — Praeto',
    layout: 'layout_auth',
    token: req.query.token || '',
  });
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const [cpdRes, alertsRes, paymentsRes] = await Promise.all([
      db.query(
        `SELECT module_name, hours, completed_at FROM cpd_records
         WHERE member_id = $1 AND cpd_year = $2 ORDER BY completed_at DESC`,
        [req.member.id, currentYear]
      ),
      db.query(
        `SELECT a.id, a.title, a.summary, a.severity, a.category, a.published_at,
                CASE WHEN r.alert_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_read
         FROM compliance_alerts a
         LEFT JOIN member_alert_reads r ON r.alert_id = a.id AND r.member_id = $1
         WHERE a.published = TRUE
         ORDER BY a.published_at DESC LIMIT 5`,
        [req.member.id]
      ),
      db.query(
        `SELECT amount, tier, status, payment_date FROM payments
         WHERE member_id = $1 ORDER BY created_at DESC LIMIT 3`,
        [req.member.id]
      ),
    ]);

    const cpdHours = cpdRes.rows.reduce((sum, r) => sum + parseFloat(r.hours), 0);

    res.render('portal/dashboard', {
      title: 'Member Dashboard — Praeto',
      member: req.member,
      cpdHours: cpdHours.toFixed(1),
      cpdTarget: 30,
      cpdModules: cpdRes.rows,
      recentAlerts: alertsRes.rows,
      recentPayments: paymentsRes.rows,
      paymentMessage: req.query.payment || null,
    });
  } catch (err) {
    console.error('Portal dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});

// ─── CPD Tracker ──────────────────────────────────────────────────────────────
router.get('/cpd', requireAuth, async (req, res) => {
  const year = parseInt(req.query.year || new Date().getFullYear());
  try {
    const [recordsRes, modulesRes] = await Promise.all([
      db.query(
        `SELECT * FROM cpd_records WHERE member_id = $1 AND cpd_year = $2 ORDER BY completed_at DESC`,
        [req.member.id, year]
      ),
      db.query(
        `SELECT * FROM cpd_modules WHERE active = TRUE
         AND (tier_access = 'foundation'
           OR (tier_access = 'practitioner' AND $1 IN ('practitioner','elite'))
           OR (tier_access = 'elite' AND $1 = 'elite'))
         ORDER BY sort_order`,
        [req.member.tier]
      ),
    ]);

    const totalHours = recordsRes.rows.reduce((s, r) => s + parseFloat(r.hours), 0);

    res.render('portal/cpd', {
      title: 'CPD Tracker — Praeto',
      member: req.member,
      records: recordsRes.rows,
      modules: modulesRes.rows,
      totalHours: totalHours.toFixed(1),
      cpdTarget: 30,
      year,
      currentYear: new Date().getFullYear(),
      logged: req.query.logged === '1',
      cpdError: req.query.error === '1',
    });
  } catch (err) {
    console.error('CPD page error:', err);
    res.status(500).send('CPD error');
  }
});

// ─── POST /portal/cpd/log ─────────────────────────────────────────────────────
router.post('/cpd/log', requireAuth, async (req, res) => {
  const { module_name, hours, cpd_year, provider } = req.body;
  try {
    await db.query(
      `INSERT INTO cpd_records (member_id, module_name, hours, cpd_year, provider)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.member.id, module_name, parseFloat(hours), parseInt(cpd_year), provider || 'Praeto Training Institute']
    );
    res.redirect('/portal/cpd?logged=1');
  } catch (err) {
    console.error('CPD log error:', err);
    res.redirect('/portal/cpd?error=1');
  }
});

// ─── Template Library ─────────────────────────────────────────────────────────
router.get('/templates', requireAuth, async (req, res) => {
  const TIER_ORDER = { foundation: 0, practitioner: 1, elite: 2 };
  const memberTierLevel = TIER_ORDER[req.member.tier] ?? 0;

  try {
    const { rows } = await db.query(
      `SELECT * FROM templates WHERE active = TRUE ORDER BY category, title`
    );

    const accessible = rows.map(t => ({
      ...t,
      locked: TIER_ORDER[t.tier_access] > memberTierLevel,
    }));

    res.render('portal/templates', {
      title: 'Template Library — Praeto',
      member: req.member,
      templates: accessible,
    });
  } catch (err) {
    console.error('Templates error:', err);
    res.status(500).send('Template error');
  }
});

// ─── Compliance Alerts ────────────────────────────────────────────────────────
router.get('/alerts', requireAuth, async (req, res) => {
  const TIER_ORDER = { foundation: 0, practitioner: 1, elite: 2 };
  const accessibleTiers = Object.keys(TIER_ORDER)
    .filter(t => TIER_ORDER[t] <= TIER_ORDER[req.member.tier]);

  try {
    const { rows } = await db.query(
      `SELECT a.*, CASE WHEN r.alert_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_read
       FROM compliance_alerts a
       LEFT JOIN member_alert_reads r ON r.alert_id = a.id AND r.member_id = $1
       WHERE a.published = TRUE AND a.tier_access = ANY($2)
       ORDER BY a.published_at DESC`,
      [req.member.id, accessibleTiers]
    );

    res.render('portal/alerts', {
      title: 'Compliance Alerts — Praeto',
      member: req.member,
      alerts: rows,
    });
  } catch (err) {
    console.error('Alerts page error:', err);
    res.status(500).send('Alerts error');
  }
});

// ─── AI Compliance Advisor ────────────────────────────────────────────────────
router.get('/ai-advisor', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, messages->0->>'content' AS first_message, updated_at
       FROM ai_conversations WHERE member_id = $1 ORDER BY updated_at DESC LIMIT 10`,
      [req.member.id]
    );

    res.render('portal/ai-advisor', {
      title: 'AI Compliance Advisor — Praeto',
      member: req.member,
      conversations: rows,
      activeConvId: req.query.conv || null,
    });
  } catch (err) {
    console.error('AI page error:', err);
    res.status(500).send('AI Advisor error');
  }
});

// ─── Account Settings ─────────────────────────────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  res.render('portal/settings', {
    title: 'Account Settings — Praeto',
    member: req.member,
    success: req.query.success || null,
    error: req.query.error || null,
  });
});

router.post('/settings', requireAuth, async (req, res) => {
  const { full_name, phone, province, fsp_licence } = req.body;
  try {
    await db.query(
      `UPDATE members SET full_name=$1, phone=$2, province=$3, fsp_licence=$4 WHERE id=$5`,
      [full_name, phone, province, fsp_licence, req.member.id]
    );
    res.redirect('/portal/settings?success=1');
  } catch (err) {
    console.error('Settings update error:', err);
    res.redirect('/portal/settings?error=1');
  }
});

// ─── Subscribe / Upgrade ──────────────────────────────────────────────────────
router.get('/subscribe', requireAuth, (req, res) => {
  res.render('portal/subscribe', {
    title: 'Upgrade Membership — Praeto',
    member: req.member,
    prices: config.prices,
    selectedTier: req.query.tier || req.member.tier,
  });
});

module.exports = router;
