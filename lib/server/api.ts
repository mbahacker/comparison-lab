import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, readiness } from './config.ts';
import { db, transaction } from './db.ts';
import { ApiError, type ComparisonRequest, type Row, type User } from './model.ts';
import { hash, iso, multilineText, otp, otpDigest, providersInput, rateLimit, requireOrigin, requireReportOrigin, requireUser, requireWorker, safeEqual, sessionCookie, sessionUser, text, token, workEmail, workEmailEligible, SESSION_COOKIE } from './security.ts';
import { enqueueMail, flushOutbox } from './mail.ts';
import { getReport, listReports, protocol, reportSummary, SEED_SLUG, validateEvidence } from './evidence.ts';
import { getProviderCatalog, planReuse, resolveReuse } from './reuse.ts';

const privateHeaders = { 'cache-control': 'private, no-store', vary: 'Cookie' };
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...privateHeaders, 'x-content-type-options': 'nosniff', ...headers } });
const userView = (user: User) => ({ ...user, workEmailEligible: workEmailEligible(user.email) });

async function body(request: Request, maxBytes = 32_000): Promise<Row> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Use application/json.');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new ApiError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'Invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(400, 'A JSON object is required.');
  return parsed;
}

function requestView(row: Row): ComparisonRequest {
  return { id: row.id, status: row.status, providers: JSON.parse(row.providers_json), createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at, reviewNote: row.review_note, reportSlug: row.report_slug, error: row.error, notes: row.notes || null };
}
function requestRow(id: string) {
  const row = db().prepare('SELECT * FROM requests WHERE id = ?').get(id) as Row | undefined;
  if (!row) throw new ApiError(404, 'Request not found.');
  return row;
}
function ownerRequest(id: string, userId: string) {
  const row = db().prepare('SELECT * FROM requests WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  if (!row) throw new ApiError(404, 'Request not found.');
  return row;
}
function requestTitle(row: Row) { return JSON.parse(row.providers_json).map((p: Row) => p.name).join(' vs. '); }
function requester(row: Row) { return db().prepare('SELECT id, name, email FROM users WHERE id = ?').get(row.user_id) as Row; }
function statusUrl(id: string) { return `${config().appUrl}/requests/${id}`; }
function slugPart(value: string) { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'company'; }

function reuseView(plan: Row) {
  return { reusedConversations: plan.reusedConversations, newConversations: plan.newConversations, reusedStores: plan.reusedStores, newStores: plan.newStores, sources: plan.sources,
    ...(plan.exactReport ? { existingReport: plan.exactReport } : {}), ...(plan.previousReport ? { previousReport: plan.previousReport } : {}), maximumAgeDays: 30 };
}
function linkExistingReport(row: Row, report: Row, jobId?: string) {
  const now = iso(); const user = requester(row);
  db().prepare("UPDATE requests SET status='published',report_slug=?,updated_at=?,error=NULL WHERE id=?").run(report.slug, now, row.id);
  if (jobId) db().prepare("UPDATE jobs SET state='published',updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,error=NULL WHERE id=?").run(now, jobId);
  enqueueMail(`request:${row.id}:existing-report`, user.email, `Your comparison is already available: ${report.title}`, `Hi ${user.name},\n\nThis comparison already has compatible published analysis captured within the last 30 days. No duplicate evaluation was started.\n\nRead the report:\n${config().appUrl}/reports/${report.slug}\n\nOriginal capture dates and limitations are preserved in the evidence. Your verified work email gives you access to the detailed report.\n\nAlhena Research Lab`);
}

function activeLease(input: Row) {
  const job = db().prepare('SELECT * FROM jobs WHERE id = ?').get(typeof input.jobId === 'string' ? input.jobId : '') as Row | undefined;
  if (!job || job.state !== 'running' || !Number.isInteger(input.fencingToken) || job.fencing_token !== input.fencingToken || typeof input.leaseToken !== 'string' || !safeEqual(job.lease_token_hash || '', hash(input.leaseToken)) || job.lease_expires_at <= Date.now()) throw new ApiError(409, 'This job lease is no longer active.');
  return job;
}

async function startAuth(request: Request) {
  if (!readiness().emailConfigured || !readiness().publicUrlConfigured) throw new ApiError(503, 'Email verification is not configured yet. Please try again after the service is connected.');
  const input = await body(request);
  if (input.purpose !== undefined && !['report', 'request'].includes(input.purpose)) throw new ApiError(400, 'Choose report access or a comparison request.');
  const reportAccess = input.purpose === 'report';
  const email = workEmail(input.email);
  const name = reportAccess && (input.name === undefined || input.name === null || input.name === '') ? '' : text(input.name, 'Name', 2, 120);
  transaction(() => { rateLimit(`otp-email:${email}`, 3, 900_000); rateLimit('otp-global', 100, 3_600_000); });
  const code = otp(); const salt = token(); const now = Date.now();
  const mailId = transaction(() => {
    db().prepare('INSERT INTO otp_challenges (email,name,digest,salt,expires_at,attempts,created_at,consumed_at) VALUES (?,?,?,?,?,0,?,NULL) ON CONFLICT(email) DO UPDATE SET name=excluded.name,digest=excluded.digest,salt=excluded.salt,expires_at=excluded.expires_at,attempts=0,created_at=excluded.created_at,consumed_at=NULL').run(email, name, otpDigest(code, salt), salt, now + 600_000, now);
    return enqueueMail(`verify:${randomUUID()}`, email, 'Your Alhena Research Lab verification code', `Hi${name ? ` ${name}` : ''},\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes. Enter it in the browser where you requested it. If you did not request this code, you can ignore this message.\n\nAlhena Research Lab verifies mailbox ownership. It does not certify employment or endorse a company.`);
  });
  await flushOutbox(1, mailId);
  const sent = (db().prepare('SELECT status FROM outbox WHERE id = ?').get(mailId) as Row)?.status === 'sent';
  return json({ ok: true, delivery: config().mailTransport === 'file' ? 'development-file' : sent ? 'sent' : 'queued', message: config().mailTransport === 'file' ? 'Development mode: the code was saved in the local mail outbox.' : sent ? 'Check your work email for a six-digit code.' : 'Your verification email is queued. Delivery will retry shortly.' });
}

async function verifyAuth(request: Request) {
  const input = await body(request); const email = workEmail(input.email);
  if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new ApiError(400, 'Enter the six-digit code.');
  const rawSession = token();
  const result = transaction(() => {
    const challenge = db().prepare('SELECT * FROM otp_challenges WHERE email = ?').get(email) as Row | undefined;
    if (!challenge || challenge.consumed_at || challenge.expires_at <= Date.now() || challenge.attempts >= 6) return { error: 'The code has expired or is no longer valid. Request a new code.' };
    db().prepare('UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = ?').run(email);
    if (!safeEqual(otpDigest(input.code, challenge.salt), challenge.digest)) return { error: 'The code is incorrect. Please try again.' };
    const now = iso();
    db().prepare("INSERT INTO users (id,email,name,verified_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=CASE WHEN excluded.name <> '' THEN excluded.name ELSE users.name END,verified_at=excluded.verified_at").run(randomUUID(), email, challenge.name, now, now);
    const user = db().prepare('SELECT id,name,email FROM users WHERE email=?').get(email) as Row;
    db().prepare('UPDATE otp_challenges SET consumed_at=? WHERE email=?').run(Date.now(), email);
    db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db().prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash(rawSession), user.id, Date.now() + 604_800_000);
    return { user };
  });
  if (result.error) throw new ApiError(400, result.error);
  return json({ user: userView(result.user as User) }, 200, { 'set-cookie': sessionCookie(rawSession) });
}

