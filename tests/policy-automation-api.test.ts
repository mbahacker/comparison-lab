import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleApi } from '../lib/server/api.ts';
import { closeDb, db } from '../lib/server/db.ts';
import { hash, SESSION_COOKIE } from '../lib/server/security.ts';
import { validateDiscoveries } from '../lib/server/policy-preparation.ts';
import type { Row } from '../lib/server/model.ts';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-api-'));
Object.assign(process.env, { DATA_DIR: directory, NODE_ENV: 'test', APP_URL: 'http://localhost:3000', MAIL_TRANSPORT: 'file', WORKER_SECRET: 'offline-worker-secret-at-least-32-characters' });
after(() => { closeDb(); fs.rmSync(directory, { recursive: true, force: true }); });
const provider = { name: 'Offline Tool', website: 'https://offline-provider.example/', customers: [1, 2, 3].map(n => ({ name: `Offline Store ${n}`, website: `https://offline-store-${n}.example/` })) };
const five = { ...provider, customers: [1, 2, 3, 4, 5].map(n => ({ name: `Offline Store ${n}`, website: `https://offline-store-${n}.example/` })) };
const session = 'offline-api-test-session';
function owner() {
  const now = new Date().toISOString();
  db().prepare('INSERT INTO users (id,email,name,verified_at,created_at) VALUES (?,?,?,?,?)').run('owner', 'owner@offline-business.example', 'Offline Requester', now, now);
  db().prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(hash(session), 'owner', Date.now() + 3600000);
  return `${SESSION_COOKIE}=${session}`;
}
async function call(route: string, options: { body?: unknown; cookie?: string; worker?: boolean } = {}) {
  const headers: Record<string, string> = { origin: process.env.APP_URL!, 'content-type': 'application/json' };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.worker) headers.authorization = `Bearer ${process.env.WORKER_SECRET}`;
  const response = await handleApi(new Request(`${process.env.APP_URL}/api/${route}`, { method: options.body === undefined ? 'GET' : 'POST', headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) }));
  return { response, data: await response.json() as Row };
}
const lease = (job: Row) => ({ jobId: job.id, leaseToken: job.leaseToken, fencingToken: job.fencingToken });
function proofs() {
  return five.customers.map((store, index) => {
    const sourceText = `Industry\nRetail\nOffline test-only research fixture ${index}. This is not a live deployment or research evidence.`;
    return { providerWebsite: five.website, storeWebsite: store.website,
      sourceUrl: index < 3 ? store.website : `${five.website}customers/store-${index + 1}`,
      sourceTitle:store.name+' customer story',storefrontTitle:store.name+' retail shop',sourceText, sourceSha256: hash(sourceText), retrievedAt: new Date().toISOString(),
      observedProviderUrls: [`${five.website}widget.js`], sourceLinks: [store.website], sourceContentLinks:[store.website], candidateBasis:'customer-content-link',
      storefrontText:'Offline fixture. Add to cart',storefrontSha256:hash('Offline fixture. Add to cart'),storefrontLinks:[store.website+'products/example',store.website+'cart'],storefrontUrl:store.website,storefrontRetrievedAt:new Date().toISOString(),
      verification: 'live-provider-fingerprint', submitted: index < 3 };
  });
}

