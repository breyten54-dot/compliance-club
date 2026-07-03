const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

/**
 * Reads JWT from httpOnly cookie or Authorization header.
 * Attaches req.member on success.
 */
async function requireAuth(req, res, next) {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) return _unauthorized(req, res);

    const payload = jwt.verify(token, config.jwt.secret);

    const { rows } = await db.query(
      'SELECT id, email, full_name, tier, status, is_admin FROM members WHERE id = $1',
      [payload.sub]
    );

    if (!rows.length || rows[0].status === 'suspended') {
      return _unauthorized(req, res);
    }

    req.member = rows[0];
    next();
  } catch {
    _unauthorized(req, res);
  }
}

/**
 * Same as requireAuth but allows the request to continue even without a token.
 * req.member will be null if unauthenticated.
 */
async function optionalAuth(req, res, next) {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : null);

    if (!token) { req.member = null; return next(); }

    const payload = jwt.verify(token, config.jwt.secret);
    const { rows } = await db.query(
      'SELECT id, email, full_name, tier, status, is_admin FROM members WHERE id = $1',
      [payload.sub]
    );

    req.member = rows.length && rows[0].status !== 'suspended' ? rows[0] : null;
  } catch {
    req.member = null;
  }
  next();
}

function _unauthorized(req, res) {
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.redirect(`/portal/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(401).json({ error: 'Unauthorized — please log in.' });
}

function issueToken(memberId) {
  return jwt.sign({ sub: memberId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

module.exports = { requireAuth, optionalAuth, issueToken, setTokenCookie };
