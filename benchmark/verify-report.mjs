#!/usr/bin/env node
// Offline software fixtures only. No storefront, model, email or publication calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sourceManifest from './upstream-manifest.json' with { type: 'json' };
import { createEvaluationPlan, sha256 } from './protocol.mjs';

const sourceIndex = process.argv.indexOf('--source');
if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) throw Error('Usage: node benchmark/verify-report.mjs --source PINNED_REFERENCE_DIRECTORY');
const reference = path.resolve(process.argv[sourceIndex + 1]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-report-software-fixture-'));
const workspace = path.join(scratch, 'workspace');
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const read = file => JSON.parse(fs.readFileSync(file));
const pin = relative => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(workspace, relative))) });
const executionProfile = { browserBuild: 'offline-fixture', captureEnvironment: 'offline-fixture', timingProfile: 'offline-fixture',
  judgeTransport: 'offline-fixture', judgeModel: 'claude-opus-4-8', judgeEffort: 'high', judgeRuntime: 'offline-fixture',
  auditorModel: 'claude-opus-4-8', auditorTransport: 'offline-fixture', auditorEffort: 'high', auditorRuntime: 'offline-fixture',
  judgeSpecSha256: 'a'.repeat(64), auditorSpecSha256: 'b'.repeat(64), timingSourceSha256: 'c'.repeat(64) };