test('policy request researches three into five before approval, freezes scope and fences workers', async t => {
  const cookie = owner();
  const submitted = await call('tools/requests', { cookie, body: { provider, consent: true } });
  assert.equal(submitted.response.status, 201, JSON.stringify(submitted.data));
  const requestId = submitted.data.request.id;
  assert.equal(submitted.data.request.protocol, 'policy-resolution-v1');
  assert.equal(submitted.data.request.status, 'researching');
  assert.equal((db().prepare('SELECT COUNT(*) n FROM jobs').get() as Row).n, 0);
  assert.equal((await call('worker/claim', { worker: true, body: {} })).data.job, null);
  assert.equal((await call(`requests/${requestId}`)).response.status, 401);
  assert.equal((await call('worker/prepare/claim', { body: {} })).response.status, 401);

  const initial = (await call('worker/prepare/claim', { worker: true, body: {} })).data.job;
  assert.equal(initial.providers[0].customers.length, 3);
  await t.test('expired preparation worker cannot heartbeat or finish after reclaim', async () => {
    db().prepare('UPDATE preparation_jobs SET lease_expires_at=? WHERE id=?').run(Date.now() - 1, initial.id);
    assert.equal((await call('worker/prepare/heartbeat', { worker: true, body: lease(initial) })).response.status, 409);
  });
  const current = (await call('worker/prepare/claim', { worker: true, body: {} })).data.job;
  assert.equal(current.fencingToken, initial.fencingToken + 1);
  const input = { ...lease(current), providers: [five], discoveries: proofs() };
  assert.equal((await call('worker/prepare/complete', { worker: true, body: { ...input, ...lease(initial) } })).response.status, 409);
  await t.test('research cannot replace submitted stores, invent a fingerprint, or alter source bytes', async () => {
    const changed = structuredClone(input); changed.providers[0].customers[0].website = 'https://different.example/';
    assert.equal((await call('worker/prepare/complete', { worker: true, body: changed })).response.status, 422);
    const fingerprint = structuredClone(input); fingerprint.discoveries[3].observedProviderUrls = ['https://offline-provider.example.attacker.example/widget.js'];
    assert.equal((await call('worker/prepare/complete', { worker: true, body: fingerprint })).response.status, 422);
    const changedBytes = structuredClone(input); changedBytes.discoveries[4].sourceText += ' altered';
    assert.equal((await call('worker/prepare/complete', { worker: true, body: changedBytes })).response.status, 422);
  });
  const prepared = await call('worker/prepare/complete', { worker: true, body: input });
  assert.equal(prepared.response.status, 200, JSON.stringify(prepared.data));
  assert.equal((await call('worker/prepare/complete', { worker: true, body: input })).response.status, 200);
  const rows = db().prepare('SELECT * FROM outbox WHERE event_key=?').all(`request:${requestId}:review`) as Row[];
  assert.equal(rows.length, 1);
  const reviewToken = /\/review\/([A-Za-z0-9_-]+)/.exec(rows[0].text_body)![1];
  const review = await call(`review/${reviewToken}`);
  assert.equal(review.data.request.providers[0].customers.length, 5);
  assert.equal(review.data.request.status, 'pending_review');
  assert.equal((await call('worker/claim', { worker: true, body: {} })).data.job, null);
  assert.equal((await call(`review/${reviewToken}`, { body: { decision: 'approve' } })).response.status, 400);
  for (let i = 0; i < 2; i++) assert.equal((await call(`review/${reviewToken}`, { body: { decision: 'approve', confirmAttribution: true } })).response.status, 200);
  assert.equal((db().prepare('SELECT COUNT(*) n FROM jobs').get() as Row).n, 1);
  const job = (await call('worker/claim', { worker: true, body: {} })).data.job;
  assert.equal(job.protocol.sha256, submitted.data.request.protocolSha256);
  assert.equal(job.providers[0].customers.length, 5);
  assert.deepEqual(job.limits, { conversations: 55, turns: 515, checkpoints: 500 });
  assert.equal((await call('worker/heartbeat', { worker: true, body: { ...lease(job), fencingToken: job.fencingToken + 1 } })).response.status, 409);
  assert.equal((await call('worker/heartbeat', { worker: true, body: lease(job) })).response.status, 200);
  // Reject a changed approved snapshot before any reference fetch or model path.
  const changedProtocol = { ...job.protocol, methodHash: '0'.repeat(64) };
  db().prepare('UPDATE jobs SET protocol_json=? WHERE id=?').run(JSON.stringify(changedProtocol), job.id);
  const mismatch = await call('worker/complete', { worker: true, body: { ...lease(job), evidence: {} } });
  assert.equal(mismatch.response.status, 422);
  db().prepare('UPDATE jobs SET protocol_json=? WHERE id=?').run(JSON.stringify(job.protocol), job.id);
  assert.equal((db().prepare('SELECT COUNT(*) n FROM policy_releases').get() as Row).n, 0);
  const publicLibrary = await call('research-tools');
  assert.deepEqual(publicLibrary.data.tools, []);
  assert.equal(JSON.stringify(publicLibrary.data).includes('offline-business'), false);
  assert.equal(JSON.stringify(publicLibrary.data).includes(session), false);
  assert.equal((db().prepare('SELECT COUNT(*) n FROM outbox WHERE event_key LIKE ?').get(`request:${requestId}:published%`) as Row).n, 0);
});

test('additional deployment proofs require a same-provider source linking the exact merchant host', () => {
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const input = { providers: [five], discoveries: proofs() };
  assert.equal(validateDiscoveries(input, [provider], startedAt)[0].customers.length, 5);
  const foreign = structuredClone(input); foreign.discoveries[3].sourceUrl = 'https://unrelated.example/customer';
  assert.throws(() => validateDiscoveries(foreign, [provider], startedAt), /published provider customer source/);
  const absentLink = structuredClone(input); absentLink.discoveries[3].sourceLinks = ['https://not-the-store.example/'];
  assert.throws(() => validateDiscoveries(absentLink, [provider], startedAt), /published provider customer source/);
  const stale = structuredClone(input); stale.discoveries[0].retrievedAt = '2020-01-01T00:00:00.000Z';
  assert.throws(() => validateDiscoveries(stale, [provider], startedAt), /not from this preparation/);
});


test('research completion rejects provider-owned sites, non-retail customers and missing commerce', () => {
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const input = { providers: [five], discoveries: proofs() };
  const owned = structuredClone(input); owned.providers[0].customers[3].website='https://trust.offline-provider.example/';
  assert.throws(()=>validateDiscoveries(owned,[provider],startedAt),/Provider-owned/);
  const b2b=structuredClone(input);b2b.discoveries[3].sourceText='Industry\nTechnology\nWe serve retail businesses';b2b.discoveries[3].sourceSha256=hash(b2b.discoveries[3].sourceText);
  assert.throws(()=>validateDiscoveries(b2b,[provider],startedAt),/retail and live commerce/);
  const noShop=structuredClone(input);noShop.discoveries[3].storefrontLinks=[];
  assert.throws(()=>validateDiscoveries(noShop,[provider],startedAt),/retail and live commerce/);
});
