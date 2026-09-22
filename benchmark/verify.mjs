#!/usr/bin/env node
// Offline arithmetic fixtures. These never enter a live evaluation or report library.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import criteria from '../rubric/criteria.json' with { type: 'json' };
import sourceManifest from './upstream-manifest.json' with { type: 'json' };
import { FULL_PROTOCOL, createEvaluationPlan, sha256 } from './protocol.mjs';

const sourceIndex = process.argv.indexOf('--source');
if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) throw Error('Usage: node benchmark/verify.mjs --source PINNED_REFERENCE_DIRECTORY');
const reference = path.resolve(process.argv[sourceIndex + 1]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'company-neutral-benchmark-fixture-'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const read = file => JSON.parse(fs.readFileSync(file));
const executionProfile = { browserBuild: 'offline-fixture', captureEnvironment: 'offline-fixture', timingProfile: 'offline-fixture',
  judgeTransport: 'offline-fixture', judgeModel: 'claude-opus-4-8', judgeEffort: 'high', judgeRuntime: 'offline-fixture',
  auditorModel: 'claude-opus-4-8', auditorTransport: 'offline-fixture', auditorEffort: 'high', auditorRuntime: 'offline-fixture',
  judgeSpecSha256: 'a'.repeat(64), auditorSpecSha256: 'b'.repeat(64), timingSourceSha256: 'c'.repeat(64) };

try {
  // Check the reusable contract against the hash-verified, side-effect-free source
  // modules as well as testing aggregate arithmetic. These verdicts are fixtures.
  function sourceBytes(name) {
    const bytes = fs.readFileSync(path.join(reference, 'runner', name));
    const pin = sourceManifest.files.find(file => file.path === `runner/${name}`);
    assert.equal(sha256(bytes), pin?.sha256, `Pinned source mismatch: ${name}`);
    return bytes;
  }
  async function sourceModule(name) {
    const bytes = sourceBytes(name);
    const destination = path.join(scratch, `${name}.mjs`);
    fs.writeFileSync(destination, bytes);
    return import(pathToFileURL(destination).href);
  }
  assert.equal(sourceManifest.commit, FULL_PROTOCOL.sourceCommit);
  const { CHECKS, SIGNAL_GATE, deriveScores } = await sourceModule('eval-score.js');
  const { LANE_W, speedScore } = await sourceModule('lane-weights.js');
  const sourceCriteria = Object.entries(CHECKS).flatMap(([mode, dimensions]) =>
    Object.entries(dimensions).flatMap(([dimension, checks]) => Object.entries(checks).map(([id, points]) =>
      ({ mode, dimension, id, points, signal_gate: SIGNAL_GATE[id] || null }))));
  assert.equal(sourceCriteria.length, 26);
  assert.deepEqual(criteria.criteria.map(({ mode, dimension, id, points, signal_gate }) =>
    ({ mode, dimension, id, points, signal_gate })), sourceCriteria);
  const rubric = sourceBytes('eval-rubric.md');
  assert.equal(criteria.commit, FULL_PROTOCOL.sourceCommit);
  assert.equal(criteria.source_sha256, sha256(rubric));
  for (const criterion of criteria.criteria) {
    const rows = rubric.toString('utf8').split('\n').filter(line => line.startsWith(`| \`${criterion.id}\` |`));
    assert.equal(rows.length, 1, `Exactly one source definition required: ${criterion.id}`);
    assert.equal(criterion.passes_when, rows[0].split('|').at(-2).trim(), `Pass definition drift: ${criterion.id}`);
  }
  for (const mode of ['shopping', 'support']) {
    const weights = FULL_PROTOCOL.weights[mode];
    assert.deepEqual(LANE_W[mode], { a: weights.automation, q: weights.quality, s: weights.speed });
    const definitions = sourceCriteria.filter(check => check.mode === mode);
    const checks = Object.fromEntries(definitions.map(check => [check.id, { pass: true, evidence: 'Offline fixture quote' }]));
    const allSignals = Object.fromEntries(Object.values(SIGNAL_GATE).map(signal => [signal, true]));
    assert.equal(deriveScores(mode, checks, allSignals).total, 100);
    for (const definition of definitions) {
      const shortQuote = structuredClone(checks); shortQuote[definition.id].evidence = ' ab ';
      assert.equal(deriveScores(mode, shortQuote, allSignals).total, 100 - definition.points);
      const missingCheck = structuredClone(checks); delete missingCheck[definition.id];
      assert.equal(deriveScores(mode, missingCheck, allSignals), null);
    }
    const absentSignals = Object.fromEntries(Object.keys(allSignals).map(signal => [signal, false]));
    assert.equal(deriveScores(mode, checks, absentSignals).total, mode === 'shopping' ? 82 : 60);
    const failed = Object.fromEntries(definitions.map(check => [check.id, { pass: false, evidence: '' }]));
    assert.equal(deriveScores(mode, failed, allSignals).total, 0);
  }
  assert.equal(speedScore(FULL_PROTOCOL.speed.fullCreditSeconds), 100);
  assert.equal(speedScore(FULL_PROTOCOL.speed.zeroCreditSeconds), 0);
  assert.equal(speedScore(-1), 100);
  assert.equal(speedScore(30), 0);

  // Four unrelated, arbitrary company names; no source-provider special cases.
  const tools = ['First arbitrary tool', 'Second arbitrary tool', 'Third arbitrary tool', 'Fourth arbitrary tool'].map((name, index) => ({
    name, website: `https://tool${index}.example.com`, storefronts: Array.from({ length: 5 }, (_, store) => ({
      name: `Store ${store}`, website: `https://store${index}-${store}.example.com`, adapter: 'fixture',
      deploymentEvidence: 'Offline fixture; not deployment evidence', deploymentVerified: true, adapterReviewed: true,
    })),
  }));
  const { plan, roster } = createEvaluationPlan({ tools, runDate: '2026-09-21', executionProfile });
  write(path.join(scratch, 'study-manifest.json'), plan);
  write(path.join(scratch, 'study-roster.json'), roster);
  const raw = path.join(scratch, 'results', plan.runDate, 'conv');
  fs.mkdirSync(raw, { recursive: true });
  const scores = {};
  for (const context of plan.contexts) {
    const index = roster.filter(store => store.vendor === context.provider).findIndex(store => store.key === context.storeKey);
    const latency = context.guardrail ? 60000 : context.mode === 'shopping' ? (index + 1) * 4000 : 3000;
    const reply = 'Our return policy allows returns within thirty days. The item must be unused and in its original packaging. We cover return shipping for damaged items.';
    const turns = Array.from({ length: context.plannedTurns }, (_, i) => ({ turn: i + 1, q: 'What is your policy?', by: 'ai',
      complete_ms: latency, ai_latency_ms: latency, ttft_ms: 500, replyText: reply, replyTail: reply, handover: false }));
    write(path.join(raw, `${context.id}.json`), { key: context.storeKey, vendor: context.provider, mode: context.mode,
      theme: context.theme, date: plan.runDate, capturedAt: `${plan.runDate}T14:00:00.000Z`, valid: true, turns,
      stats: { avg_ms: latency, success_rate: 100, handover_turn: null } });
    scores[`${plan.runDate}/${context.id}.json`] = { v: 2, mode: context.mode, total: context.guardrail ? 100 : 60 + 10 * index,
      rubric: {}, resolution_class: 'resolved', learning: 'Offline arithmetic fixture; not a model judgment' };
  }
  write(path.join(scratch, 'scores.json'), scores);
  function seal() {
    write(path.join(scratch, 'raw-manifest.json'), { studyManifestSha256: sha256(fs.readFileSync(path.join(scratch, 'study-manifest.json'))),
      files: plan.contexts.map(context => ({ id: context.id, sha256: sha256(fs.readFileSync(path.join(raw, `${context.id}.json`))) })) });
    write(path.join(scratch, 'study-completion.json'), { studyId: plan.studyId, coreAttemptsFinished: plan.expectedCoreConversations,
      guardrailAttemptsFinished: plan.expectedGuardrailConversations, rawManifestSha256: sha256(fs.readFileSync(path.join(scratch, 'raw-manifest.json'))) });
  }
  function aggregate(label, expectFailure = false) {
    const output = path.join(scratch, label);
    const child = spawnSync(process.execPath, [new URL('./aggregate.mjs', import.meta.url).pathname,
      '--workspace', scratch, '--source', reference, '--scores', path.join(scratch, 'scores.json'), '--out', output],
    { encoding: 'utf8', timeout: 60000 });
    if (expectFailure) return child;
    assert.equal(child.status, 0, child.stderr);
    return read(path.join(output, 'aggregation.json'));
  }
  seal();
  const baseline = aggregate('baseline');
  assert.equal(baseline.providers.length, 4);
  assert.equal(baseline.guardrails.length, 20);
  for (const provider of baseline.providers) {
    assert.equal(provider.shopping.n, 25);
    assert.equal(provider.shopping.q, 80);
    assert.equal(provider.shopping.l, 12);
    assert.equal(provider.shopping.a, 100);
    assert.equal(provider.shopping.composite, 81);
    assert.equal(provider.support.composite, 92);
    assert.equal(provider.overall.score, 87);
  }
  // Null timing must not be imputed; no-answer must not lower the automation denominator.
  for (const context of plan.contexts.filter(item => item.mode === 'shopping' && !item.guardrail)) {
    const index = roster.filter(store => store.vendor === context.provider).findIndex(store => store.key === context.storeKey);
    if (index >= 3) continue;
    const filename = path.join(raw, `${context.id}.json`), record = read(filename);
    record.valid = false;
    for (const turn of record.turns) Object.assign(turn, { complete_ms: null, ai_latency_ms: null, replyText: '', replyTail: '' });
    write(filename, record);
  }
  seal();
  for (const provider of aggregate('thin').providers) {
    assert.equal(provider.shopping.composite, null);
    assert.equal(provider.shopping.latencyValidConversations, 10);
    assert.equal(provider.shopping.outcomes.no_answer, 15);
    assert.equal(provider.shopping.outcomes.automated, 10);
    assert.equal(provider.overall, null);
    assert.equal(provider.support.composite, 92);
  }
  fs.appendFileSync(path.join(raw, `${plan.contexts[0].id}.json`), ' ');
  const rejected = aggregate('tampered', true);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /raw capture changed after completion/);
  console.log('PASS: all 26 source criteria, signal/evidence gates, published lane weights, four arbitrary companies, exact staged rounding, guardrail exclusion, no-answer denominator, rank floor, and sealed-evidence tamper rejection. Offline fixtures only; no live or model calls.');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
