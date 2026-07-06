// Email delivery module. Despite the filename (kept so existing requires work),
// this supports two providers, picked by which env var is set:
//   RESEND_API_KEY   → Resend REST API (free tier: 3,000 emails/month)
//   SENDGRID_API_KEY → SendGrid
// With neither configured, sends are logged to the console as stubs so the
// rest of the app keeps working.
const sgMail = require('@sendgrid/mail');
const config = require('../config');
const { welcomeHtml } = require('./templates/welcome');
const { alertHtml } = require('./templates/alert');
const { paymentSuccessHtml } = require('./templates/payment-success');
const { passwordResetHtml } = require('./templates/password-reset');

if (config.sendgrid.apiKey) sgMail.setApiKey(config.sendgrid.apiKey);

const FROM = {
  email: config.sendgrid.from,
  name: config.sendgrid.fromName,
};

const sendgridConfigured = () =>
  config.sendgrid.apiKey && !config.sendgrid.apiKey.startsWith('SG.REPLACE');

/**
 * Deliver one email per recipient (recipients never see each other's address).
 * @param {Array<{email: string, name?: string}>} recipients
 */
async function deliver(recipients, subject, html) {
  if (!recipients.length) return;

  if (config.resend.apiKey) {
    // Resend batch endpoint: max 100 emails per request
    for (let i = 0; i < recipients.length; i += 100) {
      const batch = recipients.slice(i, i + 100).map(r => ({
        from: `${FROM.name} <${FROM.email}>`,
        to: [r.email],
        subject,
        html,
      }));
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resend.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend API error ${res.status}: ${body}`);
      }
    }
    return;
  }

  if (sendgridConfigured()) {
    // SendGrid personalizations: max 1000 per request
    const personalizations = recipients.map(r => ({
      to: [{ email: r.email, name: r.name || undefined }],
    }));
    for (let i = 0; i < personalizations.length; i += 1000) {
      await sgMail.send({
        from: FROM,
        subject,
        html,
        personalizations: personalizations.slice(i, i + 1000),
      });
    }
    return;
  }

  console.log(`[EMAIL STUB] To: ${recipients.length === 1 ? recipients[0].email : recipients.length + ' recipients'} | Subject: ${subject}`);
}

async function send(to, subject, html) {
  await deliver([{ email: to }], subject, html);
}

async function sendWelcomeEmail(member) {
  const html = welcomeHtml(member);
  await send(member.email, 'Welcome to Praeto Compliance Club', html);

  // Also notify admin
  await send(config.sendgrid.adminEmail,
    `New Application: ${member.full_name} (${member.tier})`,
    `<p>New membership application from <strong>${member.full_name}</strong>
     (${member.email}) for the <strong>${member.tier}</strong> tier.<br>
     FSP Licence: ${member.fsp_licence || 'Not provided'}</p>
     <p><a href="${config.frontendUrl}/admin">View in Admin Panel</a></p>`
  );
}

async function sendPasswordResetEmail(member, token) {
  const resetUrl = `${config.frontendUrl}/portal/reset-password?token=${token}`;
  const html = passwordResetHtml(member, resetUrl);
  await send(member.email, 'Reset Your Praeto Password', html);
}

async function sendPaymentSuccessEmail(member, payment) {
  const html = paymentSuccessHtml(member, payment);
  await send(member.email, `Payment Confirmed — ${member.tier ? member.tier.charAt(0).toUpperCase() + member.tier.slice(1) : ''} Membership Activated`, html);
}

async function sendAlertEmail(members, alert) {
  if (!members.length) return;
  const html = alertHtml(alert);
  await deliver(
    members.map(m => ({ email: m.email, name: m.full_name })),
    `[COMPLIANCE ALERT] ${alert.title}`,
    html
  );
}

async function sendBroadcastEmail(recipients, subject, body) {
  if (!recipients.length) return;
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
    <body style="font-family:Arial,sans-serif;background:#F9F8F5;padding:40px 20px">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:4px;overflow:hidden;
      border:1px solid #E5E0D5">
      <div style="background:#1F3864;padding:28px 32px;border-bottom:3px solid #C9A84C">
        <span style="font-family:Georgia,serif;font-size:20px;color:white;font-weight:700">
          Praeto Compliance Club
        </span>
      </div>
      <div style="padding:32px">
        <div style="font-size:15px;color:#374151;line-height:1.75">${body.replace(/\n/g, '<br>')}</div>
      </div>
      <div style="background:#F9F8F5;padding:20px 32px;border-top:1px solid #E5E0D5;
        font-size:11px;color:#9CA3AF">
        Praeto Compliance Club · FSP 1457 · Durban, KwaZulu-Natal<br>
        <a href="${config.baseUrl}/portal" style="color:#C9A84C">Member Portal</a>
      </div>
    </div></body></html>`;

  await deliver(
    recipients.map(m => ({ email: m.email, name: m.full_name })),
    subject,
    html
  );
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPaymentSuccessEmail,
  sendAlertEmail,
  sendBroadcastEmail,
};