async function submitRequest(request: Request) {
  const user = requireUser(request);
  workEmail(user.email);
  text(user.name, 'Name', 2, 120);
  const input = await body(request);
  const providers = providersInput(input.providers ?? input.vendors);
  if (input.consent !== true) throw new ApiError(400, 'Confirm that the submitted websites are public and that published results will include the submitted company and customer names.');
  const notes = input.notes ? multilineText(input.notes, 'Notes') : null;
  const reuse: Row = planReuse(providers, protocol());
  if (reuse.exactReport) return json({ existingReport: reuse.exactReport, reuse: reuseView(reuse) });
  const reviewToken = token(); const id = randomUUID(); const now = iso();
  transaction(() => {
    rateLimit(`requests:${user.id}`, 5, 86_400_000);
    db().prepare('INSERT INTO requests (id,user_id,providers_json,status,created_at,updated_at,review_token_hash,review_expires_at,notes,consent_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, user.id, JSON.stringify(providers), 'pending_review', now, now, hash(reviewToken), Date.now() + 604_800_000, notes, now);
    const title = providers.map(p => p.name).join(' vs. ');
    const deployments = providers.map(p => `${p.name} (${p.website})\n${p.customers.map(c => `  ${c.name}: ${c.website}`).join('\n')}`).join('\n\n');
    enqueueMail(`request:${id}:review`, config().adminEmail, `Review requested: ${title}`, `A verified mailbox submitted a comparison.\n\nRequester: ${user.name} <${user.email}>\n\n${deployments}${notes ? `\n\nRequester notes: ${notes}` : ''}\n\nCurrent reuse plan: ${reuse.reusedConversations} existing conversations; ${reuse.newConversations} new conversations (${reuse.newConversations * 10} new turns). Reuse is limited to compatible captures within 30 days; availability is checked again before execution. Original dates and limitations remain visible.\n\nReview and confirm the provider attribution of all six storefronts before approving:\n${config().appUrl}/review/${reviewToken}\n\nOpening this link cannot approve or start a run. The review link expires in seven days. Approval authorizes at most 120 new turns and automatic publication only after validation.\n\nAlhena Research Lab`);
    enqueueMail(`request:${id}:received`, user.email, `Comparison submitted: ${title}`, `Hi ${user.name},\n\nYour comparison request is awaiting review. We will verify the proposed deployments before running it.\n\nView your private request status:\n${statusUrl(id)}\n\nWe will email you when it is approved and when the completed report is published.`);
  });
  return json({ request: requestView(requestRow(id)) }, 201);
}

function recordReportAccess(user: User, slug: string, report: Row, action: 'view' | 'download') {
  transaction(() => {
    const now = Date.now(); const timestamp = new Date(now).toISOString();
    const previous = db().prepare('SELECT last_notified_at FROM report_access WHERE user_id=? AND report_slug=? AND action=?').get(user.id, slug, action) as Row | undefined;
    const notify = !previous || previous.last_notified_at <= now - 86_400_000;
    if (previous) {
      db().prepare('UPDATE report_access SET access_count=access_count+1,last_access_at=?,last_notified_at=CASE WHEN ? THEN ? ELSE last_notified_at END,notification_count=notification_count+? WHERE user_id=? AND report_slug=? AND action=?').run(timestamp, notify ? 1 : 0, now, notify ? 1 : 0, user.id, slug, action);
    } else {
      db().prepare('INSERT INTO report_access (user_id,report_slug,action,access_count,first_access_at,last_access_at,last_notified_at,notification_count) VALUES (?,?,?,1,?,?,?,1)').run(user.id, slug, action, timestamp, timestamp, now);
    }
    if (notify) {
      const title = String(report.title).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
      const event = action === 'view' ? 'viewed' : 'downloaded';
      enqueueMail(`report-access:${user.id}:${slug}:${action}:${randomUUID()}`, config().adminEmail, `${title} | ${user.email}`, `A verified reader ${event} a detailed report.\n\nReport: ${title}\nViewer: ${user.name ? `${user.name} <${user.email}>` : user.email}\nAction: ${event}\nTime: ${timestamp}\n\n${config().appUrl}/reports/${slug}\n\nRepeated ${action === 'view' ? 'views' : 'downloads'} by this reader for this report are counted privately, with at most one notification per action in 24 hours. This is a transactional access notification, not marketing consent.`);
    }
  });
}

function reviewRow(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(rawToken)) throw new ApiError(404, 'Review link not found.');
  const row = db().prepare('SELECT * FROM requests WHERE review_token_hash=?').get(hash(rawToken)) as Row | undefined;
  if (!row) throw new ApiError(404, 'Review link not found.');
  if (row.review_expires_at <= Date.now()) throw new ApiError(410, 'This review link has expired. Use the administrator CLI to generate a new review email.');
  return row;
}

