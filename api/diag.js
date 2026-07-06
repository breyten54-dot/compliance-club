// Temporary diagnostic endpoint: reports which module fails to load on Vercel.
// Remove once the deployment is stable.
module.exports = (req, res) => {
  const steps = [];
  const tryReq = (name, path) => {
    try {
      require(path);
      steps.push({ name, ok: true });
    } catch (e) {
      steps.push({
        name,
        ok: false,
        error: e.message,
        stack: (e.stack || '').split('\n').slice(0, 5),
      });
    }
  };

  tryReq('express', 'express');
  tryReq('morgan', 'morgan');
  tryReq('express-ejs-layouts', 'express-ejs-layouts');
  tryReq('ejs', 'ejs');
  tryReq('bcrypt', 'bcrypt');
  tryReq('pg', 'pg');
  tryReq('@anthropic-ai/sdk', '@anthropic-ai/sdk');
  tryReq('@sendgrid/mail', '@sendgrid/mail');
  tryReq('config', '../src/config');
  tryReq('db', '../src/db');
  tryReq('middleware/auth', '../src/middleware/auth');
  tryReq('routes/auth', '../src/routes/auth');
  tryReq('routes/portal', '../src/routes/portal');
  tryReq('routes/admin', '../src/routes/admin');
  tryReq('routes/payments', '../src/routes/payments');
  tryReq('routes/ai', '../src/routes/ai');
  tryReq('routes/alerts', '../src/routes/alerts');
  tryReq('full app (src/index)', '../src/index');

  const fs = require('fs');
  const path = require('path');
  let viewsDir = null;
  try {
    const dir = path.join(__dirname, '..', 'src', 'views');
    viewsDir = fs.readdirSync(dir);
  } catch (e) {
    viewsDir = `unreadable: ${e.message}`;
  }

  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ node: process.version, cwd: process.cwd(), viewsDir, steps }, null, 2));
};
