import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import { resetDb, createTemplate, memberAgent } from './helpers.js';

describe('portal downloads', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
  });

  it('redirects an unauthenticated browser to the login page (302)', async () => {
    const res = await request(app).get('/portal/templates/download/test.docx');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/portal\/login/);
  });

  it('returns 401 JSON for an unauthenticated API-style request', async () => {
    const res = await request(app)
      .get('/portal/templates/download/test.docx')
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized/i);
  });

  it('returns 400 for a file with a non-whitelisted extension', async () => {
    const { agent } = await memberAgent(app);
    const res = await agent.get('/portal/templates/download/malicious.exe');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/invalid file/i);
  });

  it('returns 404 when the template row does not exist', async () => {
    const { agent } = await memberAgent(app);
    const res = await agent.get('/portal/templates/download/missing.docx');
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/template not found/i);
  });

  it('returns 403 when the member tier is too low', async () => {
    const { agent } = await memberAgent(app, { tier: 'foundation' });
    const template = await createTemplate({ tier_access: 'elite' });

    const res = await agent.get(`/portal/templates/download/${template.fileName}`);
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/upgrade/i);
  });

  it('returns 200 with the real committed file when the member tier is sufficient', async () => {
    const { agent } = await memberAgent(app, { tier: 'foundation' });
    const template = await createTemplate({
      fileName: '01_RMCP.docx',
      tier_access: 'foundation',
      skipFileWrite: true,
    });

    const res = await agent.get('/portal/templates/download/01_RMCP.docx');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('01_RMCP.docx');
    expect(res.headers['content-type']).toMatch(/officedocument|octet-stream/);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('blocks path traversal by using basename only', async () => {
    const { agent } = await memberAgent(app);
    await createTemplate({ fileName: 'fixture-real.docx' });

    // The router uses path.basename, so the traversal is collapsed to
    // 'other.docx'. No template row exists for that basename, so it 404s.
    const res = await agent.get('/portal/templates/download/../../../content/templates/other.docx');
    expect(res.status).toBe(404);
  });

  it('allows elite members to download elite-gated files', async () => {
    const { agent } = await memberAgent(app, { tier: 'elite' });
    const template = await createTemplate({ tier_access: 'elite' });

    const res = await agent.get(`/portal/templates/download/${template.fileName}`);
    expect(res.status).toBe(200);
  });
});
