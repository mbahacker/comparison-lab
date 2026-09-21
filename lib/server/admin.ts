import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { db, transaction } from './db.ts';
import { enqueueMail, flushOutbox } from './mail.ts';
import { hash, iso, token } from './security.ts';
import type { Row } from './model.ts';

// Server-local administrative CLI. It prints no email addresses, codes, tokens, or secret review URLs.
export async function adminCommand(command: string, requestId?: string) {
  if (command === 'outbox') {
    return { counts: db().prepare('SELECT status, COUNT(*) AS count FROM outbox GROUP BY status').all(), recentFailures: db().prepare('SELECT id,attempt,next_attempt_at,last_error FROM outbox WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 20').all() };
  }
  if (command === 'flush-mail') return flushOutbox(25);
  if (command === 'list') {
    return db().prepare('SELECT r.id,r.status,r.created_at,r.updated_at,r.report_slug,j.id AS job_id,j.attempt,j.state AS job_state,j.error FROM requests r LEFT JOIN jobs j ON j.request_id=r.id ORDER BY r.created_at DESC LIMIT 100').all();
  }
  if (!requestId) throw new Error('A request ID is required.');
  const row = db().prepare('SELECT * FROM requests WHERE id=?').get(requestId) as Row | undefined;
  if (!row) throw new Error('Request not found.');
  if (command === 'reissue-review') {
    if (row.review_decision) throw new Error('This request has already been reviewed.');
    transaction(() => {
      const reviewToken = token();
      db().prepare('UPDATE requests SET review_token_hash=?,review_expires_at=?,updated_at=? WHERE id=?').run(hash(reviewToken), Date.now() + 604_800_000, iso(), row.id);
      enqueueMail(`request:${row.id}:reissue:${randomUUID()}`, config().adminEmail, 'Comparison review link renewed', `A pending request has a new seven-day review link. Opening it does not approve or start the run.\n\n${config().appUrl}/review/${reviewToken}\n\nRequest ID: ${row.id}`);
    });
    await flushOutbox();
    return { ok: true, requestId: row.id, message: 'A new review email was queued. All prior review links are invalid.' };
  }
  if (command === 'retry') {
    transaction(() => {
      const job = db().prepare('SELECT * FROM jobs WHERE request_id=?').get(row.id) as Row | undefined;
      if (!job || !['needs_review', 'failed'].includes(job.state) || row.review_decision !== 'approve') throw new Error('Only an approved, stopped, unpublished run may be retried.');
      db().prepare("UPDATE jobs SET state='queued',attempt=0,available_at=?,updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,error=NULL WHERE id=?").run(Date.now(), iso(), job.id);
      db().prepare("UPDATE requests SET status='queued',updated_at=?,error=NULL WHERE id=?").run(iso(), row.id);
    });
    return { ok: true, requestId: row.id, message: 'The approved run is queued again with a fresh retry budget.' };
  }
  throw new Error('Commands: list, outbox, flush-mail, reissue-review REQUEST_ID, retry REQUEST_ID');
}

if (process.argv[1]?.endsWith('/admin.ts')) {
  adminCommand(process.argv[2] || 'list', process.argv[3]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
