import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import db from '../src/db.js';
import { resetDb, createMember, createAdmin, memberAgent, adminAgent } from './helpers.js';

describe('admin', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('authentication gate', () => {
    it('redirects non-admin members away from /admin/members', async () => {
      const { agent } = await memberAgent(app);
      const res = await agent.get('/admin/members');
      expect([302, 403]).toContain(res.status);
      if (res.status === 302) {
        expect(res.headers.location).toBe('/portal');
      }
    });

    it('returns 403 JSON for non-admin API calls', async () => {
      const { agent } = await memberAgent(app);
      const res = await agent
        .get('/admin/api/members')
        .set('Accept', 'application/json');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/admin access required/i);
    });
  });

  describe('GET /admin/members search', () => {
    it('lists all non-admin members', async () => {
      const { agent } = await adminAgent(app);
      await createMember({ full_name: 'Alpha One', email: 'alpha@example.com', tier: 'foundation' });
      await createMember({ full_name: 'Beta Two', email: 'beta@example.com', tier: 'practitioner' });

      const res = await agent.get('/admin/members');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Alpha One');
      expect(res.text).toContain('Beta Two');
    });

    it('filters by tier', async () => {
      const { agent } = await adminAgent(app);
      await createMember({ full_name: 'Foundation Member', tier: 'foundation' });
      await createMember({ full_name: 'Practitioner Member', tier: 'practitioner' });

      const res = await agent.get('/admin/members?tier=practitioner');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Practitioner Member');
      expect(res.text).not.toContain('Foundation Member');
    });

    it('filters by status', async () => {
      const { agent } = await adminAgent(app);
      await createMember({ full_name: 'Pending Member', status: 'pending' });
      await createMember({ full_name: 'Active Member', status: 'active' });

      const res = await agent.get('/admin/members?status=pending');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Pending Member');
      expect(res.text).not.toContain('Active Member');
    });

    it('filters by search query across name, email and FSP licence', async () => {
      const { agent } = await adminAgent(app);
      await createMember({ full_name: 'Berkeley Pretorius', email: 'berkeley@example.com', fsp_licence: '1457' });
      await createMember({ full_name: 'Other Person', email: 'other@example.com', fsp_licence: '9999' });

      const nameRes = await agent.get('/admin/members?q=Berkeley');
      expect(nameRes.text).toContain('Berkeley Pretorius');
      expect(nameRes.text).not.toContain('Other Person');

      const emailRes = await agent.get('/admin/members?q=berkeley@example.com');
      expect(emailRes.text).toContain('Berkeley Pretorius');

      const fspRes = await agent.get('/admin/members?q=1457');
      expect(fspRes.text).toContain('Berkeley Pretorius');
    });
  });

  describe('GET /admin/api/members', () => {
    it('returns JSON member list for admins', async () => {
      const { agent } = await adminAgent(app);
      const member = await createMember({ full_name: 'API Member' });

      const res = await agent.get('/admin/api/members').set('Accept', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body.members).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: member.id, full_name: 'API Member' })])
      );
    });

    it('excludes admin users from the list', async () => {
      const { agent, member: admin } = await adminAgent(app);

      const res = await agent.get('/admin/api/members').set('Accept', 'application/json');
      expect(res.status).toBe(200);
      expect(res.body.members.some(m => m.id === admin.id)).toBe(false);
    });
  });

  describe('member status and tier management', () => {
    it('updates a member status', async () => {
      const { agent } = await adminAgent(app);
      const member = await createMember({ status: 'pending' });

      const res = await agent
        .post(`/admin/members/${member.id}/status`)
        .send({ status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/active/);

      const { rows } = await db.query('SELECT status FROM members WHERE id = $1', [member.id]);
      expect(rows[0].status).toBe('active');
    });

    it('rejects an invalid status value', async () => {
      const { agent } = await adminAgent(app);
      const member = await createMember();

      const res = await agent
        .post(`/admin/members/${member.id}/status`)
        .send({ status: 'banned' });

      expect(res.status).toBe(400);
    });
  });
});
