const SEVERITY_COLORS = {
  critical: '#EF4444',
  warning:  '#F59E0B',
  info:     '#3B82F6',
};

function alertHtml(alert) {
  const color = SEVERITY_COLORS[alert.severity] || '#3B82F6';
  const severityLabel = alert.severity?.toUpperCase() || 'INFO';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F9F8F5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F8F5;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:white;
  border-radius:4px;border:1px solid #E5E0D5;overflow:hidden">

  <tr><td style="background:#1F3864;padding:24px 32px;border-bottom:3px solid #C9A84C">
    <table width="100%"><tr>
      <td><span style="font-family:Georgia,serif;font-size:18px;color:white;font-weight:700">
        Praeto Compliance Club
      </span></td>
      <td align="right">
        <span style="background:${color};color:white;font-family:'Courier New',monospace;
          font-size:10px;font-weight:700;letter-spacing:0.1em;padding:4px 10px;border-radius:2px">
          ${severityLabel}
        </span>
      </td>
    </tr></table>
  </td></tr>

  <!-- Alert bar -->
  <tr><td style="background:${color};padding:3px 0"></td></tr>

  <tr><td style="padding:32px">
    <div style="font-family:'Courier New',monospace;font-size:10px;color:#C9A84C;letter-spacing:0.15em;
      text-transform:uppercase;margin-bottom:12px">
      Compliance Alert · ${alert.category || 'FSCA'} · ${new Date(alert.published_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
    </div>

    <h2 style="font-family:Georgia,serif;font-size:22px;color:#1F3864;margin:0 0 16px;line-height:1.3">
      ${alert.title}
    </h2>

    ${alert.summary ? `<p style="font-size:15px;color:#374151;font-weight:600;line-height:1.6;
      border-left:3px solid ${color};padding-left:14px;margin:0 0 20px">
      ${alert.summary}
    </p>` : ''}

    <p style="font-size:15px;color:#374151;line-height:1.8;margin:0 0 24px">
      ${alert.body.replace(/\n/g, '<br>')}
    </p>

    <table cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr><td style="background:#C9A84C;border-radius:3px">
        <a href="https://www.praeto.co.za/portal/alerts" style="display:inline-block;
          padding:12px 24px;color:#1F3864;font-size:14px;font-weight:700;text-decoration:none">
          View Full Alert in Portal →
        </a>
      </td></tr>
    </table>

    <p style="font-size:12px;color:#9CA3AF">
      This alert was issued by Praeto Compliance Club (FSP 1457). It is provided for informational
      purposes. Members should refer to the original gazette or regulation for definitive guidance.
    </p>
  </td></tr>

  <tr><td style="background:#1F3864;padding:20px 32px">
    <p style="font-family:'Courier New',monospace;font-size:10px;color:rgba(255,255,255,0.4);margin:0;line-height:1.8">
      Praeto Compliance Club · FSP 1457 · Durban, KwaZulu-Natal<br>
      <a href="https://www.praeto.co.za/portal/settings" style="color:rgba(201,168,76,0.7)">Manage notification preferences</a>
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

module.exports = { alertHtml };
