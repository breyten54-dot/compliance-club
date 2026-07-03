const TIER_LABELS = {
  foundation: 'Foundation — R2,500/month',
  practitioner: 'Practitioner — R5,000/month',
  elite: 'Elite KI Circle — R15,000/month',
};

function welcomeHtml(member) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body style="margin:0;padding:0;background:#F9F8F5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:white;
  border-radius:4px;border:1px solid #E5E0D5;overflow:hidden">

  <!-- Header -->
  <tr><td style="background:#1F3864;padding:32px;border-bottom:3px solid #C9A84C">
    <span style="font-family:Georgia,serif;font-size:22px;color:white;font-weight:700;display:block;margin-bottom:4px">
      Praeto Compliance Club
    </span>
    <span style="font-family:'Courier New',monospace;font-size:10px;color:#C9A84C;letter-spacing:0.15em;text-transform:uppercase">
      FSP 1457 · EST. 2005
    </span>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:36px 32px">
    <h2 style="font-family:Georgia,serif;font-size:24px;color:#1F3864;margin:0 0 16px">
      Welcome, ${member.full_name.split(' ')[0]}. Your application has been received.
    </h2>
    <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 20px">
      Thank you for applying to join the <strong>Praeto Compliance Club</strong>.
      Your application for the <strong>${TIER_LABELS[member.tier] || member.tier}</strong> membership
      is currently under review.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 24px">
      Berkeley or a member of the Praeto team will contact you at this address within
      <strong>2 business hours</strong> to complete your onboarding and activate your membership.
    </p>

    <!-- Details box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F5;border:1px solid #E5E0D5;
      border-radius:4px;margin-bottom:28px">
      <tr><td style="padding:20px 24px">
        <div style="font-family:'Courier New',monospace;font-size:10px;color:#C9A84C;letter-spacing:0.15em;
          text-transform:uppercase;margin-bottom:12px">Application Summary</div>
        <table cellpadding="0" cellspacing="0">
          <tr><td style="font-size:13px;color:#6B7280;padding:4px 0 4px;width:130px">Name:</td>
              <td style="font-size:13px;color:#111827;font-weight:600">${member.full_name}</td></tr>
          <tr><td style="font-size:13px;color:#6B7280;padding:4px 0 4px">Email:</td>
              <td style="font-size:13px;color:#111827">${member.email}</td></tr>
          <tr><td style="font-size:13px;color:#6B7280;padding:4px 0 4px">Tier:</td>
              <td style="font-size:13px;color:#111827">${TIER_LABELS[member.tier] || member.tier}</td></tr>
          ${member.fsp_licence ? `<tr><td style="font-size:13px;color:#6B7280;padding:4px 0 4px">FSP Licence:</td>
              <td style="font-size:13px;color:#111827">${member.fsp_licence}</td></tr>` : ''}
        </table>
      </td></tr>
    </table>

    <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 24px">
      While you wait, you can explore the member portal where your compliance resources will be available once your membership is activated.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr><td style="background:#C9A84C;border-radius:3px">
        <a href="https://www.praeto.co.za/portal" style="display:inline-block;padding:14px 28px;
          color:#1F3864;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em">
          Access Member Portal →
        </a>
      </td></tr>
    </table>

    <p style="font-size:14px;color:#6B7280;line-height:1.7">
      Questions? Reply to this email or contact Berkeley directly at
      <a href="mailto:berkeley@praeto.co.za" style="color:#1F3864">berkeley@praeto.co.za</a>
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1F3864;padding:24px 32px">
    <p style="font-family:'Courier New',monospace;font-size:10px;color:rgba(255,255,255,0.4);
      line-height:1.8;margin:0">
      Praeto Compliance Club · Praeto Group Holdings<br>
      FSP Licence: 1457 (Category I) · TETA: 06-157<br>
      Durban, KwaZulu-Natal · South Africa
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

module.exports = { welcomeHtml };
