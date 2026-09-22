import { randomUUID } from 'node:crypto';
import { db, transaction } from './db.ts';
import { hash, iso, token } from './security.ts';
import type { Row } from './model.ts';
import { digest, merchantId } from '../../worker/policy-contract.mjs';

// These receipts are server-owned. A worker cannot grant itself an earlier approval.
export function priorRosterApprovals(request: Row, job: Row) {
  if (request.review_decision !== 'approve' || request.protocol_json !== job.protocol_json) return [];
  const current = JSON.parse(request.providers_json), approvals = new Map<string, Row>();
  for (const row of db().prepare('SELECT * FROM roster_amendments WHERE request_id=? AND job_id=? ORDER BY created_at').all(request.id, job.id) as Row[]) {
    if (hash(row.snapshot_json) !== row.snapshot_sha256) throw new Error('Roster approval archive hash mismatch.');
    const snapshot = JSON.parse(row.snapshot_json);
    if (snapshot.request.protocol_json !== job.protocol_json || snapshot.request.review_decision !== 'approve') continue;
    for (const previous of JSON.parse(snapshot.request.providers_json)) {
      const provider = current.find((p: Row) => p.name === previous.name && p.website === previous.website);
      if (!provider) continue;
      for (const store of previous.customers.slice(0, 3)) {
        if (!provider.customers.some((s: Row) => digest(s) === digest(store))) continue;
        const id = merchantId(store), approvedAt = snapshot.request.reviewed_at, key = id + ':' + row.id;
        if (!Number.isFinite(Date.parse(approvedAt)) || Date.parse(approvedAt) > Date.parse(request.reviewed_at)) continue;
        approvals.set(key, { merchantId:id, provider:{name:provider.name,website:provider.website}, store, approvedAt, approvedUntil:row.created_at, protocolSnapshotSha256:JSON.parse(job.protocol_json).sha256, amendmentId:row.id, archiveSha256:row.snapshot_sha256 });
      }
    }
  }
  return [...approvals.values()];
}

export function correctRoster(requestId: string) {
  return transaction(() => {
    const request = db().prepare('SELECT * FROM requests WHERE id=?').get(requestId) as Row;
    const job = db().prepare('SELECT * FROM jobs WHERE request_id=?').get(requestId) as Row | undefined;
    const preparation = db().prepare('SELECT * FROM preparation_jobs WHERE request_id=?').get(requestId) as Row | undefined;
    if (!request || !job || !preparation || request.review_decision !== 'approve' || !['needs_review','failed'].includes(request.status) || !['needs_review','failed'].includes(job.state) || request.report_slug || job.completion_json || db().prepare('SELECT slug FROM policy_releases WHERE request_id=?').get(requestId)) throw new Error('Only an approved, stopped, unpublished policy run can have its roster corrected.');
    if (request.protocol_json !== job.protocol_json || JSON.parse(job.protocol_json).id !== 'policy-resolution-v1') throw new Error('Roster correction requires the same frozen policy protocol.');
    const providers = JSON.parse(request.providers_json);
    if (providers.some((p:Row) => p.customers.length !== 5)) throw new Error('A previously approved five-storefront roster is required.');
    const now=iso(), id=randomUUID();
    // Full snapshots retain the old approval, five-storefront scope, and research completion hashes.
    const snapshot=JSON.stringify({schema:'alhena-research-lab/roster-amendment-v1',request,job,preparation});
    db().prepare('INSERT INTO roster_amendments (id,request_id,job_id,snapshot_json,snapshot_sha256,created_at) VALUES (?,?,?,?,?,?)').run(id,requestId,job.id,snapshot,hash(snapshot),now);
    const original=providers.map((p:Row)=>({...p,customers:p.customers.slice(0,3)}));
    db().prepare("UPDATE requests SET providers_json=?,status='researching',review_decision=NULL,reviewed_at=NULL,attribution_confirmed_at=NULL,review_note=NULL,review_token_hash=?,review_expires_at=?,updated_at=?,error=NULL WHERE id=?").run(JSON.stringify(original),hash(token()),Date.now()+604800000,now,requestId);
    db().prepare("UPDATE preparation_jobs SET state='queued',attempt=0,available_at=?,created_at=?,updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,heartbeat_at=NULL,error=NULL,completion_hash=NULL,completion_token_hash=NULL WHERE id=?").run(Date.now(),now,now,preparation.id);
    // The same job/cache can resume only after a new approval. Increment the fence now to invalidate stale leases.
    db().prepare("UPDATE jobs SET state='awaiting_roster_approval',fencing_token=fencing_token+1,lease_token_hash=NULL,lease_expires_at=NULL,heartbeat_at=NULL,updated_at=?,error='Corrected storefront scope requires approval.' WHERE id=?").run(now,job.id);
    return {ok:true,requestId,jobId:job.id,amendmentId:id,status:'researching',message:'Original approval and evidence are archived. Research will verify two replacements; the corrected five-storefront roster requires approval before the same job resumes.'};
  });
}
