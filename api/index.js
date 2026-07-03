require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const serverless = require('serverless-http');

const config = require('../src/config');

const authRoutes = require('../src/routes/auth');
const paymentsRoute = require('../src/routes/payments');
const aiRoute = require('../src/routes/ai');
const alertsRoute = require('../src/routes/alerts');

const app = express();

// Security
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS — allow the Vercel frontend
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Rate limiting
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

// API routes — mounted at root because Vercel routes /api/* here
app.use('/auth', authLimiter, authRoutes);
app.use('/ai', aiLimiter, aiRoute);
app.use('/payments', paymentsRoute);
app.use('/alerts', alertsRoute);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const message = config.isProd && status === 500
    ? 'An unexpected error occurred.'
    : err.message;
  res.status(status).json({ error: message });
});

module.exports = serverless(app);
