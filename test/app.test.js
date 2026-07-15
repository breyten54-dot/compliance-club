import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
describe('health', () => {
  it('reports status, env presence, and db connectivity', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('env');
    expect(res.body).toHaveProperty('db');
    expect(typeof res.body.env.DATABASE_URL).toBe('boolean');
  });

  it('is also reachable at /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
  });
});

describe('portal pages (server-rendered)', () => {
  it('renders the member login page', async () => {
    const res = await request(app).get('/portal/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Member Login');
    expect(res.text).toContain('/api/auth/login');
  });

  it('includes the 15-minute idle-timeout notice on the login page', async () => {
    const res = await request(app).get('/portal/login');
    expect(res.text).toContain('inactivity');
  });

  it('renders the registration page', async () => {
    const res = await request(app).get('/portal/register');
    expect(res.status).toBe(200);
  });

  it('renders the forgot-password page', async () => {
    const res = await request(app).get('/portal/forgot-password');
    expect(res.status).toBe(200);
  });

  it('redirects unauthenticated visitors from the dashboard to login', async () => {
    const res = await request(app).get('/portal');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/portal/login');
  });
});

describe('auth API', () => {
  it('returns 401 JSON (not a redirect) for unauthenticated /api/auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects login with a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'whatever123' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects registration with an invalid membership tier', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Test User',
      email: 'test@example.com',
      password: 'longenough123',
      tier: 'platinum',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects registration with a short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      full_name: 'Test User',
      email: 'test@example.com',
      password: 'short',
      tier: 'foundation',
    });
    expect(res.status).toBe(400);
  });

  it('fails gracefully with JSON when credentials are well-formed', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    // 401 with a database connected, 500 without one — never HTML, never a hang
    expect([401, 500]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });
});

describe('AI advisor', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({ message: 'What are the FAIS CPD requirements?' });
    expect(res.status).toBe(401);
  });
});

describe('routing hygiene', () => {
  it('returns JSON 404 for unknown API paths', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('serves the SPA with correct /app-prefixed asset paths', async () => {
    const res = await request(app).get('/app/index.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('src="/app/assets/');
  });
});

// Full end-to-end auth flow — runs only when a database is available
describe.runIf(!!process.env.DATABASE_URL)('end-to-end auth (requires DATABASE_URL)', () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'integration-test-pw1';

  it('registers, logs in, and reaches the dashboard', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      full_name: 'Integration Test',
      email,
      password,
      tier: 'foundation',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.member.email).toBe(email);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body).toHaveProperty('token');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.member.email).toBe(email);
  });
});