function run(file, args) {
  return spawnSync(process.execPath, [file, ...args], { cwd: workspace, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
}
function succeeds(child) { assert.equal(child.status, 0, child.stderr || child.stdout); }

try {
  fs.mkdirSync(workspace);
  write(path.join(workspace, 'package.json'), { type: 'module' });
  for (const file of sourceManifest.files.filter(file => /^runner\/[^/]+\.js$/.test(file.path))) {
    const bytes = fs.readFileSync(path.join(reference, file.path));
    assert.equal(sha256(bytes), file.sha256, `Pinned source mismatch: ${file.path}`);
    fs.writeFileSync(path.join(workspace, path.basename(file.path)), bytes);
  }
  const { CHECKS, deriveScores } = await import(pathToFileURL(path.join(workspace, 'eval-score.js')).href);
  const { convoSignals } = await import(pathToFileURL(path.join(workspace, 'eval-signals.js')).href);
  const { SHOPPING_THEMES, SUPPORT_THEMES } = await import(pathToFileURL(path.join(workspace, 'pools.js')).href);
  const { normalizeUserMessage } = await import(pathToFileURL(path.join(workspace, 'message-style.js')).href);
  const tools = ['Cobalt tool', 'Marigold tool', 'Juniper tool', 'Quartz tool'].map((name, index) => ({
    name, website: `https://tool${index}.example.com`, storefronts: Array.from({ length: 5 }, (_, store) => ({
      name: `Fixture customer ${store}`, website: `https://store${index}-${store}.example.com`, adapter: 'offline-fixture',
      deploymentEvidence: 'Software fixture only, not a real deployment', deploymentVerified: true, adapterReviewed: true,
    })),
  }));
  const { plan, roster } = createEvaluationPlan({ tools, runDate: '2026-09-21', executionProfile });
  write(path.join(workspace, 'study-manifest.json'), plan);
  write(path.join(workspace, 'study-roster.json'), roster);
  const raw = path.join(workspace, 'results', plan.runDate, 'conv');
  fs.mkdirSync(raw, { recursive: true });
  const hostile = '</script><img src=x onerror="alert(1)">';
  const reply = `Offline software fixture only. This is not a real customer conversation or a real provider answer. Unsafe transcript text for the escaping regression: ${hostile}`;
  const scores = {};
  for (const context of plan.contexts) {
    const pool = (context.mode === 'shopping' ? SHOPPING_THEMES : SUPPORT_THEMES).find(theme => theme.key === context.theme);
    assert.equal(pool.turns.length, context.plannedTurns);
    const turns = pool.turns.map((question, index) => ({ turn: index + 1, q: normalizeUserMessage(question), by: 'ai',
      complete_ms: 7000, ai_latency_ms: 7000, ttft_ms: 500, replyText: reply, replyTail: reply, handover: false }));
    write(path.join(raw, `${context.id}.json`), { key: context.storeKey, store: context.store, vendor: context.provider,
      mode: context.mode, theme: context.theme, date: plan.runDate, capturedAt: `${plan.runDate}T14:00:00Z`, valid: true,
      turns, stats: { avg_ms: 7000, success_rate: 100, handover_turn: null } });
    const dimensions = CHECKS[context.mode];
    const checks = Object.fromEntries(Object.values(dimensions).flatMap(dimension => Object.keys(dimension).map(id =>
      [id, { pass: false, evidence: '' }])));
    scores[`${plan.runDate}/${context.id}.json`] = { v: 2, mode: context.mode, checks,
      rubric: Object.fromEntries(Object.keys(dimensions).map(dimension => [dimension, 0])), total: 0,
      resolution_class: 'failed', learning: 'Software fixture only; not a model judgment' };
  }
  const scoresPath = path.join(workspace, 'eval-scores.json');
  write(scoresPath, scores);
  fs.copyFileSync(scoresPath, path.join(workspace, 'eval-scores.pre-audit.json'));
  write(path.join(workspace, 'raw-manifest.json'), { studyManifestSha256: sha256(fs.readFileSync(path.join(workspace, 'study-manifest.json'))),
    files: plan.contexts.map(context => ({ id: context.id, sha256: sha256(fs.readFileSync(path.join(raw, `${context.id}.json`))) })) });
  write(path.join(workspace, 'study-completion.json'), { studyId: plan.studyId, coreAttemptsFinished: plan.expectedCoreConversations,
    guardrailAttemptsFinished: plan.expectedGuardrailConversations, rawManifestSha256: sha256(fs.readFileSync(path.join(workspace, 'raw-manifest.json'))) });
  const auditDir = path.join(workspace, 'audit');
  succeeds(run(path.join(workspace, 'eval-audit.js'), ['pack', auditDir]));
  for (const file of fs.readdirSync(auditDir).filter(file => /^audit-\d+\.json$/.test(file))) {
    const audited = read(path.join(auditDir, file)).map(packet => ({ id: packet.id,
      audit: Object.fromEntries(Object.keys(packet.verdicts).map(id => [id, { classification: 'AGREE', evidence: '' }])) }));
    write(path.join(auditDir, file.replace('audit-', 'audited-')), audited);
  }
  succeeds(run(path.join(workspace, 'eval-audit.js'), ['merge', auditDir]));
  write(path.join(workspace, 'offline-fixture-provenance.json'), { fixture: true, modelCalls: 0,
    notice: 'Software test fixture. No actual browser capture, model judgment or model audit occurred.' });
  let aggregatePath = path.join(workspace, 'aggregation', 'as-published-audit', 'aggregation.json');
  succeeds(run(fileURLToPath(new URL('./aggregate.mjs', import.meta.url)), ['--workspace', workspace, '--source', reference,
    '--scores', scoresPath, '--label', 'as-published-audit']));
  const receipt = { schema: 'full-benchmark-report-audit/v1', complete: true, variant: 'as-published-audit',
    studyManifestSha256: pin('study-manifest.json').sha256, rawManifestSha256: pin('raw-manifest.json').sha256,
    scoresSha256: pin('eval-scores.json').sha256, aggregateSha256: sha256(fs.readFileSync(aggregatePath)),
    preAuditScores: pin('eval-scores.pre-audit.json'),
    auditedFiles: fs.readdirSync(auditDir).filter(file => /^audited-.*\.json$/.test(file)).map(file => pin(`audit/${file}`)),
    auditSummary: pin('eval-audit.json'), judgmentProvenance: [pin('offline-fixture-provenance.json')] };
  const receiptPath = path.join(workspace, 'report-audit-receipt.json');
  write(receiptPath, receipt);
  const reportFile = fileURLToPath(new URL('./report.mjs', import.meta.url));
  function render(name, extra = []) {
    const output = path.join(scratch, name);
    return { output, child: run(reportFile, ['--workspace', workspace, '--source', reference, '--aggregate', aggregatePath,
      '--scores', scoresPath, '--out', output, ...extra]) };
  }
  // Output assertions are deliberately separate from implementation internals.
  const partial = render('partial'); succeeds(partial.child);
  const complete = render('complete', ['--complete', '--audit', receiptPath]); succeeds(complete.child);
  const partialData = read(path.join(partial.output, 'evidence.json'));
  const completeData = read(path.join(complete.output, 'evidence.json'));
  assert.equal(partialData.status, 'partial');
  assert.equal(completeData.status, 'complete-inputs-verified');
  for (const data of [partialData, completeData]) {
    assert.deepEqual(data.aggregate.providers.map(provider => provider.name).sort(), tools.map(tool => tool.name).sort());
    assert.equal(data.conversations.length, 220);
    assert.equal(data.counts.plannedContexts, 220);
    assert.equal(data.counts.captured, 220);
    assert.equal(data.counts.judged, 220);
  }
  for (const [data, output] of [[partialData, partial.output], [completeData, complete.output]]) {
    assert.ok(data.artifacts.length > plan.contexts.length, 'Exact input files must accompany captures');
    for (const artifact of data.artifacts) {
      assert.equal(path.isAbsolute(artifact.path), false);
      assert.equal(sha256(fs.readFileSync(path.join(output, artifact.path))), artifact.sha256);
    }
  }
  for (const provider of partialData.aggregate.providers) {
    assert.equal(provider.overall, null);
    for (const lane of ['shopping', 'support']) {
      for (const field of ['composite', 'a', 'q', 'l', 'ci']) assert.equal(provider[lane][field] ?? null, null);
    }
  }
  assert.deepEqual(completeData.aggregate.providers, read(aggregatePath).providers);
  const sampled = fs.readdirSync(auditDir).filter(file => /^audit-\d+\.json$/.test(file))
    .flatMap(file => read(path.join(auditDir, file)).map(packet => packet.id));
  assert.equal(sampled.length, 24);
  assert.deepEqual([...completeData.audit.sampledIds].sort(), [...sampled].sort());
  const sampledProviders = new Set(completeData.conversations.filter(conversation => sampled.includes(conversation.id)).map(conversation => conversation.provider));
  assert.deepEqual([...sampledProviders], ['Cobalt tool']); // Literal source sampling, never rebalanced.
  assert.equal(completeData.audit.core + completeData.audit.guardrail, 24);
  for (const result of [partial, complete]) {
    const html = fs.readFileSync(path.join(result.output, 'report.html'), 'utf8');
    assert.equal(html.includes(hostile), false, 'Untrusted reply escaped out of its data/text boundary');
    assert.equal(html.includes('Alhena vs Gorgias'), false, 'A company-specific report title leaked into generic output');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[0].includes('application/json')) JSON.parse(match[1]);
      else new vm.Script(match[1]);
    }
  }
  const again = render('complete', ['--complete', '--audit', receiptPath]);
  assert.notEqual(again.child.status, 0, 'Existing output must not be overwritten');
  assert.match(again.child.stderr, /new directory/);
  const rawFile = path.join(raw, `${plan.contexts[0].id}.json`), originalRaw = fs.readFileSync(rawFile);
  fs.appendFileSync(rawFile, ' ');
  const badRaw = render('tampered-raw', ['--complete', '--audit', receiptPath]);
  assert.notEqual(badRaw.child.status, 0); assert.match(badRaw.child.stderr, /raw capture changed/);
  fs.writeFileSync(rawFile, originalRaw);
  const originalScores = fs.readFileSync(scoresPath); fs.appendFileSync(scoresPath, ' ');
  const badScores = render('tampered-scores', ['--complete', '--audit', receiptPath]);
  assert.notEqual(badScores.child.status, 0); assert.match(badScores.child.stderr, /input hashes/);
  fs.writeFileSync(scoresPath, originalScores);
  const firstAuditPath = path.join(workspace, receipt.auditedFiles[0].path), originalAudit = fs.readFileSync(firstAuditPath);
  fs.appendFileSync(firstAuditPath, ' ');
  const badAudit = render('tampered-audit', ['--complete', '--audit', receiptPath]);
  assert.notEqual(badAudit.child.status, 0); assert.match(badAudit.child.stderr, /Audit artifact hash mismatch/);
  fs.writeFileSync(firstAuditPath, originalAudit);
  const shortened = read(firstAuditPath); shortened.pop(); write(firstAuditPath, shortened);
  const shortenedReceipt = structuredClone(receipt);
  shortenedReceipt.auditedFiles[0] = pin(receipt.auditedFiles[0].path); write(receiptPath, shortenedReceipt);
  const badSample = render('wrong-audit-sample', ['--complete', '--audit', receiptPath]);
  assert.notEqual(badSample.child.status, 0); assert.match(badSample.child.stderr, /default sample/);
  fs.writeFileSync(firstAuditPath, originalAudit); write(receiptPath, receipt);
  // A symlink escape is rejected even when its target happens to have identical bytes.
  const outside = path.join(scratch, 'outside-workspace.json'); fs.writeFileSync(outside, originalRaw);
  fs.unlinkSync(rawFile); fs.symlinkSync(outside, rawFile);
  const escaped = render('escaped-raw', ['--complete', '--audit', receiptPath]);
  assert.notEqual(escaped.child.status, 0); assert.match(escaped.child.stderr, /escapes workspace/);
  fs.unlinkSync(rawFile); fs.writeFileSync(rawFile, originalRaw);

  // An actual source-audit correction exercises the known literal/canonical divergence.
  // The verdicts below are deterministic software fixtures, never model judgments.
  const supportId = sampled.find(id => scores[id].mode === 'support');
  const supportFile = path.join(raw, supportId.slice(11));
  const supportRaw = read(supportFile);
  const deflection = 'Please email support@example.com to have this resolved. Our team can complete this request only by email. This is an offline software fixture.';
  for (const turn of supportRaw.turns) Object.assign(turn, { replyText: deflection, replyTail: deflection });
  write(supportFile, supportRaw);
  assert.equal(convoSignals(supportRaw.turns).no_deflect, false);
  const revised = structuredClone(scores);
  for (const check of Object.values(revised[supportId].checks)) Object.assign(check, { pass: true, evidence: deflection });
  revised[supportId].checks.k_clean = { pass: false, evidence: '' };
  const prior = deriveScores('support', revised[supportId].checks, convoSignals(supportRaw.turns));
  assert.equal(prior.total, 53);
  revised[supportId].total = prior.total; revised[supportId].rubric = prior.rubric;
  write(scoresPath, revised); fs.copyFileSync(scoresPath, path.join(workspace, 'eval-scores.pre-audit.json'));
  for (const file of receipt.auditedFiles) {
    const entries = read(path.join(workspace, file.path));
    for (const entry of entries) if (entry.id === supportId) entry.audit.k_clean = { classification: 'FALSE_NEGATIVE', evidence: deflection };
    write(path.join(workspace, file.path), entries);
  }
  const manifest = read(path.join(workspace, 'raw-manifest.json'));
  manifest.files.find(file => file.id === supportId.slice(11, -5)).sha256 = sha256(fs.readFileSync(supportFile));
  write(path.join(workspace, 'raw-manifest.json'), manifest);
  const completion = read(path.join(workspace, 'study-completion.json'));
  completion.rawManifestSha256 = pin('raw-manifest.json').sha256; write(path.join(workspace, 'study-completion.json'), completion);
  succeeds(run(path.join(workspace, 'eval-audit.js'), ['merge', auditDir]));
  assert.equal(read(scoresPath)[supportId].total, 100);
  function refreshReceipt(variant) {
    succeeds(run(fileURLToPath(new URL('./aggregate.mjs', import.meta.url)), ['--workspace', workspace, '--source', reference,
      '--scores', scoresPath, '--label', variant]));
    aggregatePath = path.join(workspace, 'aggregation', variant, 'aggregation.json');
    write(receiptPath, { ...receipt, variant, rawManifestSha256: pin('raw-manifest.json').sha256,
      scoresSha256: pin('eval-scores.json').sha256, aggregateSha256: sha256(fs.readFileSync(aggregatePath)),
      preAuditScores: pin('eval-scores.pre-audit.json'), auditedFiles: receipt.auditedFiles.map(file => pin(file.path)),
      auditSummary: pin('eval-audit.json') });
  }
  refreshReceipt('as-published-audit');
  const literal = render('literal-correction', ['--complete', '--audit', receiptPath]); succeeds(literal.child);
  const literalRow = read(path.join(literal.output, 'evidence.json')).conversations.find(row => row.id === supportId);
  assert.equal(literalRow.score.total, 100);
  assert.equal(literalRow.checks.find(check => check.id === 's_answered').awarded, 18);
  const canonical = read(scoresPath);
  for (const [id, score] of Object.entries(canonical)) {
    const row = read(path.join(raw, id.slice(11))), derived = deriveScores(score.mode, score.checks, convoSignals(row.turns));
    score.total = derived.total; score.rubric = derived.rubric;
  }
  write(scoresPath, canonical); refreshReceipt('canonical-audit');
  const canonicalResult = render('canonical-correction', ['--complete', '--audit', receiptPath]); succeeds(canonicalResult.child);
  const canonicalRow = read(path.join(canonicalResult.output, 'evidence.json')).conversations.find(row => row.id === supportId);
  assert.equal(canonicalRow.score.total, 60);
  assert.equal(canonicalRow.checks.find(check => check.id === 's_answered').awarded, 0);
  console.log('PASS: generic private report fixtures, four companies, partial/complete contracts, script escaping, immutable output and tamper/sample rejection. Offline fixtures only; no live or model calls.');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
