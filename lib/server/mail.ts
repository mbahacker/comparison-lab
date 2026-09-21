import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { db, transaction } from './db.ts';
import { iso } from './security.ts';
import type { Row } from './model.ts';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

// Only errors constructed here are safe to retain in operator-facing diagnostics.
class MailDeliveryError extends Error {}

export function sendGridSender(value: string): { email: string; name?: string } {
  const invalid = () => new MailDeliveryError('MAIL_FROM must contain one email address, optionally preceded by a display name in angle-bracket format.');
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) throw invalid();
  const sender = value.trim();
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(sender);
  const email = (match ? match[2] : sender).trim();
  if (!/^[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+$/.test(email)) throw invalid();
  let name = match?.[1].trim();
  if (name?.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).trim();
  if (name && /[<>]/.test(name)) throw invalid();
  return name ? { email, name } : { email };
}

export function enqueueMail(eventKey: string, recipient: string, subject: string, body: string) {
  const id = randomUUID();
  const lineHtml = (line: string) => {
    // Only first-party generated links become clickable. Requester-provided URLs remain text.
    if (line.startsWith(`${config().appUrl}/`)) {
      try {
        const url = new URL(line);
        if (url.origin === new URL(config().appUrl).origin && /^\/(?:review|requests|reports)\/[a-zA-Z0-9_-]+$/.test(url.pathname) && !url.search && !url.hash) return `<a href="${escapeHtml(url.href)}">${escapeHtml(line)}</a>`;
      } catch { /* Render invalid URLs as plain escaped text. */ }
    }
    return escapeHtml(line);
  };
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;line-height:1.6;color:#142131"><h2>Comparison Lab</h2>${body.split('\n\n').map(p => `<p>${p.split('\n').map(lineHtml).join('<br>')}</p>`).join('')}<p style="color:#69727c;font-size:12px">This is a transactional message about your Comparison Lab request.</p></div>`;
  db().prepare('INSERT OR IGNORE INTO outbox (id,event_key,recipient,subject,text_body,html_body,next_attempt_at,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, eventKey, recipient, subject, body, html, Date.now(), iso());
  return id;
}

// The dedicated mail daemon drains this queue. Authentication may dispatch its own OTP directly.
export async function flushOutbox(limit = 5, onlyId?: string) {
  const results: { id: string; sent: boolean }[] = [];
  for (let i = 0; i < limit; i++) {
    const row = transaction(() => {
      const now = Date.now();
      const selected = onlyId
        ? db().prepare("SELECT * FROM outbox WHERE id=? AND ((status='pending' AND next_attempt_at <= ?) OR (status='sending' AND lease_until < ?)) LIMIT 1").get(onlyId, now, now) as Row | undefined
        : db().prepare("SELECT * FROM outbox WHERE (status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_until < ?) ORDER BY created_at LIMIT 1").get(now, now) as Row | undefined;
      if (!selected) return null;
      db().prepare("UPDATE outbox SET status='sending', lease_until=?, attempt=attempt+1 WHERE id=?").run(now + 120_000, selected.id);
      return selected;
    });
    if (!row) break;
    try {
      const c = config();
      if (c.mailTransport === 'file') {
        if (c.production) throw new MailDeliveryError('File email transport is disabled in production.');
        const directory = path.join(c.dataDir, 'mail');
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const filename = path.join(directory, `${row.id}.json`);
        fs.writeFileSync(filename, JSON.stringify({ id: row.id, from: c.mailFrom, to: row.recipient, subject: row.subject, text: row.text_body, html: row.html_body, developmentOnly: true }, null, 2), { mode: 0o600 });
      } else if (c.mailTransport === 'sendgrid') {
        if (!c.sendgridKey) throw new MailDeliveryError('SendGrid is not configured.');
        const from = sendGridSender(c.mailFrom);
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          redirect: 'error',
          headers: { authorization: `Bearer ${c.sendgridKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from,
            personalizations: [{ to: [{ email: row.recipient }], custom_args: { outbox_id: row.id } }],
            subject: row.subject,
            content: [{ type: 'text/plain', value: row.text_body }, { type: 'text/html', value: row.html_body }],
            // Approval links are bearer capabilities. Preserve their URLs and avoid tracking pixels.
            tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        // A 202 means provider acceptance, not confirmed inbox delivery. custom_args only
        // correlates retries; SendGrid does not deduplicate these requests by outbox ID.
        if (response.status !== 202) throw new MailDeliveryError(`Email delivery returned HTTP ${response.status}.`);
      } else if (c.mailTransport === 'resend') {
        if (!c.resendKey) throw new MailDeliveryError('Resend is not configured.');
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${c.resendKey}`, 'content-type': 'application/json', 'idempotency-key': row.id },
          body: JSON.stringify({ from: c.mailFrom, to: [row.recipient], subject: row.subject, text: row.text_body, html: row.html_body }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new MailDeliveryError(`Email delivery returned HTTP ${response.status}.`);
      } else throw new MailDeliveryError('Unsupported email transport.');
      db().prepare("UPDATE outbox SET status='sent', sent_at=?, lease_until=NULL, last_error=NULL WHERE id=?").run(iso(), row.id);
      results.push({ id: row.id, sent: true });
    } catch (error) {
      const delay = Math.min(3_600_000, 30_000 * 2 ** Math.min(row.attempt, 7));
      db().prepare("UPDATE outbox SET status='pending', next_attempt_at=?, lease_until=NULL, last_error=? WHERE id=?").run(Date.now() + delay, error instanceof MailDeliveryError ? error.message : 'Email delivery failed. Check transport connectivity and provider configuration.', row.id);
      results.push({ id: row.id, sent: false });
    }
  }
  return results;
}
