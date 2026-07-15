require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');

const config = require('./config');

const authRoutes    = require('./routes/auth');
const portalRoutes  = require('./routes/portal');
const adminRoutes   = require('./routes/admin');
const paymentsRoute = require('./routes/payments');
const aiRoute       = require('./routes/ai');
const alertsRoute   = require('./routes/alerts');

const app = express();

// Behind Vercel's proxy: needed for correct client IPs (rate limiting) and
// secure cookies. express-rate-limit v7 rejects X-Forwarded-For without this.
app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // relax for EJS-rendered pages with inline scripts
}));

app.use(cors({
  origin: [config.frontendUrl, config.baseUrl],
  credentials: true,
}));

// ─── Request parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ─── Logging ─────────────────────────────────────────────────────────────────
app.use(morgan(config.isProd ? 'combined' : 'dev'));

// ─── Rate limiting ───────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'AI request limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// ─── Views (EJS) ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/ai',       aiLimiter,   aiRoute);
app.use('/api/payments', paymentsRoute);
app.use('/api/alerts',   alertsRoute);
app.use('/portal',       portalRoutes);
app.use('/admin',        adminRoutes);

// Landing page → serve from public folder or redirect
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get(['/health', '/api/health'], async (req, res) => {
  const health = {
    status: 'ok',
    ts: new Date(),
    env: {
      DATABASE_URL: config.dbConfigured,
      JWT_SECRET: config.jwtConfigured,
      RESEND_API_KEY: Boolean(config.resend.apiKey),
      SENDGRID_API_KEY: Boolean(config.sendgrid.apiKey),
      ANTHROPIC_API_KEY: Boolean(config.anthropic.apiKey),
      PAYFAST_MERCHANT_ID: Boolean(process.env.PAYFAST_MERCHANT_ID),
      FRONTEND_URL: config.frontendConfigured,
      NODE_ENV: process.env.NODE_ENV || null,
    },
    db: 'unknown',
  };
  try {
    const db = require('./db');
    await db.query('SELECT 1');
    health.db = 'connected';
  } catch (err) {
    health.db = 'unreachable';
    health.dbError = err.message;
    health.status = 'degraded';
  }
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const message = config.isProd && status === 500
    ? 'An unexpected error occurred.'
    : err.message;
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.status(status).send(`<h1>${status} — ${message}</h1>`);
  }
  res.status(status).json({ error: message });
});

// ─── Start ───────────────────────────────────────────────────────────────────
// Only bind a port when run directly (local dev). On Vercel this module is
// required by api/index.js and must not listen.
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Praeto backend running on port ${config.port} [${config.nodeEnv}]`);
  });
}

module.exports = app;
