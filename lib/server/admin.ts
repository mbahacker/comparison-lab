import { correctRoster } from './roster-amendments.ts';
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { db, transaction } from './db.ts';
import { enqueueMail, flushOutbox } from './mail.ts';
import { hash, iso, token } from './security.ts';
import type { Row } from './model.ts';
import { policyProtocol } from './policy-automation.ts';
import { queuePolicyPreparation } from './policy-preparation.ts';

// Server-local administrative CLI. It prints no email addresses, codes, tokens, or secret review URLs.
export async function adminCommand(command: string, requestId?: string) {
  if (command === 'outbox') {
    return { counts: db().prepare('SELECT status, COUNT(*) AS count FROM outbox GROUP BY status').all(), recentFailures: db().prepare('SELECT id,attempt,next_attempt_at,last_error FROM outbox WHERE last_error IS NOT NULL ORDER BY created_at DESC LIMIT 20').all() };
  }
  if (command === 'flush-mail') return flushOutbox(25);
  if (command === 'list') {
    return db().prepare(`SELECT r.id,r.status,r.created_at,r.updated_at,r.report_slug,COALESCE(json_extract(r.protocol_json, '$.id'), json_extract(j.protocol_json, '$.id'), 'quality-pilot-v1') AS protocol,j.id AS job_id,j.attempt,j.state AS job_state,j.error FROM requests r LEFT JOIN jobs j ON j.request_id=r.id ORDER BY r.created_at DESC LIMIT 100`).all();
  }
  if (!requestId) throw new Error('A request ID is required.');
  const row = db().prepare('SELECT * FROM requests WHERE id=?').get(requestId) as Row | undefined;
  if (!row) throw new Error('Request not found.');
  if (command === 'correct-roster') return correctRoster(row.id);
  if (command === 'reissue-review') {
    if (row.review_decision) throw new Error('This request has already been reviewed.');
    transaction(() => {
      const reviewToken = token();
      db().prepare('UPDATE requests SET review_token_hash=?,review_expires_at=?,updated_at=? WHERE id=?').run(hash(reviewToken), Date.now() + 604_800_000, iso(), row.id);
      enqueueMail(`request:${row.id}:reissue:${randomUUID()}`, config().adminEmail, JSON.parse(row.providers_json).length === 1 ? 'Tool evaluation review link renewed' : 'Comparison review link renewed', `A pending request has a new seven-day review link. Opening it does not approve or start the run.\n\n${config().appUrl}/review/${reviewToken}\n\nRequest ID: ${row.id}`);
    });
    await flushOutbox();
    return { ok: true, requestId: row.id, message: 'A new review email was queued. All prior review links are invalid.' };
  }
  if (command === 'prepare-current') {
    return transaction(() => {
      const legacyJob = db().prepare('SELECT * FROM jobs WHERE request_id=?').get(row.id) as Row | undefined;
      const frozen = JSON.parse(row.protocol_json || legacyJob?.protocol_json || '{"id":"quality-pilot-v1"}');
      if (frozen.id !== 'quality-pilot-v1' || !['needs_review','failed'].includes(row.status) || !legacyJob || !['needs_review','failed'].includes(legacyJob.state)) throw new Error('Only a stopped legacy pilot can be continued as a new current-method request.');
      const providers = JSON.parse(row.providers_json);
      if (providers.some((p: Row) => p.customers.length !== 3)) throw new Error('Three original submitted storefronts are required.');
      const notes = `Continues request ${row.id} under policy-resolution-v1. Original approval and evidence are preserved; the new five-storefront scope requires approval.`;
      const existing = db().prepare('SELECT id,status FROM requests WHERE user_id=? AND notes=?').get(row.user_id, notes) as Row | undefined;
      if (existing) return {ok: true, requestId: existing.id, status: existing.status, reused: true};
      const id = randomUUID(), now = iso();
      db().prepare("INSERT INTO requests (id,user_id,providers_json,status,created_at,updated_at,review_token_hash,review_expires_at,notes,consent_at,protocol_json) VALUES (?,?,?,'researching',?,?,?,?,?,?,?)").run(id,row.user_id,row.providers_json,now,now,hash(token()),Date.now()+604800000,notes,row.consent_at,JSON.stringify(policyProtocol()));
      const user = db().prepare('SELECT * FROM users WHERE id=?').get(row.user_id) as Row;
      queuePolicyPreparation(id,providers,user);
      return {ok: true, requestId: id, status: 'researching', message: 'Created a current-method continuation. No chat testing begins before approval of all five storefronts.'};
    });
  }
  if (command === 'retry-research') {
    transaction(() => {
      const preparation = db().prepare('SELECT * FROM preparation_jobs WHERE request_id=?').get(row.id) as Row | undefined;
      if (!preparation || !['needs_review','failed'].includes(preparation.state) || row.review_decision || JSON.parse(row.providers_json).some((p: Row) => p.customers.length !== 3)) throw new Error('Only stopped, unapproved three-storefront preparation may be retried.');
      db().prepare("UPDATE preparation_jobs SET state='queued',attempt=0,available_at=?,updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,error=NULL WHERE id=?").run(Date.now(), iso(), preparation.id);
      db().prepare("UPDATE requests SET status='researching',updated_at=?,error=NULL WHERE id=?").run(iso(), row.id);
    });
    return { ok: true, requestId: row.id, message: 'Read-only storefront research is queued again. Evaluation still requires approval of all five storefronts.' };
  }
  if (command === 'retry') {
    transaction(() => {
      const job = db().prepare('SELECT * FROM jobs WHERE request_id=?').get(row.id) as Row | undefined;
      if (!job || !['needs_review', 'failed'].includes(job.state) || row.review_decision !== 'approve') throw new Error('Only an approved, stopped, unpublished run may be retried.');
      if (row.protocol_json && row.protocol_json !== job.protocol_json) throw new Error('The job does not match the frozen request protocol.');
      db().prepare("UPDATE jobs SET state='queued',attempt=0,available_at=?,updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,error=NULL WHERE id=?").run(Date.now(), iso(), job.id);
      db().prepare("UPDATE requests SET status='queued',updated_at=?,error=NULL WHERE id=?").run(iso(), row.id);
    });
    return { ok: true, requestId: row.id, message: 'The approved run is queued again with a fresh retry budget.' };
  }
  throw new Error('Commands: correct-roster REQUEST_ID, list, outbox, flush-mail, reissue-review REQUEST_ID, retry REQUEST_ID, retry-research REQUEST_ID, prepare-current REQUEST_ID');
}

if (process.argv[1]?.endsWith('/admin.ts')) {
  adminCommand(process.argv[2] || 'list', process.argv[3]).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
