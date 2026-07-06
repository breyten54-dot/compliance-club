const express = require('express');
const { requireAdmin } = require('../middleware/adminAuth');
const db = require('../db');
const { sendBroadcastEmail } = require('../email/sendgrid');

const router = express.Router();

// All admin routes require admin auth
router.use(requireAdmin);

// ─── GET /admin (dashboard) ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [membersRes, revenueRes, alertsRes, pendingRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE tier = 'foundation' AND status = 'active') AS foundation,
          COUNT(*) FILTER (WHERE tier = 'practitioner' AND status = 'active') AS practitioner,
          COUNT(*) FILTER (WHERE tier = 'elite' AND status = 'active') AS elite,
          COUNT(*) AS total
        FROM members WHERE is_admin = FALSE`),
      db.query(`
        SELECT
          SUM(amount) FILTER (WHERE status = 'complete') AS total_revenue,
          SUM(amount) FILTER (WHERE status = 'complete'
            AND payment_date >= date_trunc('month', NOW())) AS mrr
        FROM payments`),
      db.query(`SELECT COUNT(*) AS total FROM compliance_alerts WHERE published = TRUE`),
      db.query(`SELECT id, full_name, email, tier, created_at FROM members
                WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10`),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard — Praeto',
      layout: 'layout_admin',
      member: req.member,
      stats: {
        members: membersRes.rows[0],
        revenue: revenueRes.rows[0],
        alerts: alertsRes.rows[0],
      },
      pendingMembers: pendingRes.rows,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});

// ─── GET /admin/members ───────────────────────────────────────────────────────
router.get('/members', async (req, res) => {
  const { tier, status, q } = req.query;
  try {
    let query = `SELECT id, full_name, email, fsp_licence, tier, status,
                        province, created_at, last_login_at
                 FROM members WHERE is_admin = FALSE`;
    const params = [];

    if (tier) { params.push(tier); query += ` AND tier = $${params.length}`; }
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (q) {
      params.push(`%${q}%`);
      query += ` AND (full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR fsp_licence ILIKE $${params.length})`;
    }
    query += ' ORDER BY created_at DESC LIMIT 200';

    const { rows } = await db.query(query, params);
    res.render('admin/members', {
      title: 'Members — Praeto Admin',
      layout: 'layout_admin',
      member: req.member,
      members: rows,
      filters: { tier, status, q },
    });
  } catch (err) {
    console.error('Admin members error:', err);
    res.status(500).send('Error fetching members');
  }
});

// ─── POST /admin/members/:id/status (activate, suspend, cancel) ──────────────
router.post('/members/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'cancelled', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    await db.query('UPDATE members SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ message: `Member status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member status.' });
  }
});

// ─── POST /admin/members/:id/tier ────────────────────────────────────────────
router.post('/members/:id/tier', async (req, res) => {
  const { tier } = req.body;
  if (!['foundation', 'practitioner', 'elite'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier.' });
  }
  try {
    await db.query('UPDATE members SET tier = $1 WHERE id = $2', [tier, req.params.id]);
    res.json({ message: `Member tier updated to ${tier}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tier.' });
  }
});

// ─── GET /admin/alerts ────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, m.full_name AS author
       FROM compliance_alerts a
       LEFT JOIN members m ON m.id = a.created_by
       ORDER BY a.created_at DESC`
    );
    res.render('admin/alerts', {
      title: 'Compliance Alerts — Praeto Admin',
      layout: 'layout_admin',
      member: req.member,
      alerts: rows,
    });
  } catch (err) {
    console.error('Admin alerts error:', err);
    res.status(500).send('Error fetching alerts');
  }
});

// ─── GET /admin/broadcast ─────────────────────────────────────────────────────
router.get('/broadcast', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT b.*, m.full_name AS author FROM email_broadcasts b
       LEFT JOIN members m ON m.id = b.sent_by
       ORDER BY b.created_at DESC LIMIT 20`
    );
    res.render('admin/broadcast', {
      title: 'Email Broadcast — Praeto Admin',
      layout: 'layout_admin',
      member: req.member,
      broadcasts: rows,
    });
  } catch (err) {
    console.error('Admin broadcast error:', err);
    res.status(500).send('Error');
  }
});

// ─── POST /admin/broadcast/send ───────────────────────────────────────────────
router.post('/broadcast/send', async (req, res) => {
  const { subject, body, tier_filter } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and body are required.' });
  }

  try {
    let query = `SELECT email, full_name FROM members WHERE status = 'active' AND is_admin = FALSE`;
    const params = [];
    if (tier_filter) { params.push(tier_filter); query += ` AND tier = $1`; }

    const { rows: recipients } = await db.query(query, params);

    // Record broadcast
    const { rows: [broadcast] } = await db.query(
      `INSERT INTO email_broadcasts (subject, body, tier_filter, sent_by, recipient_count, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [subject, body, tier_filter || null, req.member.id, recipients.length]
    );

    // Awaited: serverless may freeze after the response, dropping the send
    await sendBroadcastEmail(recipients, subject, body).catch(err =>
      console.error('Broadcast send error:', err)
    );

    res.json({
      message: `Broadcast queued for ${recipients.length} member(s).`,
      broadcast_id: broadcast.id,
    });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: 'Failed to send broadcast.' });
  }
});

// ─── API: GET /admin/api/stats ────────────────────────────────────────────────
router.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM members WHERE status='active' AND is_admin=FALSE) AS active_members,
        (SELECT COUNT(*) FROM members WHERE status='pending') AS pending_applications,
        (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='complete'
          AND payment_date >= date_trunc('month', NOW())) AS mrr,
        (SELECT COUNT(*) FROM compliance_alerts WHERE published=TRUE) AS alerts_published,
        (SELECT COUNT(*) FROM members WHERE tier='elite' AND status='active') AS elite_count
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Stats error.' });
  }
});

// ─── API: GET /admin/api/members ─────────────────────────────────────────────
router.get('/api/members', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, fsp_licence, tier, status, province, created_at
       FROM members WHERE is_admin = FALSE ORDER BY created_at DESC LIMIT 500`
    );
    res.json({ members: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
});

// ─── API: GET /admin/api/revenue ─────────────────────────────────────────────
router.get('/api/revenue', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        date_trunc('month', payment_date) AS month,
        SUM(amount) AS total,
        COUNT(*) AS count
      FROM payments
      WHERE status = 'complete'
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `);
    res.json({ revenue: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revenue.' });
  }
});

module.exports = router;
