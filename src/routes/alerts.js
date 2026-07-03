const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const db = require('../db');

const router = express.Router();

const TIER_ORDER = { foundation: 0, practitioner: 1, elite: 2 };

function memberCanSeeAlert(memberTier, alertTier) {
  return (TIER_ORDER[memberTier] ?? 0) >= (TIER_ORDER[alertTier] ?? 0);
}

// ─── GET /api/alerts (public list, filtered by member tier) ──────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.title, a.summary, a.severity, a.category, a.tier_access,
              a.published_at,
              CASE WHEN r.alert_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_read
       FROM compliance_alerts a
       LEFT JOIN member_alert_reads r ON r.alert_id = a.id AND r.member_id = $1
       WHERE a.published = TRUE
         AND tier_access = ANY($2)
       ORDER BY a.published_at DESC
       LIMIT 50`,
      [
        req.member.id,
        Object.keys(TIER_ORDER).filter(t => TIER_ORDER[t] <= TIER_ORDER[req.member.tier]),
      ]
    );
    res.json({ alerts: rows });
  } catch (err) {
    console.error('Alerts fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch alerts.' });
  }
});

// ─── GET /api/alerts/:id ─────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM compliance_alerts WHERE id = $1 AND published = TRUE',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Alert not found.' });

    const alert = rows[0];
    if (!memberCanSeeAlert(req.member.tier, alert.tier_access)) {
      return res.status(403).json({ error: 'This alert requires a higher membership tier.' });
    }

    // Mark as read
    await db.query(
      `INSERT INTO member_alert_reads (member_id, alert_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.member.id, alert.id]
    );

    res.json({ alert });
  } catch (err) {
    console.error('Alert detail error:', err);
    res.status(500).json({ error: 'Failed to fetch alert.' });
  }
});

// ─── POST /api/alerts (admin only) ───────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { title, body, summary, severity, category, tier_access, published } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required.' });
  }

  try {
    const { rows: [alert] } = await db.query(
      `INSERT INTO compliance_alerts
         (title, body, summary, severity, category, tier_access, published, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        title, body, summary || null,
        severity || 'info',
        category || 'FSCA',
        tier_access || 'foundation',
        published !== false,
        req.member.id,
      ]
    );
    res.status(201).json({ alert });
  } catch (err) {
    console.error('Create alert error:', err);
    res.status(500).json({ error: 'Failed to create alert.' });
  }
});

// ─── PUT /api/alerts/:id (admin only) ────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { title, body, summary, severity, category, tier_access, published } = req.body;

  try {
    const { rows } = await db.query(
      `UPDATE compliance_alerts
       SET title=$1, body=$2, summary=$3, severity=$4, category=$5,
           tier_access=$6, published=$7
       WHERE id=$8 RETURNING *`,
      [title, body, summary, severity, category, tier_access, published, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Alert not found.' });
    res.json({ alert: rows[0] });
  } catch (err) {
    console.error('Update alert error:', err);
    res.status(500).json({ error: 'Failed to update alert.' });
  }
});

// ─── DELETE /api/alerts/:id (admin only) ─────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM compliance_alerts WHERE id = $1', [req.params.id]);
    res.json({ message: 'Alert deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete alert.' });
  }
});

module.exports = router;
