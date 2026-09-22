import { afterEach, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { installPolicyStudy } from '../lib/server/install-policy-study.ts';
import { readPolicyCatalog } from '../lib/server/policy-studies.ts';

// Explicit synthetic software fixtures. They are not merchant captures or approved research releases.
let temp: string, source: string, data: string;
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-installer-fixture-')); source = path.join(temp, 'package'); data = path.join(temp, 'data'); fs.mkdirSync(source); fs.mkdirSync(data); });
afterEach(() => { mock.restoreAll(); fs.rmSync(temp, { recursive: true, force: true }); });
function fixture(slug = 'synthetic-only', releaseId = 'test-v1', approval = true) {
  const prefix = `releases/${slug}/${releaseId}`;
  const pin = (name: string, value: unknown) => {
    const bytes = typeof value === 'string' ? value : JSON.stringify(value);
    const relative = `${prefix}/${name}`; fs.mkdirSync(path.dirname(path.join(source, relative)), { recursive: true }); fs.writeFileSync(path.join(source, relative), bytes);
    return { path: relative, sha256: hash(bytes) };
  };
  const method = pin('method.md', '# Synthetic offline fixture; not research');
  const metric = { value: 0, explanation: 'Synthetic fixture only.' };
  const lane = { policyResolution: metric, quality: metric, speed: metric, composite: metric, coverage: {
    plannedCheckpoints: 10, attemptedCheckpoints: 10, observedCheckpoints: 10, submittedCheckpoints: 10, assessedCheckpoints: 10, unassessableCheckpoints: 0, attainedCheckpoints: 0, policyUnverifiedCheckpoints: 0, includedContexts: 1, excludedContexts: 0, includedStores: 1, excludedStores: 0, qualityEligibleContexts: 1, qualityEligibleStores: 1, originalCaptures: 1, repairedCaptures: 0,
  } };
  const summary = pin('summary.json', { schema: 'alhena-research-lab/policy-study-summary-v1', protocol: 'policy-resolution-v1', slug, title: 'Synthetic software fixture', description: 'Not actual research.', publishedAt: '2020-01-03T00:00:00Z', captureStartAt: '2020-01-01T00:00:00Z', captureEndAt: '2020-01-02T00:00:00Z', commissionedBy: 'Alhena Research Lab', method: { status: 'final', sha256: method.sha256, sourceCommit: 'a'.repeat(40), differences: ['Synthetic fixture.'] }, sample: { plannedCoreContexts: 2, capturedCoreContexts: 2, guardrailContexts: 0, judgedCoreContexts: 2, pcrDecisions: 20, auditedPcrDecisions: 20 }, providers: [{ id: 'example-fixture', name: 'Example Fixture', website: 'https://example.test', registeredStores: 1, shopping: lane, support: lane, overallComposite: metric }], limitations: ['Synthetic fixture.'], audit: { description: 'Offline mock.', limitations: [] } });
  const evidence = pin('evidence.json', { fixtureOnly: true, privateText: 'synthetic fixture evidence' });
  const html = pin('report.html', '<!doctype html><title>Offline test only</title><p>synthetic fixture</p>');
  const bundle = pin('bundle.zip', 'Synthetic placeholder bytes; not a real evidence bundle');
  const validation = pin('validation.json', { schema: 'alhena-research-lab/policy-publication-validation-v1', protocol: 'policy-resolution-v1', status: 'complete', approvedForPublication: approval, summarySha256: summary.sha256, evidenceSha256: evidence.sha256, methodSha256: method.sha256, htmlSha256: html.sha256, bundleSha256: bundle.sha256, captureComplete: true, scoringComplete: true, pcrAuditComplete: true, plannedCoreContexts: 2, capturedCoreContexts: 2, pcrDecisions: 20, auditedPcrDecisions: 20, provenanceReviewed: true, publicSummaryReviewed: true, evidencePrivacyReviewed: true, thirdPartyExcerptsReviewed: true, approvedAt: '2020-01-03T00:00:00Z' });
  const manifest = pin('manifest.json', { schema: 'alhena-research-lab/policy-publication-v1', slug, status: 'approved', summary, evidence, method, html, bundle, validation });
  return { source, dataDir: data, manifest: manifest.path, sha256: manifest.sha256, prefix, pins: [manifest, summary, evidence, method, html, bundle, validation] };
}
function rewriteManifest(f: ReturnType<typeof fixture>, change: (value: Record<string, unknown>) => void) {
  const p = path.join(source, f.manifest), value = JSON.parse(fs.readFileSync(p, 'utf8')); change(value); const bytes = JSON.stringify(value); fs.writeFileSync(p, bytes); f.sha256 = hash(bytes);
}
const root = () => path.join(data, 'published-studies');
const catalog = () => path.join(root(), 'catalog.json');

test('dry-run and CLI default validate without creating a destination or editing package bytes', () => {
  const f = fixture(); const before = f.pins.map(p => hash(fs.readFileSync(path.join(source, p.path))));
  assert.equal(installPolicyStudy(f).status, 'validated-dry-run'); assert.equal(fs.existsSync(root()), false);
  const run = spawnSync(process.execPath, ['--experimental-strip-types', 'lib/server/install-policy-study.ts', '--source', source, '--manifest', f.manifest, '--sha256', f.sha256, '--data-dir', data], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).status, 'validated-dry-run'); assert.equal(fs.existsSync(root()), false);
  assert.deepEqual(f.pins.map(p => hash(fs.readFileSync(path.join(source, p.path)))), before);
});
test('install copies only pinned artifacts unchanged, preserves unrelated data and is idempotent', () => {
  const f = fixture(); fs.writeFileSync(path.join(source, f.prefix, 'unapproved.txt'), 'Never copied'); fs.writeFileSync(path.join(data, 'pilot-evidence.json'), 'unchanged pilot');
  assert.equal(installPolicyStudy({ ...f, install: true }).status, 'installed');
  for (const p of f.pins) { assert.equal(hash(fs.readFileSync(path.join(root(), p.path))), p.sha256); assert.equal(fs.statSync(path.join(root(), p.path)).mode & 0o777, 0o600); }
  assert.equal(fs.existsSync(path.join(root(), f.prefix, 'unapproved.txt')), false); assert.equal(fs.readFileSync(path.join(data, 'pilot-evidence.json'), 'utf8'), 'unchanged pilot');
  const before = fs.readFileSync(catalog()), transactions = fs.readdirSync(path.join(root(), '.installations'));
  assert.equal(installPolicyStudy({ ...f, install: true }).status, 'already-installed'); assert.deepEqual(fs.readFileSync(catalog()), before); assert.deepEqual(fs.readdirSync(path.join(root(), '.installations')), transactions);
  assert.equal(readPolicyCatalog(root()).releases.length, 1);
});
test('a second distinct release preserves the existing catalog entry and artifact bytes', () => {
  const a = fixture(); installPolicyStudy({ ...a, install: true }); const first = JSON.parse(fs.readFileSync(catalog(), 'utf8')).studies[0];
  const b = fixture('second-fixture'); installPolicyStudy({ ...b, install: true });
  const studies = JSON.parse(fs.readFileSync(catalog(), 'utf8')).studies; assert.equal(studies.length, 2); assert.deepEqual(studies[0], first);
  for (const p of a.pins) assert.equal(hash(fs.readFileSync(path.join(root(), p.path))), p.sha256);
});
test('tampered hash, missing approval, incomplete counts and future approval fail before mutation', () => {
  let f = fixture(); fs.appendFileSync(path.join(source, f.pins[2].path), 'tampered'); assert.throws(() => installPolicyStudy({ ...f, install: true }), /hash mismatch/); assert.equal(fs.existsSync(root()), false);
  f = fixture('no-approval', 'test-v1', false); assert.throws(() => installPolicyStudy({ ...f, install: true })); assert.equal(fs.existsSync(root()), false);
  f = fixture('missing-receipt'); fs.unlinkSync(path.join(source, f.pins[6].path)); assert.throws(() => installPolicyStudy({ ...f, install: true }));
  f = fixture('incomplete'); const p = path.join(source, f.pins[6].path), v = JSON.parse(fs.readFileSync(p, 'utf8')); v.auditedPcrDecisions = 19; const bytes = JSON.stringify(v); fs.writeFileSync(p, bytes); rewriteManifest(f, m => { (m.validation as {sha256:string}).sha256 = hash(bytes); }); assert.throws(() => installPolicyStudy(f), /counts disagree/);
  f = fixture('bad-date'); const vp = path.join(source, f.pins[6].path), vv = JSON.parse(fs.readFileSync(vp, 'utf8')); vv.approvedAt = '2021-01-01T00:00:00Z'; const vb = JSON.stringify(vv); fs.writeFileSync(vp, vb); rewriteManifest(f, m => { (m.validation as {sha256:string}).sha256 = hash(vb); }); assert.throws(() => installPolicyStudy(f), /approval follows/);
});
test('traversal, symlink source, symlink target and cross-release paths are rejected', () => {
  let f = fixture(); rewriteManifest(f, m => { (m.evidence as {path:string}).path = '../outside.json'; }); assert.throws(() => installPolicyStudy(f), /Invalid relative/);
  f = fixture('source-link'); const ep = path.join(source, f.pins[2].path); fs.copyFileSync(ep, path.join(temp, 'outside.json')); fs.unlinkSync(ep); fs.symlinkSync(path.join(temp, 'outside.json'), ep); assert.throws(() => installPolicyStudy(f), /Symlink/);
  f = fixture('target-link'); fs.symlinkSync(source, root()); assert.throws(() => installPolicyStudy({ ...f, install: true }), /Symlink/); fs.unlinkSync(root());
  const other = fixture('other-prefix'); f = fixture('cross-prefix'); rewriteManifest(f, m => { m.evidence = other.pins[2]; }); assert.throws(() => installPolicyStudy(f), /immutable release prefix/);
});
test('conflicting duplicate slug and orphan release bytes never overwrite the old catalog', () => {
  const a = fixture(); installPolicyStudy({ ...a, install: true }); const original = fs.readFileSync(catalog());
  const b = fixture('synthetic-only', 'test-v2'); assert.throws(() => installPolicyStudy({ ...b, install: true }), /already-published slug/); assert.deepEqual(fs.readFileSync(catalog()), original);
  const c = fixture('orphan'); fs.mkdirSync(path.join(root(), c.prefix), { recursive: true }); fs.writeFileSync(path.join(root(), c.prefix, 'manifest.json'), 'different'); assert.throws(() => installPolicyStudy({ ...c, install: true }), /Conflicting existing release/); assert.deepEqual(fs.readFileSync(catalog()), original);
});
test('held lock refuses installation and does not delete another operator lock', () => {
  const f = fixture(); fs.mkdirSync(root()); const lock = path.join(root(), '.install.lock'); fs.writeFileSync(lock, 'another operator');
  assert.throws(() => installPolicyStudy({ ...f, install: true }), /EEXIST/); assert.equal(fs.readFileSync(lock, 'utf8'), 'another operator'); assert.equal(fs.existsSync(catalog()), false);
});
test('failure at catalog activation preserves the old catalog and records recoverable staging', () => {
  const a = fixture(); installPolicyStudy({ ...a, install: true }); const before = fs.readFileSync(catalog()); const b = fixture('second-fixture');
  const liveCatalog = fs.realpathSync(catalog());
  const rename = fs.renameSync; mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => { if (String(to) === liveCatalog) throw Error('Synthetic catalog activation interruption'); return rename(from, to); });
  assert.throws(() => installPolicyStudy({ ...b, install: true }), /Synthetic catalog/); assert.deepEqual(fs.readFileSync(catalog()), before); assert.equal(readPolicyCatalog(root()).releases.length, 1); assert.equal(fs.existsSync(path.join(root(), '.install.lock')), false);
  mock.restoreAll(); assert.equal(installPolicyStudy({ ...b, install: true }).status, 'installed'); assert.equal(readPolicyCatalog(root()).releases.length, 2);
});
test('oversized artifacts are rejected before the production reader loads bytes', () => {
  const f = fixture(); const fd = fs.openSync(path.join(source, f.pins[2].path), 'r+'); fs.ftruncateSync(fd, 65 * 1024 ** 2); fs.closeSync(fd);
  assert.throws(() => installPolicyStudy(f), /bounded regular file/); assert.equal(fs.existsSync(root()), false);
});
test('runtime source dependency layout supports the operator CLI outside the source checkout', () => {
  const f = fixture(), runtime = path.join(temp, 'runtime');
  fs.mkdirSync(path.join(runtime, 'lib/server'), { recursive: true });
  for (const name of ['install-policy-study.ts', 'policy-studies.ts', 'config.ts', 'security.ts', 'db.ts', 'model.ts']) fs.copyFileSync(path.join('lib/server', name), path.join(runtime, 'lib/server', name));
  fs.copyFileSync('lib/policy-study.ts', path.join(runtime, 'lib/policy-study.ts'));
  fs.mkdirSync(path.join(runtime, 'node_modules')); fs.cpSync('node_modules/zod', path.join(runtime, 'node_modules/zod'), { recursive: true });
  fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ type: 'module' }));
  const run = spawnSync(process.execPath, ['--experimental-strip-types', 'lib/server/install-policy-study.ts', '--source', source, '--manifest', f.manifest, '--sha256', f.sha256, '--data-dir', data], { cwd: runtime, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).status, 'validated-dry-run'); assert.equal(fs.existsSync(root()), false);
});
test('a catalog change outside the lock is detected before this activation', () => {
  const a = fixture(); installPolicyStudy({ ...a, install: true }); const b = fixture('second-fixture'); const original = fs.readFileSync(catalog());
  const liveRoot = fs.realpathSync(root()), rename = fs.renameSync;
  mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    const value = rename(from, to);
    if (String(to) === path.join(liveRoot, b.prefix)) fs.writeFileSync(catalog(), Buffer.concat([original, Buffer.from('\n')]));
    return value;
  });
  assert.throws(() => installPolicyStudy({ ...b, install: true }), /Catalog changed concurrently/);
  assert.deepEqual(fs.readFileSync(catalog()), Buffer.concat([original, Buffer.from('\n')])); assert.equal(readPolicyCatalog(root()).releases.length, 1);
});
