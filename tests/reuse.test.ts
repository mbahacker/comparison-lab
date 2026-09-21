import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { getProviderCatalog, planReuse, resolveReuse } from '../lib/server/reuse.ts';
import { protocol, seedEvidence, validateEvidence, reportSummary, SEED_SLUG } from '../lib/server/evidence.ts';
import { db, closeDb } from '../lib/server/db.ts';
import { assembleEvidence } from '../worker/evidence.mjs';
import { runJob } from '../worker/index.mjs';
import { evidenceHash, providerIdentity, storefrontIdentity, reusableAt, REUSE_WINDOW_MS, HISTORICAL_AUTHOR_NOTE } from '../worker/reuse.mjs';
import type { Provider, Row } from '../lib/server/model.ts';

const now = Date.parse('2026-09-21T00:00:00.000Z');
function providers(): Provider[] { return getProviderCatalog('', now).providers.map(p => ({ name: p.name, website: p.website, customers: p.customers.slice(0, 3).map((c: Row) => ({ name: c.name, website: c.website })) })); }
function isolated() {
  closeDb(); const old = process.env.DATA_DIR; const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-reuse-')); process.env.DATA_DIR = directory;
  return () => { closeDb(); if (old === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = old; fs.rmSync(directory, { recursive: true, force: true }); };
}
async function atNow<T>(callback: () => Promise<T> | T): Promise<T> { const old = Date.now; Date.now = () => now; try { return await callback(); } finally { Date.now = old; } }

test('catalog is safe, prefills three known deployments and canonical websites control reuse', () => {
  const cleanup = isolated(); try {
    const catalog = getProviderCatalog('', now); assert.equal(catalog.providers.length, 2);
    for (const p of catalog.providers) { assert.equal(p.customers.length, 3); assert.ok(p.customers.every((c: Row) => c.reusable && Number.isFinite(c.shopping) && Number.isFinite(c.support))); }
    assert.equal(JSON.stringify(catalog).includes('reply_as_judged'), false); assert.equal(JSON.stringify(catalog).includes('turns'), false);
    assert.equal(providerIdentity('http://WWW.ALHENA.AI/'), providerIdentity('https://alhena.ai/'));
    assert.notEqual(storefrontIdentity('https://shop.example/uk'), storefrontIdentity('https://shop.example/us'));
    assert.notEqual(storefrontIdentity('https://shop.example/Products'), storefrontIdentity('https://shop.example/products'));
    const p = providers(); p[0].name = 'Alhena renamed'; p[0].website = 'http://WWW.ALHENA.AI/'; p.reverse(); p.forEach(v => v.customers.reverse());
    assert.equal(planReuse(p, protocol(), true, now).existingReport?.slug, SEED_SLUG);
    p.find(v => v.website.includes('ALHENA'))!.website = 'https://unrelated.example/';
    const changed = planReuse(p, protocol(), true, now); assert.equal(changed.reusedConversations, 6); assert.equal(changed.exactReport, undefined);
    p[0].customers[0].website += 'different-path'; assert.equal(planReuse(p, protocol(), true, now).reusedConversations, 4);
  } finally { cleanup(); }
});

test('30-day capture window is inclusive, rejects future/invalid dates and does not refresh on publication', () => {
  const capturedAt = '2026-09-20T18:30:46.380Z'; const captured = Date.parse(capturedAt);
  assert.equal(reusableAt(capturedAt, captured + REUSE_WINDOW_MS), true);
  assert.equal(reusableAt(capturedAt, captured + REUSE_WINDOW_MS + 1), false);
  assert.equal(reusableAt(capturedAt, captured - 1), false); assert.equal(reusableAt('invalid', now), false);
  const cleanup = isolated(); try {
    const p = providers(); const snapshot = protocol(); const plan = planReuse(p, snapshot, true, now);
    const expiredAt = now + REUSE_WINDOW_MS;
    const expired = planReuse(p, snapshot, true, expiredAt);
    assert.equal(expired.reusedConversations, 0); assert.equal(expired.newConversations, 12); assert.equal(expired.existingReport, undefined); assert.equal(expired.previousReport?.slug, SEED_SLUG);
    assert.ok(getProviderCatalog('', expiredAt).providers.every(p => p.customers.every((c: Row) => c.reusable === false)));
    assert.throws(() => resolveReuse(plan, p, snapshot, expiredAt), /compatible|integrity/);
    assert.equal(planReuse(p, snapshot, true, Date.parse('2026-09-19T00:00:00Z')).reusedConversations, 0);
  } finally { cleanup(); }
});

test('seed inheritance is source-pinned, retains original dates and warnings, and cannot mint author proof', async () => {
  const cleanup = isolated(); try { await atNow(() => {
    const p = providers(), snapshot = protocol(), plan = planReuse(p, snapshot, true, now);
    const reused = resolveReuse(plan, p, snapshot, now); assert.equal(reused.length, 12);
    const original = seedEvidence();
    for (const c of reused) {
      const source = original.live_conversations.find((s: Row) => s.id === c.reuse.sourceConversationId);
      assert.equal(c.captured_at, source.captured_at); assert.equal(c.date, source.date); assert.deepEqual(c.checks, source.checks); assert.deepEqual(c.turns, source.turns);
      assert.equal(c.turns[0].author_verified, undefined); assert.equal(c.reuse.historicalAuthorVerification, true);
    }
    const evidence = assembleEvidence({ providers: p, reusedConversations: reused }, reused, { reused_only: true });
    assert.ok(evidence.study.limitations.includes(HISTORICAL_AUTHOR_NOTE));
    assert.ok(evidence.study.limitations.some((s: string) => s.includes('Paula’s Choice') && s.includes('Cold isolation')));
    assert.equal(evidence.study.reuse.reused_conversations, 12); assert.equal(evidence.audit.agreement_pct, 99.4);
    assert.equal(validateEvidence(evidence, p, snapshot, [], reused, now).turns, 120);
    const falseIdentity = structuredClone(evidence); falseIdentity.study.providers[0].website = 'https://unrelated.example/';
    assert.throws(() => validateEvidence(falseIdentity, p, snapshot, [], reused, now), /provider websites/);
    const missingProvenance: Row = structuredClone(evidence); delete missingProvenance.provenance.reused_sources;
    assert.throws(() => validateEvidence(missingProvenance, p, snapshot, [], reused, now), /provenance/);
    assert.throws(() => validateEvidence(evidence, p, snapshot, [], [], now), /cached conversation/);
    const edited = structuredClone(evidence); edited.live_conversations[0].turns[0].reply += ' altered';
    assert.throws(() => validateEvidence(edited, p, snapshot, [], reused, now), /cached conversation/);
    const redated = structuredClone(evidence); redated.live_conversations[0].captured_at = new Date(now).toISOString();
    assert.throws(() => validateEvidence(redated, p, snapshot, [], reused, now), /cached conversation/);
    const missingWarning = structuredClone(evidence); missingWarning.study.limitations = [];
    assert.throws(() => validateEvidence(missingWarning, p, snapshot, [], reused, now), /limitations/);
    assert.throws(() => validateEvidence(evidence, p, snapshot, [], reused, now + REUSE_WINDOW_MS), /30 days/);
    const wrongHash = structuredClone(plan); wrongHash.references[0].sourceConversationHash = '0'.repeat(64);
    assert.throws(() => resolveReuse(wrongHash, p, snapshot, now), /compatible|integrity/);
  }); } finally { cleanup(); }
});

test('all-cached worker makes no browser, model or upstream calls', async () => {
  const cleanup = isolated(); try { await atNow(async () => {
    const p = providers(), snapshot = protocol(), reused = resolveReuse(planReuse(p, snapshot, true, now), p, snapshot, now);
    const job = { id: 'cached', leaseToken: 'lease', fencingToken: 1, providers: p, protocol: snapshot, reusedConversations: reused };
    const fail = async () => { throw new Error('Unexpected live capture/model/reference call'); };
    const calls: Row[] = [];
    const result = await runJob(job, async (route: string, body: Row) => { calls.push({ route, body }); }, { rootDirectory: process.env.DATA_DIR, startProxy: fail, launchBrowser: fail, capture: fail, judge: fail, loadReference: fail });
    assert.equal(result.status, 'completed'); assert.deepEqual(calls.map(c => c.route), ['complete']);
    assert.equal(validateEvidence(calls[0].body.evidence, p, snapshot, [], reused, now).conversations, 12);
  }); } finally { cleanup(); }
});

function nativeFixture(p: Provider[], capturedAt: string) {
  const seed = seedEvidence();
  return seed.live_conversations.map((source: Row) => {
    const c = structuredClone(source); const oldProvider = source.vendor === 'Alhena' ? 0 : 1; const provider = p[oldProvider];
    const store = provider.customers.find(s => storefrontIdentity(s.website) === storefrontIdentity(c.url)) || provider.customers[seed.live_conversations.filter((s: Row) => s.vendor === source.vendor && s.mode === c.mode).findIndex((s: Row) => s.id === c.id)];
    c.vendor = provider.name; c.store = store.name; c.url = store.website; c.captured_at = capturedAt; c.date = capturedAt.slice(0, 10); c.capture_metadata.adapter = 'fixture';
    for (const t of c.turns) { t.author_verified = true; t.author_evidence = { kind: 'dom-ai-author', selector: '[data-role="assistant"]', provider: c.vendor, adapter_id: 'fixture', markers: [{ attribute: 'data-role', value: 'assistant' }], message_count: 1 }; }
    for (const x of c.checks) if (x.audit.classification === 'FALSE_POSITIVE') { x.audit.classification = 'FP'; x.final.evidence = x.audit.evidence; x.evidence = x.audit.evidence; }
    return c;
  });
}

test('mixed worker captures and judges only missing lanes while preserving inherited source limitations', async () => {
  const cleanup = isolated(); try { await atNow(async () => {
    const p = providers(); p[1] = { name: 'New vendor', website: 'https://new-vendor.example/', customers: [1, 2, 3].map(i => ({ name: `New store ${i}`, website: `https://new-store-${i}.example/` })) };
    const snapshot = protocol(), plan = planReuse(p, snapshot, true, now), reused = resolveReuse(plan, p, snapshot, now);
    assert.equal(plan.reusedConversations, 6); assert.equal(plan.newConversations, 6);
    const fresh = nativeFixture(p, new Date(now).toISOString()); let captures = 0, judgements = 0, browsers = 0, completed: Row | undefined;
    const result = await runJob({ id: 'mixed', leaseToken: 'lease', fencingToken: 1, providers: p, protocol: snapshot, reusedConversations: reused }, async (route: string, body: Row) => { if (route === 'complete') completed = body.evidence; }, {
      rootDirectory: process.env.DATA_DIR, loadReference: async () => ({ manifest: { fixture: true } }), startProxy: async () => ({ url: 'fixture', close: async () => {} }), launchBrowser: async () => { browsers++; return { close: async () => {} } as any; },
      capture: async ({ provider, store, mode }: Row) => { captures++; return fresh.find((c: Row) => c.vendor === provider.name && c.store === store.name && c.mode === mode); }, judge: async (c: Row) => { judgements++; return c; },
    });
    assert.equal(result.status, 'completed'); assert.equal(captures, 6); assert.equal(judgements, 6); assert.equal(browsers, 1);
    assert.ok(completed); assert.equal(validateEvidence(completed, p, snapshot, [], reused, now).turns, 120);
  }); } finally { cleanup(); }
});

test('latest compatible published capture wins; republishing inherited material does not change its capture age', async () => {
  const cleanup = isolated(); try { await atNow(() => {
    const p = providers(), snapshot = protocol();
    const native = assembleEvidence({ providers: p }, nativeFixture(p, '2026-09-20T22:00:00.000Z'), { fixture: true });
    const slug = 'newer-compatible'; const bytes = JSON.stringify(native); const folder = path.join(process.env.DATA_DIR!, 'reports'); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, `${slug}.json`), bytes);
    db().prepare('INSERT INTO reports (slug,job_id,title,published_at,summary_json,evidence_path,evidence_sha256) VALUES (?,?,?,?,?,?,?)').run(slug, null, 'Newer comparison', '2026-09-20T23:00:00.000Z', JSON.stringify(reportSummary(slug, native, '2026-09-20T23:00:00.000Z')), `${slug}.json`, createHash('sha256').update(bytes).digest('hex'));
    const plan = planReuse(p, snapshot, true, now); assert.ok(plan.references.every(r => r.sourceReportSlug === slug));
    const reused = resolveReuse(plan, p, snapshot, now); assert.ok(reused.every(c => c.reuse.historicalAuthorVerification === false));
    const republished = assembleEvidence({ providers: p, reusedConversations: reused }, reused, { reused_only: true });
    const rebytes = JSON.stringify(republished), reslug = 'republished'; fs.writeFileSync(path.join(folder, `${reslug}.json`), rebytes);
    db().prepare('INSERT INTO reports (slug,job_id,title,published_at,summary_json,evidence_path,evidence_sha256) VALUES (?,?,?,?,?,?,?)').run(reslug, null, 'Republished', '2026-10-19T00:00:00.000Z', JSON.stringify(reportSummary(reslug, republished, '2026-10-19T00:00:00.000Z')), `${reslug}.json`, createHash('sha256').update(rebytes).digest('hex'));
    const repeated = planReuse(p, snapshot, true, now); assert.ok(repeated.references.every(r => r.sourceReportSlug === slug));
    const expired = planReuse(p, snapshot, true, now + REUSE_WINDOW_MS); assert.equal(expired.reusedConversations, 0); assert.equal(expired.existingReport, undefined);
    fs.appendFileSync(path.join(folder, `${slug}.json`), ' '); assert.throws(() => resolveReuse(plan, p, snapshot, now), /integrity/);
  }); } finally { cleanup(); }
});
