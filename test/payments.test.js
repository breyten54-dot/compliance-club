import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import https from 'https';
import request from 'supertest';
import crypto from 'crypto';
import app from '../src/index.js';
import db from '../src/db.js';
import paymentsRouter from '../src/routes/payments.js';
import { resetDb, memberAgent, createMember } from './helpers.js';

const { pfParamString, pfSignature } = paymentsRouter;

function expectedPfSignature(data, passphrase) {
  // Independent reference implementation using the documented PayFast rules:
  // insertion order, skip signature + empty/null, encode spaces as '+'.
  const str = Object.keys(data)
    .filter(k => k !== 'signature' && data[k] !== '' && data[k] != null)
    .map(k => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, '+')}`)
    .join('&') + (passphrase ? `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}` : '');
  return crypto.createHash('md5').update(str).digest('hex');
}

describe('payments', () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PayFast signature helpers', () => {
    it('pfParamString preserves insertion order and excludes the signature', () => {
      const data = { merchant_id: '10000100', amount: '2500.00', signature: 'abc', empty: '' };
      expect(pfParamString(data)).toBe('merchant_id=10000100&amount=2500.00');
    });

    it('pfParamString encodes spaces as plus signs', () => {
      const data = { item_name: 'Foundation Membership', item_description: 'Praeto Compliance Club' };
      expect(pfParamString(data)).toBe(
        'item_name=Foundation+Membership&item_description=Praeto+Compliance+Club'
      );
    });

    it('pfSignature matches the known-good reference vector', () => {
      const data = {
        merchant_id: '10000100',
        merchant_key: '46f0cd694581a',
        amount: '2500.00',
        item_name: 'Foundation Membership',
      };
      const sig = pfSignature(data, 'test-passphrase');
      expect(sig).toBe(expectedPfSignature(data, 'test-passphrase'));
      expect(sig).toMatch(/^[a-f0-9]{32}$/);
    });

    it('uses insertion order, not alphabetical order', () => {
      const ordered = { z: '1', a: '2', m: '3' };
      const alphabetical = { a: '2', m: '3', z: '1' };
      expect(pfSignature(ordered, 'pass')).not.toBe(pfSignature(alphabetical, 'pass'));
      expect(pfSignature(ordered, 'pass')).toBe(expectedPfSignature(ordered, 'pass'));
    });
  });

  describe('POST /api/payments/checkout', () => {
    it('requires authentication', async () => {
      const res = await request(app).post('/api/payments/checkout').send({ tier: 'foundation' });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/unauthorized/i);
    });

    it('rejects an invalid tier', async () => {
      const { agent } = await memberAgent(app, { tier: 'foundation' });
      const res = await agent.post('/api/payments/checkout').send({ tier: 'enterprise' });
      expect(res.status).toBe(400);
    });

    it('returns PayFast fields with a valid signature for practitioner', async () => {
      const { agent, member } = await memberAgent(app, { tier: 'foundation' });

      const res = await agent.post('/api/payments/checkout').send({ tier: 'practitioner' });

      expect(res.status).toBe(200);
      expect(res.body.endpoint).toMatch(/payfast/);
      expect(res.body.fields.signature).toMatch(/^[a-f0-9]{32}$/);
      expect(res.body.fields.signature).toBe(expectedPfSignature(res.body.fields, 'test-passphrase'));
      expect(res.body.fields.m_payment_id).toBeDefined();
      expect(res.body.fields.amount).toBe('5000.00');
      expect(res.body.fields.custom_str2).toBe('practitioner');

      const { rows } = await db.query('SELECT * FROM payments WHERE id = $1', [res.body.fields.m_payment_id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].member_id).toBe(member.id);
      expect(rows[0].tier).toBe('practitioner');
      expect(rows[0].status).toBe('pending');
    });
  });

  describe('POST /api/payments/webhook', () => {
    function mockValidValidation() {
      vi.spyOn(https, 'request').mockImplementation((_options, callback) => {
        const res = {
          on: vi.fn((event, handler) => {
            if (event === 'data') handler(Buffer.from('VALID'));
            if (event === 'end') handler();
          }),
        };
        if (callback) callback(res);
        return {
          on: vi.fn(),
          write: vi.fn(),
          end: vi.fn(),
        };
      });
    }

    it('acknowledges immediately with 200', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .send('merchant_id=10000100')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      expect(res.status).toBe(200);
    });

    it('activates the member and records payment on a complete ITN', async () => {
      const member = await createMember({ tier: 'foundation', status: 'pending' });
      const { rows: [payment] } = await db.query(
        `INSERT INTO payments (member_id, amount, tier, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [member.id, 2500, 'foundation']
      );

      const pfData = {
        merchant_id: '10000100',
        payment_id: '123456',
        pf_payment_id: 'PF-123',
        m_payment_id: payment.id,
        custom_str1: member.id,
        custom_str2: 'foundation',
        payment_status: 'COMPLETE',
        amount_gross: '2500.00',
      };
      pfData.signature = pfSignature(pfData, 'test-passphrase');

      mockValidValidation();

      await request(app)
        .post('/api/payments/webhook')
        .send(new URLSearchParams(pfData).toString())
        .set('Content-Type', 'application/x-www-form-urlencoded');

      // The route responds before async processing finishes; allow a short window.
      await new Promise(r => setTimeout(r, 150));

      const { rows: paymentRows } = await db.query('SELECT * FROM payments WHERE id = $1', [payment.id]);
      expect(paymentRows[0].status).toBe('complete');
      expect(paymentRows[0].payfast_pf_payment_id).toBe('PF-123');

      const { rows: memberRows } = await db.query('SELECT status, tier FROM members WHERE id = $1', [member.id]);
      expect(memberRows[0].status).toBe('active');
      expect(memberRows[0].tier).toBe('foundation');
    });

    it('does not activate the member when the signature is wrong', async () => {
      const member = await createMember({ tier: 'foundation', status: 'pending' });
      const { rows: [payment] } = await db.query(
        `INSERT INTO payments (member_id, amount, tier, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [member.id, 2500, 'foundation']
      );

      const pfData = {
        merchant_id: '10000100',
        m_payment_id: payment.id,
        custom_str1: member.id,
        custom_str2: 'foundation',
        payment_status: 'COMPLETE',
        amount_gross: '2500.00',
        signature: 'bad-signature',
      };

      await request(app)
        .post('/api/payments/webhook')
        .send(new URLSearchParams(pfData).toString())
        .set('Content-Type', 'application/x-www-form-urlencoded');

      await new Promise(r => setTimeout(r, 150));

      const { rows } = await db.query('SELECT status FROM members WHERE id = $1', [member.id]);
      expect(rows[0].status).toBe('pending');
    });

    it('does not activate the member when PayFast validation returns INVALID', async () => {
      const member = await createMember({ tier: 'foundation', status: 'pending' });
      const { rows: [payment] } = await db.query(
        `INSERT INTO payments (member_id, amount, tier, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [member.id, 2500, 'foundation']
      );

      const pfData = {
        merchant_id: '10000100',
        m_payment_id: payment.id,
        custom_str1: member.id,
        custom_str2: 'foundation',
        payment_status: 'COMPLETE',
        amount_gross: '2500.00',
      };
      pfData.signature = pfSignature(pfData, 'test-passphrase');

      vi.spyOn(https, 'request').mockImplementation((_options, callback) => {
        const res = {
          on: vi.fn((event, handler) => {
            if (event === 'data') handler(Buffer.from('INVALID'));
            if (event === 'end') handler();
          }),
        };
        if (callback) callback(res);
        return { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      });

      await request(app)
        .post('/api/payments/webhook')
        .send(new URLSearchParams(pfData).toString())
        .set('Content-Type', 'application/x-www-form-urlencoded');

      await new Promise(r => setTimeout(r, 150));

      const { rows } = await db.query('SELECT status FROM members WHERE id = $1', [member.id]);
      expect(rows[0].status).toBe('pending');
    });
  });
});
