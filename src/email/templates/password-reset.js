function passwordResetHtml(member, resetUrl) {
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
    <h2 style="font-family:Georgia,serif;font-size:22px;color:#1F3864;margin:0 0 16px">
      Reset Your Password
    </h2>
    <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 20px">
      Hi ${member.full_name.split(' ')[0]}, we received a request to reset the password
      for your Praeto Compliance Club account.
    </p>
    <p style="font-size:15px;color:#374151;line-height:1.75;margin:0 0 28px">
      Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr><td style="background:#C9A84C;border-radius:3px">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;
          color:#1F3864;font-size:14px;font-weight:700;text-decoration:none">
          Reset Password →
        </a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#6B7280;line-height:1.7;margin:0 0 8px">
      If the button doesn't work, copy and paste this URL into your browser:
    </p>
    <p style="font-size:12px;color:#9CA3AF;word-break:break-all;margin:0 0 24px">
      ${resetUrl}
    </p>

    <p style="font-size:13px;color:#9CA3AF">
      If you did not request a password reset, you can safely ignore this email.
      Your password will not be changed.
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

module.exports = { passwordResetHtml };
