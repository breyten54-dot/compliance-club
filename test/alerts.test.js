import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import db from '../src/db.js';
import { resetDb, createMember, createAlert, memberAgent, adminAgent } from './helpers.js';

describe('alerts', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('POST /api/alerts (admin publish)', () => {
    it('rejects non-admin members with 403', async () => {
      const { agent } = await memberAgent(app);
      const res = await agent
        .post('/api/alerts')
        .set('Accept', 'application/json')
        .send({ title: 'Hack', body: 'Attempt' });
      expect(res.status).toBe(403);
    });

    it('creates a published alert for admins', async () => {
      const { agent, member: admin } = await adminAgent(app);

      const res = await agent.post('/api/alerts').send({
        title: 'FSCA Update',
        body: 'Detailed guidance body.',
        summary: 'Summary here',
        severity: 'warning',
        category: 'FSCA',
        tier_access: 'practitioner',
        published: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.alert.title).toBe('FSCA Update');
      expect(res.body.alert.severity).toBe('warning');
      expect(res.body.alert.tier_access).toBe('practitioner');
      expect(res.body.alert.published).toBe(true);
      expect(res.body.alert.created_by).toBe(admin.id);
    });

    it('defaults severity, category, tier_access and published when omitted', async () => {
      const { agent } = await adminAgent(app);

      const res = await agent.post('/api/alerts').send({
        title: 'Default Alert',
        body: 'Body text.',
      });

      expect(res.status).toBe(201);
      expect(res.body.alert.severity).toBe('info');
      expect(res.body.alert.category).toBe('FSCA');
      expect(res.body.alert.tier_access).toBe('foundation');
      expect(res.body.alert.published).toBe(true);
    });

    it('rejects missing title or body with 400', async () => {
      const { agent } = await adminAgent(app);

      const noTitle = await agent.post('/api/alerts').send({ body: 'Body only' });
      expect(noTitle.status).toBe(400);

      const noBody = await agent.post('/api/alerts').send({ title: 'Title only' });
      expect(noBody.status).toBe(400);
    });
  });

  describe('PUT /api/alerts/:id (admin update)', () => {
    it('updates an existing alert', async () => {
      const { agent } = await adminAgent(app);
      const alert = await createAlert({ title: 'Old Title', body: 'Old body' });

      const res = await agent.put(`/api/alerts/${alert.id}`).send({
        title: 'New Title',
        body: 'New body',
        summary: 'New summary',
        severity: 'critical',
        category: 'FIC',
        tier_access: 'elite',
        published: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.alert.title).toBe('New Title');
      expect(res.body.alert.published).toBe(false);
    });

    it('returns 404 for unknown alert ids', async () => {
      const { agent } = await adminAgent(app);
      const res = await agent.put('/api/alerts/00000000-0000-0000-0000-000000000000').send({
        title: 'Ghost',
        body: 'Body',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/alerts/:id (admin delete)', () => {
    it('deletes an alert', async () => {
      const { agent } = await adminAgent(app);
      const alert = await createAlert();

      const res = await agent.delete(`/api/alerts/${alert.id}`);
      expect(res.status).toBe(200);

      const { rows } = await db.query('SELECT * FROM compliance_alerts WHERE id = $1', [alert.id]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('GET /api/alerts (member visibility)', () => {
    it('returns only published alerts the member tier can see', async () => {
      const foundationAlert = await createAlert({ tier_access: 'foundation', published: true });
      const practitionerAlert = await createAlert({ tier_access: 'practitioner', published: true });
      const eliteAlert = await createAlert({ tier_access: 'elite', published: true });
      const draftAlert = await createAlert({ tier_access: 'foundation', published: false });

      const { agent } = await memberAgent(app, { tier: 'practitioner' });
      const res = await agent.get('/api/alerts');

      expect(res.status).toBe(200);
      const ids = res.body.alerts.map(a => a.id);
      expect(ids).toContain(foundationAlert.id);
      expect(ids).toContain(practitionerAlert.id);
      expect(ids).not.toContain(eliteAlert.id);
      expect(ids).not.toContain(draftAlert.id);
    });

    it('returns 403 when a member requests a higher-tier alert by id', async () => {
      const eliteAlert = await createAlert({ tier_access: 'elite', published: true });
      const { agent } = await memberAgent(app, { tier: 'foundation' });

      const res = await agent.get(`/api/alerts/${eliteAlert.id}`);
      expect(res.status).toBe(403);
    });

    it('marks an alert as read for the authenticated member', async () => {
      const alert = await createAlert({ tier_access: 'foundation', published: true });
      const { agent, member } = await memberAgent(app, { tier: 'foundation' });

      const res = await agent.get(`/api/alerts/${alert.id}`);
      expect(res.status).toBe(200);

      const { rows } = await db.query(
        'SELECT * FROM member_alert_reads WHERE member_id = $1 AND alert_id = $2',
        [member.id, alert.id]
      );
      expect(rows).toHaveLength(1);
    });
  });
});
