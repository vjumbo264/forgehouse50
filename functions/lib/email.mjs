// Transactional email helper — Brevo (https://api.brevo.com/v3/smtp/email).
//
// Sender is the verified single sender "Forgehouse 50 <vjumbo264@gmail.com>",
// verified in Brevo (no domain authentication required for a single sender).
// The Brevo API key lives exclusively in the BREVO_API_KEY Pages secret.

const SENDER_EMAIL = 'vjumbo264@gmail.com';
const SENDER_NAME = 'Forgehouse 50';

export async function sendEmail(env, { to, subject, html }) {
  if (!env.BREVO_API_KEY) {
    // Never block the build on a missing key, but make failures visible.
    return { ok: false, error: 'BREVO_API_KEY not configured' };
  }
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!resp.ok) {
    // Read but do not expose upstream body text to callers — surface the status only.
    await resp.text().catch(() => '');
    return { ok: false, error: `Brevo error ${resp.status}` };
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
      Sent from ForgeHouse 50. &copy; ForgeHouse Global.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