async function reviewRequest(request: Request, rawToken: string) {
  if (request.method === 'GET') {
    const row = reviewRow(rawToken); const user = requester(row);
    return json({ request: requestView(row), requester: { name: user.name, email: user.email }, expiresAt: new Date(row.review_expires_at).toISOString(), decided: !!row.review_decision, reuse: reuseView(planReuse(JSON.parse(row.providers_json), protocol())) });
  }
  const input = await body(request);
  if (!['approve', 'reject'].includes(input.decision)) throw new ApiError(400, 'Choose approve or reject.');
  if (input.decision === 'approve' && input.confirmAttribution !== true) throw new ApiError(400, 'Confirm you reviewed the provider attribution for all six customer storefronts.');
  const note = input.note ? multilineText(input.note, 'Review note') : null;
  const approvedProtocol = input.decision === 'approve' ? protocol() : null;
  const id = transaction(() => {
    const row = reviewRow(rawToken);
    if (row.review_decision) {
      if (row.review_decision !== input.decision) throw new ApiError(409, 'This request has already been reviewed.');
      return row.id;
    }
    const now = iso(); const user = requester(row);
    db().prepare('UPDATE requests SET status=?,review_decision=?,reviewed_at=?,updated_at=?,review_note=?,attribution_confirmed_at=? WHERE id=?').run(input.decision === 'approve' ? 'queued' : 'rejected', input.decision, now, now, note, input.decision === 'approve' ? now : null, row.id);
    if (input.decision === 'approve') {
      const reuse: Row = planReuse(JSON.parse(row.providers_json), approvedProtocol!);
      if (reuse.exactReport) { linkExistingReport(row, reuse.exactReport); return row.id; }
      db().prepare('INSERT INTO jobs (id,request_id,state,protocol_json,reuse_json,available_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(), row.id, 'queued', JSON.stringify(approvedProtocol), JSON.stringify(reuse), Date.now(), now, now);
      enqueueMail(`request:${row.id}:approved`, user.email, `Comparison approved: ${requestTitle(row)}`, `Hi ${user.name},\n\nYour comparison has been approved. The current plan reuses ${reuse.reusedConversations} previously evaluated conversations and runs ${reuse.newConversations} new conversations. Only compatible analysis captured within 30 days is reused; its original dates and limitations remain visible. Unsupported storefronts or incomplete evidence will pause the run for review.\n\nPrivate status:\n${statusUrl(row.id)}\n\nWe will send the report link when capture, judging, audit and validation are complete.\n\nAlhena Research Lab`);
    } else {
      enqueueMail(`request:${row.id}:rejected`, user.email, `Update on your comparison request`, `Hi ${user.name},\n\nYour request was reviewed and will not run.${note ? `\n\nReview note: ${note}` : ''}\n\nPrivate status:\n${statusUrl(row.id)}`);
    }
    return row.id;
  });
  return json({ request: requestView(requestRow(id)) });
}

async function claimJob() {
  const job = transaction(() => {
    const now = Date.now(); const c = config();
    const exhausted = db().prepare("SELECT * FROM jobs WHERE state='running' AND lease_expires_at <= ? AND attempt >= ?").all(now, c.maxAttempts) as Row[];
    for (const failed of exhausted) {
      db().prepare("UPDATE jobs SET state='needs_review',updated_at=?,error='Worker lease expired after maximum attempts.' WHERE id=?").run(iso(), failed.id);
      db().prepare("UPDATE requests SET status='needs_review',updated_at=?,error='The run needs operator attention after interrupted attempts.' WHERE id=?").run(iso(), failed.request_id);
      enqueueMail(`job:${failed.id}:exhausted`, c.adminEmail, 'Comparison run needs attention', `A worker stopped responding after ${c.maxAttempts} attempts.\n\nRequest: ${failed.request_id}\n\nUse the administrator CLI to inspect and retry after resolving the problem.`);
    }
    const selected = db().prepare("SELECT * FROM jobs WHERE (state='queued' AND available_at <= ?) OR (state='running' AND lease_expires_at <= ? AND attempt < ?) ORDER BY created_at LIMIT 1").get(now, now, c.maxAttempts) as Row | undefined;
    if (!selected) return null;
    const selectedRequest = requestRow(selected.request_id);
    const approvedProviders = JSON.parse(selectedRequest.providers_json);
    const snapshot = JSON.parse(selected.protocol_json);
    // Refresh before each attempt: aged-out evidence becomes new work, while a
    // comparison published by an earlier queued job avoids a duplicate run.
    const reuse: Row = planReuse(approvedProviders, snapshot);
    if (reuse.exactReport) { linkExistingReport(selectedRequest, reuse.exactReport, selected.id); return null; }
    const reusedConversations = resolveReuse(reuse, approvedProviders, snapshot);
    db().prepare('UPDATE jobs SET reuse_json=? WHERE id=?').run(JSON.stringify(reuse), selected.id);
    const leaseToken = token(); const fencingToken = selected.fencing_token + 1;
    const expires = now + c.leaseSeconds * 1000;
    db().prepare("UPDATE jobs SET state='running',attempt=attempt+1,fencing_token=?,lease_token_hash=?,lease_expires_at=?,heartbeat_at=?,updated_at=?,error=NULL WHERE id=?").run(fencingToken, hash(leaseToken), expires, now, iso(), selected.id);
    db().prepare("UPDATE requests SET status='running',updated_at=?,error=NULL WHERE id=?").run(iso(), selected.request_id);
    const request = requestRow(selected.request_id);
    return { id: selected.id, requestId: selected.request_id, leaseToken, fencingToken, leaseExpiresAt: new Date(expires).toISOString(), attempt: selected.attempt + 1, providers: JSON.parse(request.providers_json), protocol: snapshot, reusedConversations, approvedAt: request.reviewed_at, attributionConfirmedAt: request.attribution_confirmed_at };
  });
  return json({ job });
}

async function heartbeatJob(request: Request) {
  const input = await body(request);
  const expires = transaction(() => {
    const job = activeLease(input); const expires = Date.now() + config().leaseSeconds * 1000;
    db().prepare('UPDATE jobs SET lease_expires_at=?,heartbeat_at=?,updated_at=? WHERE id=?').run(expires, Date.now(), iso(), job.id);
    return expires;
  });
  return json({ ok: true, leaseExpiresAt: new Date(expires).toISOString() });
}

async function completeJob(request: Request) {
  const input = await body(request, 12_000_000);
  const job = activeLease(input); const row = requestRow(job.request_id); const user = requester(row);
  const authorizedReuse = resolveReuse(job.reuse_json ? JSON.parse(job.reuse_json) : null, JSON.parse(row.providers_json), JSON.parse(job.protocol_json));
  const counts = validateEvidence(input.evidence, JSON.parse(row.providers_json), JSON.parse(job.protocol_json), [user.email, user.name, config().adminEmail, input.leaseToken, config().workerSecret], authorizedReuse);
  const completedAt = iso();
  const evidence = { ...input.evidence, publication: { published_at: completedAt, validated_by: 'comparison-lab-server', protocol_snapshot_sha256: JSON.parse(job.protocol_json).sha256, counts, automatic_publication: true } };
  const providers = JSON.parse(row.providers_json);
  const slug = `${providers.map((p: Row) => slugPart(p.name)).join('-vs-')}-${row.id.slice(0, 8)}`;
  const bytes = JSON.stringify(evidence, null, 2);
  const directory = path.join(config().dataDir, 'reports');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = `${slug}-${hash(bytes).slice(0, 12)}.json`;
  const temp = path.join(directory, `${randomUUID()}.tmp`);
  fs.writeFileSync(temp, bytes, { mode: 0o600 });
  fs.renameSync(temp, path.join(directory, filename));
  const summary = reportSummary(slug, evidence, completedAt);
  transaction(() => {
    activeLease(input);
    db().prepare('INSERT INTO reports (slug,job_id,title,summary_json,evidence_path,evidence_sha256,published_at) VALUES (?,?,?,?,?,?,?)').run(slug, job.id, summary.title, JSON.stringify(summary), filename, hash(bytes), completedAt);
    db().prepare("UPDATE jobs SET state='published',updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL WHERE id=?").run(completedAt, job.id);
    db().prepare("UPDATE requests SET status='published',report_slug=?,updated_at=?,error=NULL WHERE id=?").run(slug, completedAt, row.id);
    enqueueMail(`request:${row.id}:published`, user.email, `Your comparison report is published: ${requestTitle(row)}`, `Hi ${user.name},\n\nThe comparison is complete and published, including all conversations, criterion decisions and audit evidence.\n\nExplore the report:\n${config().appUrl}/reports/${slug}\n\nThe report covers the selected storefront deployments under the published quality rubric. Read its scope and limitations before interpreting the scores.`);
    enqueueMail(`request:${row.id}:published-admin`, config().adminEmail, `Published: ${requestTitle(row)}`, `The approved comparison passed evidence validation and was published automatically.\n\n${config().appUrl}/reports/${slug}\n\n12 conversations, 120 turns, 156 criterion decisions. The requester has been queued for notification.`);
  });
  return json({ ok: true, report: summary });
}

async function failJob(request: Request) {
  const input = await body(request); const code = text(input.code, 'Failure code', 2, 80);
  // Worker diagnostics are private. Expose only a controlled summary to requester/public APIs.
  const message = multilineText(input.message, 'Failure message');
  const status = transaction(() => {
    const job = activeLease(input); const retry = input.retryable === true && job.attempt < config().maxAttempts;
    const state = retry ? 'queued' : 'needs_review';
    const publicMessage = retry ? 'The run was interrupted and will retry.' : 'The run needs operator review. Incomplete results have not been published.';
    db().prepare('UPDATE jobs SET state=?,available_at=?,updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,error=? WHERE id=?').run(state, Date.now() + 60_000 * job.attempt, iso(), `${code}: ${message}`, job.id);
    db().prepare('UPDATE requests SET status=?,updated_at=?,error=? WHERE id=?').run(state, iso(), publicMessage, job.request_id);
    if (!retry) {
      const row = requestRow(job.request_id); const user = requester(row);
      enqueueMail(`job:${job.id}:needs-review:${job.attempt}`, config().adminEmail, `Comparison needs attention: ${requestTitle(row)}`, `The approved run stopped without publishing.\n\nRequest: ${row.id}\nFailure code: ${code}\nWorker diagnostic: ${message}\n\nInspect the deployment adapters or evidence and use the administrator CLI to retry when appropriate.`);
      enqueueMail(`request:${row.id}:paused:${job.attempt}`, user.email, 'Your comparison needs additional review', `Hi ${user.name},\n\nYour comparison could not be completed automatically and needs operator review. Incomplete results have not been published.\n\nPrivate status:\n${statusUrl(row.id)}`);
    }
    return state;
  });
  return json({ ok: true, status });
}

export async function handleApi(request: Request, segments?: string[]): Promise<Response> {
  try {
    const parts = segments || new URL(request.url).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const route = parts.join('/'); const method = request.method;
    if (parts[0] === 'worker') {
      requireWorker(request);
      if (method !== 'POST') throw new ApiError(405, 'Use POST.');
      if (route === 'worker/claim') return await claimJob();
      if (route === 'worker/heartbeat') return await heartbeatJob(request);
      if (route === 'worker/complete') return await completeJob(request);
      if (route === 'worker/fail') return await failJob(request);
      throw new ApiError(404, 'Endpoint not found.');
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) requireOrigin(request);
    if (route === 'health' && method === 'GET') return json({ ok: true, ...readiness() });
    if (route === 'providers' && method === 'GET') {
      const query = new URL(request.url).searchParams.get('q') || '';
      if (query.length > 180) throw new ApiError(400, 'Provider search is too long.');
      return json(getProviderCatalog(query));
    }
    if (route === 'reuse/preview' && method === 'POST') {
      const user = requireUser(request); workEmail(user.email);
      const input = await body(request);
      transaction(() => rateLimit(`reuse-preview:${user.id}`, 30, 60_000));
      return json(reuseView(planReuse(providersInput(input.providers), protocol())));
    }
    if (route === 'auth/start' && method === 'POST') return await startAuth(request);
    if (route === 'auth/verify' && method === 'POST') return await verifyAuth(request);
    if (route === 'auth/session' && method === 'GET') {
      const user = sessionUser(request);
      const requests = user ? (db().prepare('SELECT * FROM requests WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(user.id) as Row[]).map(requestView) : [];
      return json({ user: user ? userView(user) : null, requests });
    }
    if (route === 'auth/session' && method === 'DELETE') {
      const raw = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
      if (raw) db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(raw));
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    }
    if (route === 'requests' && method === 'POST') return await submitRequest(request);
    if (parts[0] === 'requests' && parts.length === 2 && method === 'GET') return json({ request: requestView(ownerRequest(parts[1], requireUser(request).id)) });
    if (parts[0] === 'review' && parts.length === 2 && ['GET', 'POST'].includes(method)) return await reviewRequest(request, parts[1]);
    if (route === 'reports' && method === 'GET') return json({ reports: listReports() });
    if (parts[0] === 'reports' && parts.length >= 2 && method === 'GET') {
      if (parts.length === 2) {
        const user = sessionUser(request);
        return json({ report: getReport(parts[1]).report, access: { verified: !!user && workEmailEligible(user.email) } });
      }
      if (parts.length === 3 && ['details', 'evidence', 'html'].includes(parts[2])) {
        const user = requireUser(request);
        if (!workEmailEligible(user.email)) throw new ApiError(403, 'Verify your work email to access the detailed report.');
        requireReportOrigin(request);
        const result = getReport(parts[1]);
        if (parts[2] === 'details') {
          const response = json(result);
          recordReportAccess(user, parts[1], result.report, 'view');
          return response;
        }
        if (parts[2] === 'evidence') {
          const response = json(result.evidence, 200, { 'content-disposition': `attachment; filename="${parts[1]}-evidence.json"` });
          recordReportAccess(user, parts[1], result.report, 'download');
          return response;
        }
        if (parts[2] === 'html' && parts[1] === SEED_SLUG) {
          const response = new Response(fs.readFileSync(path.join(config().contentDir, SEED_SLUG, 'report.html'), 'utf8'), { headers: { 'content-type': 'text/html; charset=utf-8', ...privateHeaders, 'content-disposition': `attachment; filename="${parts[1]}-report.html"`, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } });
          recordReportAccess(user, parts[1], result.report, 'download');
          return response;
        }
      }
    }
    throw new ApiError(404, 'Endpoint not found.');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error('[Alhena Research Lab API]', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'The server could not complete this request. Please try again.' }, 500);
  }
}
