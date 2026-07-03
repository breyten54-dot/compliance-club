const sgMail = require('@sendgrid/mail');
const config = require('../config');
const { welcomeHtml } = require('./templates/welcome');
const { alertHtml } = require('./templates/alert');
const { paymentSuccessHtml } = require('./templates/payment-success');
const { passwordResetHtml } = require('./templates/password-reset');

sgMail.setApiKey(config.sendgrid.apiKey);

const FROM = {
  email: config.sendgrid.from,
  name: config.sendgrid.fromName,
};

async function send(to, subject, html) {
  if (!config.sendgrid.apiKey || config.sendgrid.apiKey.startsWith('SG.REPLACE')) {
    console.log(`[EMAIL STUB] To: ${typeof to === 'string' ? to : to.length + ' recipients'} | Subject: ${subject}`);
    return;
  }

  const msg = {
    to,
    from: FROM,
    subject,
    html,
  };

  await sgMail.send(msg);
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
     <p><a href="${config.frontendUrl}/app/#/admin">View in Admin Panel</a></p>`
  );
}

async function sendPasswordResetEmail(member, token) {
  const resetUrl = `${config.frontendUrl}/app/#/portal/reset-password?token=${token}`;
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
  const personalizations = members.map(m => ({ to: [{ email: m.email, name: m.full_name }] }));

  // SendGrid batch: max 1000 personalizations per request
  for (let i = 0; i < personalizations.length; i += 1000) {
    const batch = personalizations.slice(i, i + 1000);
    if (!config.sendgrid.apiKey || config.sendgrid.apiKey.startsWith('SG.REPLACE')) {
      console.log(`[EMAIL STUB] Alert batch to ${batch.length} members: ${alert.title}`);
      continue;
    }
    await sgMail.send({
      from: FROM,
      subject: `[COMPLIANCE ALERT] ${alert.title}`,
      html,
      personalizations: batch,
    });
  }
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

  const personalizations = recipients.map(m => ({ to: [{ email: m.email, name: m.full_name }] }));

  for (let i = 0; i < personalizations.length; i += 1000) {
    const batch = personalizations.slice(i, i + 1000);
    await send(batch.map(p => p.to[0]), subject, html);
  }
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPaymentSuccessEmail,
  sendAlertEmail,
  sendBroadcastEmail,
};
