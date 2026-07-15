import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import db from '../src/db.js';
import {
  resetDb,
  createMember,
  createAdmin,
  loginAgent,
  memberAgent,
  adminAgent,
} from './helpers.js';

describe('auth', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('POST /api/auth/register', () => {
    it('creates a pending foundation member and issues a token cookie', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'New Member',
        email: 'new-member@example.com',
        password: 'longpassword123',
        tier: 'foundation',
      });

      expect(res.status).toBe(201);
      expect(res.body.member.email).toBe('new-member@example.com');
      expect(res.body.member.tier).toBe('foundation');
      expect(res.body.member.status).toBe('pending');
      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie']?.[0]).toMatch(/token=/);
    });

    it('rejects duplicate emails with 409', async () => {
      await createMember({ email: 'dup@example.com', password: 'pw1' });

      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Duplicate',
        email: 'dup@example.com',
        password: 'longpassword123',
        tier: 'foundation',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('rejects an invalid tier with 400', async () => {
      const res = await request(app).post('/api/auth/register').send({
        full_name: 'Bad Tier',
        email: 'bad-tier@example.com',
        password: 'longpassword123',
        tier: 'enterprise',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token and redirect path for active members', async () => {
      const member = await createMember({ tier: 'practitioner', password: 'my-pass-123' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: member.email, password: 'my-pass-123' });

      expect(res.status).toBe(200);
      expect(res.body.member.email).toBe(member.email);
      expect(res.body.redirect).toBe('/portal');
      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie']?.[0]).toMatch(/token=/);
    });

    it('redirects admins to /admin', async () => {
      const admin = await createAdmin({ password: 'admin-pass-123' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: admin.email, password: 'admin-pass-123' });

      expect(res.status).toBe(200);
      expect(res.body.redirect).toBe('/admin');
    });

    it('rejects unknown credentials with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('rejects wrong password with 401', async () => {
      const member = await createMember({ password: 'correct-pass-123' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: member.email, password: 'wrong-pass-123' });

      expect(res.status).toBe(401);
    });

    it('blocks suspended members with 403', async () => {
      const member = await createMember({ status: 'suspended', password: 'my-pass-123' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: member.email, password: 'my-pass-123' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/suspended/i);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the authenticated member', async () => {
      const { agent, member } = await memberAgent(app, { tier: 'practitioner' });

      const res = await agent.get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.member.id).toBe(member.id);
      expect(res.body.member.email).toBe(member.email);
    });

    it('returns 401 JSON for unauthenticated API requests', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the token cookie', async () => {
      const { agent } = await memberAgent(app);

      const res = await agent.post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']?.[0]).toMatch(/token=;/);
    });
  });

  describe('password reset flow', () => {
    it('sets a reset token and returns an opaque success message', async () => {
      const member = await createMember({ email: 'reset@example.com' });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: member.email });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if that email is registered/i);

      const { rows } = await db.query('SELECT reset_token FROM members WHERE id = $1', [member.id]);
      expect(rows[0].reset_token).toBeTruthy();
    });

    it('returns the same opaque message for unknown emails', async () => {
      const known = await createMember({ email: 'known@example.com' });
      const knownRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: known.email });

      const unknownRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown-xyz@example.com' });

      expect(unknownRes.status).toBe(200);
      expect(unknownRes.body.message).toBe(knownRes.body.message);
    });

    it('resets the password with a valid token', async () => {
      const member = await createMember({ password: 'old-pass-123' });
      await db.query(
        `UPDATE members SET reset_token = $1, reset_token_expires = NOW() + INTERVAL '1 hour' WHERE id = $2`,
        ['valid-token-123', member.id]
      );

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token-123', password: 'new-pass-123' });

      expect(res.status).toBe(200);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: member.email, password: 'new-pass-123' });
      expect(login.status).toBe(200);
    });

    it('rejects an invalid or expired reset token with 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'expired-token', password: 'new-pass-123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid or has expired/i);
    });
  });

  describe('PUT /api/auth/change-password', () => {
    it('changes password when current password is correct', async () => {
      const member = await createMember({ password: 'current-pass-123' });
      const { agent } = await loginAgent(app, member.email, 'current-pass-123');

      const res = await agent.put('/api/auth/change-password').send({
        current_password: 'current-pass-123',
        new_password: 'new-pass-123',
      });

      expect(res.status).toBe(200);

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: member.email, password: 'new-pass-123' });
      expect(login.status).toBe(200);
    });

    it('rejects wrong current password with 400', async () => {
      const member = await createMember({ password: 'current-pass-123' });
      const { agent } = await loginAgent(app, member.email, 'current-pass-123');

      const res = await agent.put('/api/auth/change-password').send({
        current_password: 'wrong-pass-123',
        new_password: 'new-pass-123',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/current password is incorrect/i);
    });
  });
});
