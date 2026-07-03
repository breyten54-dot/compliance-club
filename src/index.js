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
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'AI request limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
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
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

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
app.listen(config.port, () => {
  console.log(`Praeto backend running on port ${config.port} [${config.nodeEnv}]`);
});

module.exports = app;
