require('dotenv').config();

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

// Resolve the Postgres connection string from whichever variable the host set.
// Vercel's Neon/Postgres integration names it differently depending on the
// chosen prefix (DATABASE_URL, POSTGRES_URL, STORAGE_URL, …), so accept any of
// the common names rather than forcing one. Prefer pooled URLs.
const DB_URL_CANDIDATES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'STORAGE_URL',
  'STORAGE_POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'STORAGE_URL_UNPOOLED',
];
const resolveDbUrl = () => {
  for (const key of DB_URL_CANDIDATES) {
    if (process.env[key]) return process.env[key];
  }
  return null;
};
const dbUrl = resolveDbUrl();

module.exports = {
  // True when a real connection string was found (not the local dev fallback).
  dbConfigured: Boolean(dbUrl),
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  db: {
    connectionString: dbUrl || 'postgresql://localhost:5432/praeto',
  },

  // Email: Resend (free tier) is preferred when RESEND_API_KEY is set;
  // SendGrid remains supported; with neither key, sends are logged as stubs.
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    from: process.env.EMAIL_FROM || 'noreply@praeto.co.za',
    fromName: process.env.EMAIL_FROM_NAME || 'Praeto Compliance Club',
    adminEmail: process.env.ADMIN_EMAIL || 'berkeley@praeto.co.za',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-6',
  },

  payfast: {
    merchantId: process.env.PAYFAST_MERCHANT_ID || '10000100',
    merchantKey: process.env.PAYFAST_MERCHANT_KEY || '46f0cd694581a',
    passphrase: process.env.PAYFAST_PASSPHRASE || '',
    env: process.env.PAYFAST_ENV || 'sandbox',
    get endpoint() {
      return this.env === 'production'
        ? 'https://www.payfast.co.za/eng/process'
        : 'https://sandbox.payfast.co.za/eng/process';
    },
    get validateHost() {
      return this.env === 'production'
        ? 'www.payfast.co.za'
        : 'sandbox.payfast.co.za';
    },
  },

  prices: {
    foundation:   parseInt(process.env.PRICE_FOUNDATION   || '2500', 10),
    practitioner: parseInt(process.env.PRICE_PRACTITIONER || '5000', 10),
    elite:        parseInt(process.env.PRICE_ELITE        || '15000', 10),
  },

  eliteCap: parseInt(process.env.ELITE_MEMBER_CAP || '30', 10),
};
