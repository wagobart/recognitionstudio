// Outgoing email through Resend (https://resend.com). Secret RESEND_API_KEY; sender MAIL_FROM
// (must be on a domain verified in Resend).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function sendMail(env, { to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Crafted In Honor <noreply@craftedinhonor.com>', to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export function resetEmail(link) {
  const subject = 'Reset your Crafted In Honor password';
  const text = `Someone (hopefully you) asked to reset the password for your Crafted In Honor account.

Set a new password here (the link works for 1 hour, once):
${link}

If you didn't ask for this, you can ignore this email — your password won't change.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6dfd2;border-radius:14px">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:700;color:#1e3a5f">Crafted <span style="color:#a9802f">In Honor</span></td></tr>
<tr><td style="padding:8px 28px;font-size:16px;line-height:1.5">Someone (hopefully you) asked to reset the password for your account. Tap the button to choose a new one.</td></tr>
<tr><td style="padding:16px 28px"><a href="${esc(link)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 22px;border-radius:10px">Set a new password</a></td></tr>
<tr><td style="padding:4px 28px 26px;font-size:13.5px;line-height:1.5;color:#6b6f7b">The link works once, for 1 hour. If you didn't ask for this, ignore this email — your password won't change.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
