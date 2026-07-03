const { requireAuth } = require('./auth');

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    if (!req.member?.is_admin) {
      if (req.accepts('html')) return res.redirect('/portal');
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
}

module.exports = { requireAdmin };
