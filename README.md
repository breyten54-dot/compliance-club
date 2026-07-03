# Praeto Compliance Club — Vercel Full Deploy

This folder deploys the **entire Compliance Club platform** to Vercel:

- Static frontend (landing page + React SPA) from `public/`
- Serverless backend API from `api/index.js`
- PostgreSQL database via Vercel Postgres (or any Postgres provider)

## Architecture

```
praeto.co.za (Firebase)  ──button──►  praeto-compliance-club.vercel.app (Vercel)
                                            │
                                            ├─── public/index.html  (landing)
                                            ├─── public/app/        (React SPA)
                                            └─── api/index.js       (serverless backend)
                                                        │
                                                        ▼
                                            Vercel Postgres / external Postgres
```

## What you MUST update before deploying

1. **Canonical / Open Graph URLs** in `public/index.html`
   - Search for `https://YOUR_VERCEL_DOMAIN.vercel.app/`
   - Replace with your actual Vercel URL

## Deploy to Vercel

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Deploy

```bash
cd Praeto-Web-Project/vercel-compliance-club
vercel --prod
```

Vercel will give you a URL like `https://praeto-compliance-club.vercel.app`.

## Environment Variables

In the Vercel dashboard → Project Settings → Environment Variables, add:

| Variable | Purpose | Example |
|---|---|---|
| `NODE_ENV` | Environment | `production` |
| `BASE_URL` | Public backend URL | `https://praeto-compliance-club.vercel.app` |
| `FRONTEND_URL` | Public frontend URL | `https://praeto-compliance-club.vercel.app` |
| `JWT_SECRET` | Random 64-byte hex | Generate below |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `DATABASE_URL` | Postgres connection string | From Vercel Postgres |
| `SENDGRID_API_KEY` | Email API key | `SG.xxx...` |
| `EMAIL_FROM` | Sender email | `noreply@praeto.co.za` |
| `EMAIL_FROM_NAME` | Sender name | `Praeto Compliance Club` |
| `ADMIN_EMAIL` | Admin account email | `berkeley@praeto.co.za` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-xxx...` |
| `PAYFAST_MERCHANT_ID` | PayFast ID | `12345678` |
| `PAYFAST_MERCHANT_KEY` | PayFast Key | `abc123def456ghi7` |
| `PAYFAST_PASSPHRASE` | PayFast passphrase | `Praeto@PayFast2026` |
| `PAYFAST_ENV` | PayFast mode | `sandbox` or `production` |
| `PRICE_FOUNDATION` | Price in ZAR | `2500` |
| `PRICE_PRACTITIONER` | Price in ZAR | `5000` |
| `PRICE_ELITE` | Price in ZAR | `15000` |
| `ELITE_MEMBER_CAP` | Max elite members | `30` |

### Generate JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Database Setup

### Option A — Vercel Postgres

1. In Vercel dashboard → Storage → Create Database → PostgreSQL
2. Connect it to this project
3. Vercel auto-adds `POSTGRES_URL` env var
4. Add a new env var `DATABASE_URL` with the same value as `POSTGRES_URL`

### Option B — External Postgres (Supabase, Neon, Railway, etc.)

1. Create a Postgres database
2. Copy the connection string
3. Add it as `DATABASE_URL`

### Apply schema

Run the schema file against your database:

```bash
psql "$DATABASE_URL" -f src/db/schema.sql
```

Or use your database provider’s SQL editor.

### Seed admin account

After schema is applied, run once:

```bash
vercel env pull .env.local
npm install
node src/db/seed.js
```

Default admin password: `Admin@Praeto2026`

**Change this immediately after first login.**

## API Routing

- `/` → Landing page
- `/app/#/portal` → Member portal (React SPA)
- `/app/#/admin` → Admin panel (React SPA)
- `/api/auth/*` → Authentication
- `/api/payments/*` → PayFast payments
- `/api/ai/*` → AI Compliance Advisor
- `/api/alerts/*` → Compliance alerts
- `/api/health` → Health check

## PayFast Webhooks

In PayFast merchant settings:

- **ITN URL:** `https://YOUR_VERCEL_DOMAIN/api/payments/webhook`
- **Return URL:** `https://YOUR_VERCEL_DOMAIN/app/#/portal?payment=success`
- **Cancel URL:** `https://YOUR_VERCEL_DOMAIN/app/#/portal?payment=cancelled`

The backend uses `BASE_URL` and `FRONTEND_URL` env vars to generate these, so set them correctly.

## Connect praeto.co.za button

After deployment, copy your Vercel URL and update it in the Risk & Insurance project:

```ts
// praeto-risk-and-insurance-git/constants.ts
export const COMPLIANCE_CLUB_URL = "https://YOUR_VERCEL_DOMAIN";
```

Then rebuild and redeploy the Risk & Insurance site to Firebase:

```bash
cd praeto-risk-and-insurance-git
npm run build
firebase deploy --only hosting
```

## Notes

- The EJS server-rendered views in `src/views/` are not used when the React SPA is deployed. They are kept for backwards compatibility.
- The backend is adapted for Vercel serverless functions via `serverless-http`.
- The `src/index.js` file (original always-on server) is not used by Vercel.
