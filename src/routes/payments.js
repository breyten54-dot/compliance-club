const express = require('express');
const crypto = require('crypto');
const https = require('https');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const config = require('../config');
const { sendPaymentSuccessEmail } = require('../email/sendgrid');

const router = express.Router();

const TIER_NAMES = {
  foundation:   'Foundation Membership',
  practitioner: 'Practitioner Membership',
  elite:        'Elite KI Circle Membership',
};

// ─── Signature helpers ───────────────────────────────────────────────────────

function pfParamString(data) {
  return Object.keys(data)
    .filter(k => k !== 'signature' && data[k] !== '' && data[k] != null)
    .sort()
    .map(k => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, '+')}`)
    .join('&');
}

function pfSignature(data, passphrase) {
  let str = pfParamString(data);
  if (passphrase) str += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

function pfValidate(pfData) {
  return new Promise((resolve, reject) => {
    const postData = pfParamString(pfData);
    const options = {
      host: config.payfast.validateHost,
      port: 443,
      path: '/eng/query/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body.trim().toUpperCase() === 'VALID'));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ─── POST /api/payments/checkout ─────────────────────────────────────────────
// Returns the PayFast form fields so the frontend can POST to PayFast
router.post('/checkout', requireAuth, async (req, res) => {
  const member = req.member;
  const { tier } = req.body;

  if (!['foundation', 'practitioner', 'elite'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid membership tier.' });
  }

  const amount = config.prices[tier];
  const itemName = TIER_NAMES[tier];

  // Create a pending payment record
  const { rows: [payment] } = await db.query(
    `INSERT INTO payments (member_id, amount, tier, status)
     VALUES ($1, $2, $3, 'pending') RETURNING id`,
    [member.id, amount, tier]
  );

  const pfData = {
    merchant_id:  config.payfast.merchantId,
    merchant_key: config.payfast.merchantKey,
    return_url:   `${config.frontendUrl}/app/#/portal?payment=success`,
    cancel_url:   `${config.frontendUrl}/app/#/portal?payment=cancelled`,
    notify_url:   `${config.baseUrl}/api/payments/webhook`,
    name_first:   member.full_name.split(' ')[0],
    name_last:    member.full_name.split(' ').slice(1).join(' ') || '',
    email_address: member.email,
    m_payment_id: payment.id,
    amount:       amount.toFixed(2),
    item_name:    itemName,
    item_description: `Praeto Compliance Club — ${itemName}`,
    custom_str1:  member.id,
    custom_str2:  tier,
    // Recurring billing
    subscription_type: 1,
    billing_date: new Date().toISOString().split('T')[0],
    recurring_amount: amount.toFixed(2),
    frequency: 3, // Monthly
    cycles: 0,    // Infinite
  };

  pfData.signature = pfSignature(pfData, config.payfast.passphrase);

  res.json({
    endpoint: config.payfast.endpoint,
    fields: pfData,
  });
});

// ─── POST /api/payments/webhook (PayFast ITN) ────────────────────────────────
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  // Respond 200 immediately to acknowledge receipt
  res.status(200).end();

  const pfData = req.body;

  try {
    // 1. Verify signature
    const receivedSig = pfData.signature;
    const computedSig = pfSignature(pfData, config.payfast.passphrase);
    if (receivedSig !== computedSig) {
      console.error('PayFast ITN: signature mismatch');
      return;
    }

    // 2. Validate with PayFast servers
    const isValid = await pfValidate(pfData).catch(() => false);
    if (!isValid) {
      console.error('PayFast ITN: remote validation failed');
      return;
    }

    const paymentId  = pfData.m_payment_id;
    const memberId   = pfData.custom_str1;
    const tier       = pfData.custom_str2;
    const pfPayId    = pfData.pf_payment_id;
    const pfStatus   = pfData.payment_status; // 'COMPLETE' | 'FAILED' | 'CANCELLED'
    const amount     = parseFloat(pfData.amount_gross);

    // 3. Update payment record
    await db.query(
      `UPDATE payments
       SET status = $1, payfast_payment_id = $2, payfast_pf_payment_id = $3,
           payment_date = NOW(), itn_raw = $4
       WHERE id = $5`,
      [
        pfStatus === 'COMPLETE' ? 'complete' : pfStatus.toLowerCase(),
        pfPayId,
        pfPayId,
        JSON.stringify(pfData),
        paymentId,
      ]
    );

    if (pfStatus === 'COMPLETE') {
      // 4. Activate membership
      await db.query(
        `UPDATE members SET status = 'active', tier = $1, updated_at = NOW() WHERE id = $2`,
        [tier, memberId]
      );

      // 5. Send payment success email
      const { rows } = await db.query(
        'SELECT email, full_name FROM members WHERE id = $1',
        [memberId]
      );
      if (rows.length) {
        sendPaymentSuccessEmail(rows[0], { tier, amount }).catch(err =>
          console.error('Payment email failed:', err)
        );
      }
    }
  } catch (err) {
    console.error('PayFast ITN processing error:', err);
  }
});

// ─── GET /api/payments/history ───────────────────────────────────────────────
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, amount, tier, status, payment_date, created_at
       FROM payments WHERE member_id = $1 ORDER BY created_at DESC`,
      [req.member.id]
    );
    res.json({ payments: rows });
  } catch (err) {
    console.error('Payment history error:', err);
    res.status(500).json({ error: 'Failed to fetch payment history.' });
  }
});

module.exports = router;
