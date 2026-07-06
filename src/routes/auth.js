const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const config = require('../config');
const { issueToken, setTokenCookie, requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../email/sendgrid');

const router = express.Router();
const SALT_ROUNDS = 12;

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('tier').isIn(['foundation', 'practitioner', 'elite']).withMessage('Invalid membership tier'),
  body('fsp_licence').optional().trim(),
  body('phone').optional().trim(),
  body('province').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array(), error: errors.array()[0].msg });
  }

  const { full_name, email, password, tier, fsp_licence, phone, province } = req.body;

  try {
    // Check Elite cap
    if (tier === 'elite') {
      const { rows } = await db.query(
        "SELECT COUNT(*) FROM members WHERE tier = 'elite' AND status = 'active'"
      );
      if (parseInt(rows[0].count, 10) >= config.eliteCap) {
        return res.status(409).json({ error: 'Elite KI Circle is currently at capacity. You have been added to the waitlist.' });
      }
    }

    // Check duplicate email
    const { rows: existing } = await db.query('SELECT id FROM members WHERE email = $1', [email]);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows: [member] } = await db.query(
      `INSERT INTO members (email, password_hash, full_name, fsp_licence, phone, province, tier, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, email, full_name, tier, status, is_admin`,
      [email, password_hash, full_name, fsp_licence || null, phone || null, province || null, tier]
    );

    // Await the send: on serverless the function may freeze once the response
    // is returned, silently dropping fire-and-forget work. Failures are logged
    // but never block registration.
    await sendWelcomeEmail(member).catch(err => console.error('Welcome email failed:', err));

    const token = issueToken(member.id);
    setTokenCookie(res, token);

    res.status(201).json({
      message: 'Application submitted. Welcome to Praeto Compliance Club.',
      member: {
        id: member.id,
        email: member.email,
        full_name: member.full_name,
        tier: member.tier,
        status: member.status,
      },
      token,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid credentials.' });

  const { email, password } = req.body;

  try {
    const { rows } = await db.query(
      'SELECT id, email, full_name, password_hash, tier, status, is_admin FROM members WHERE email = $1',
      [email]
    );

    const member = rows[0];
    if (!member) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, member.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    if (member.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
    }

    await db.query('UPDATE members SET last_login_at = NOW() WHERE id = $1', [member.id]);

    const token = issueToken(member.id);
    setTokenCookie(res, token);

    res.json({
      message: 'Logged in successfully.',
      member: {
        id: member.id,
        email: member.email,
        full_name: member.full_name,
        tier: member.tier,
        status: member.status,
        is_admin: member.is_admin,
      },
      token,
      redirect: member.is_admin ? '/admin' : '/portal',
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out.' });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ member: req.member });
});

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  // Always respond success to prevent email enumeration
  const { email } = req.body;

  try {
    const { rows } = await db.query('SELECT id, full_name FROM members WHERE email = $1', [email]);
    if (rows.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.query(
        'UPDATE members SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [token, expires, rows[0].id]
      );

      await sendPasswordResetEmail({ email, full_name: rows[0].full_name }, token)
        .catch(err => console.error('Reset email failed:', err));
    }
  } catch (err) {
    console.error('Forgot password error:', err);
  }

  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request.' });

  const { token, password } = req.body;

  try {
    const { rows } = await db.query(
      'SELECT id FROM members WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    await db.query(
      'UPDATE members SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [password_hash, rows[0].id]
    );

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

// ─── PUT /api/auth/change-password ──────────────────────────────────────────
router.put('/change-password', requireAuth, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
], async (req, res) => {
  const { current_password, new_password } = req.body;

  try {
    const { rows } = await db.query('SELECT password_hash FROM members WHERE id = $1', [req.member.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

    const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await db.query('UPDATE members SET password_hash = $1 WHERE id = $2', [password_hash, req.member.id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

module.exports = router;
