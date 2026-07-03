const TIER_LABELS = { foundation: 'Foundation', practitioner: 'Practitioner', elite: 'Elite KI Circle' };

function paymentSuccessHtml(member, payment) {
  const tierLabel = TIER_LABELS[payment.tier] || payment.tier;
  const amountFormatted = `R${parseFloat(payment.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F9F8F5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:white;
  border-radius:4px;border:1px solid #E5E0D5;overflow:hidden">

  <tr><td style="background:#1F3864;padding:32px;border-bottom:3px solid #C9A84C">
    <span style="font-family:Georgia,serif;font-size:22px;color:white;font-weight:700">
      Praeto Compliance Club
    </span>
  </td></tr>

  <tr><td style="padding:36px 32px">
    <!-- Success icon -->
    <div style="text-align:center;margin-bottom:28px">
      <div style="width:64px;height:64px;background:#DCFCE7;border-radius:50%;
        display:inline-flex;align-items:center;justify-content:center;font-size:32px;
        line-height:64px;text-align:center">✓</div>
    </div>

    <h2 style="font-family:Georgia,serif;font-size:24px;color:#1F3864;margin:0 0 12px;text-align:center">
      Payment Confirmed
    </h2>
    <p style="font-size:15px;color:#374151;line-height:1.75;text-align:center;margin:0 0 28px">
      Your <strong>${tierLabel} Membership</strong> is now active. Welcome to South Africa's
      most trusted FSP compliance network.
    </p>

    <!-- Receipt box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F5;border:1px solid #E5E0D5;
      border-radius:4px;margin-bottom:28px">
      <tr><td style="padding:20px 24px">
        <div style="font-family:'Courier New',monospace;font-size:10px;color:#C9A84C;letter-spacing:0.15em;
          text-transform:uppercase;margin-bottom:14px">Payment Receipt</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#6B7280;padding:5px 0;border-bottom:1px solid #E5E0D5">Member</td>
            <td style="font-size:13px;color:#111827;font-weight:600;text-align:right;padding:5px 0;border-bottom:1px solid #E5E0D5">${member.full_name}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#6B7280;padding:5px 0;border-bottom:1px solid #E5E0D5">Membership Tier</td>
            <td style="font-size:13px;color:#111827;text-align:right;padding:5px 0;border-bottom:1px solid #E5E0D5">${tierLabel}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#6B7280;padding:5px 0;border-bottom:1px solid #E5E0D5">Billing</td>
            <td style="font-size:13px;color:#111827;text-align:right;padding:5px 0;border-bottom:1px solid #E5E0D5">Monthly recurring</td>
          </tr>
          <tr>
            <td style="font-size:15px;font-weight:700;color:#1F3864;padding:8px 0 0">Amount Paid</td>
            <td style="font-size:15px;font-weight:700;color:#1F3864;text-align:right;padding:8px 0 0">${amountFormatted}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 24px">
      Your membership portal is ready. Access all your compliance resources, CPD modules,
      templates, and the AI Compliance Advisor below.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr><td style="background:#C9A84C;border-radius:3px">
        <a href="https://www.praeto.co.za/portal" style="display:inline-block;padding:14px 28px;
          color:#1F3864;font-size:14px;font-weight:700;text-decoration:none">
          Access Member Portal →
        </a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#9CA3AF">
      Prices exclude VAT. Your next monthly payment will be processed automatically by PayFast.
      To manage your subscription, contact us at
      <a href="mailto:members@praeto.co.za" style="color:#1F3864">members@praeto.co.za</a>
    </p>
  </td></tr>

  <tr><td style="background:#1F3864;padding:24px 32px">
    <p style="font-family:'Courier New',monospace;font-size:10px;color:rgba(255,255,255,0.4);margin:0;line-height:1.8">
      Praeto Compliance Club · FSP 1457 · Durban, KwaZulu-Natal
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

module.exports = { paymentSuccessHtml };
