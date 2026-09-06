// Resend transactional email helper.
// Sender is onboarding@resend.dev — no custom domain verification needed yet.
// The API key lives exclusively in the RESEND_API_KEY Pages secret.

export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    // Never block the build on a missing key, but make failures visible.
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ForgeHouse 50 <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `Resend error ${resp.status}` };
  }
  return { ok: true };
}

export function otpEmailHtml(code, name = '') {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hello,';
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0f1216;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:700;color:#f5f1e8;letter-spacing:0.5px;">ForgeHouse <span style="color:#c9a227;">50</span></span>
      <div style="color:#8b93a1;font-size:12px;margin-top:4px;">Read the New Testament in 50 Reading Days</div>
    </div>
    <div style="background:#171c23;border:1px solid #262d38;border-radius:14px;padding:28px 24px;">
      <p style="color:#e8e4da;font-size:15px;margin:0 0 8px;">${greeting}</p>
      <p style="color:#b6bdc9;font-size:14px;line-height:1.55;margin:0 0 20px;">
        Your ForgeHouse 50 verification code is below. It expires in <strong style="color:#e8e4da;">10 minutes</strong>.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;color:#c9a227;background:#0f1216;border:1px solid #2c3542;border-radius:12px;padding:14px 24px 14px 34px;">${code}</span>
      </div>
      <p style="color:#8b93a1;font-size:12px;line-height:1.5;margin:20px 0 0;">
        If you didn't create a ForgeHouse 50 account, you can safely ignore this email.
      </p>
    </div>
    <p style="color:#5c6470;font-size:11px;text-align:center;margin:20px 0 0;">
      Verification emails are sent via Resend. &copy; ForgeHouse Global.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
