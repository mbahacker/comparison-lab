// Private local artifact checks. This verifies bytes and arithmetic, not model authenticity.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import criteria from '../rubric/criteria.json' with { type: 'json' };
import manifest from './upstream-manifest.json' with { type: 'json' };
import { FULL_PROTOCOL, validateCohort, sha256 } from './protocol.mjs';

const read = filename => { const bytes = fs.readFileSync(filename); return { bytes, value: JSON.parse(bytes), sha256: sha256(bytes) }; };
const equal = (a, b, message) => { if (!isDeepStrictEqual(a, b)) throw Error(message); };
function contained(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw Error('Evidence pins must be workspace-relative');
  const filename = fs.realpathSync(path.resolve(root, relative));
  if (!filename.startsWith(root + path.sep)) throw Error('Evidence path escapes workspace');
  return filename;
}
function sampleIds(scores) {
  const entries = Object.entries(scores).filter(([, score]) => score.v === 2 && score.checks);
  const lanes = ['shopping', 'support'].map(mode => entries.filter(([, score]) => score.mode === mode).sort((a, b) => a[0].localeCompare(b[0])));
  const result = [];
  for (let i = 0; result.length < Math.min(FULL_PROTOCOL.audit.conversations, entries.length) && (i < lanes[0].length || i < lanes[1].length); i++) {
    if (lanes[0][i]) result.push(lanes[0][i][0]);
    if (lanes[1][i] && result.length < FULL_PROTOCOL.audit.conversations) result.push(lanes[1][i][0]);
  }
  return result;
}

export async function loadReportInputs(options) {
  for (const key of ['workspace', 'source', 'aggregate', 'scores', 'out']) if (typeof options[key] !== 'string' || !options[key]) throw Error('Explicit path required: ' + key);
  const workspace = fs.realpathSync(options.workspace), source = fs.realpathSync(options.source);
  const aggregatePath = fs.realpathSync(options.aggregate), scoresPath = fs.realpathSync(options.scores);
  const out = path.join(fs.realpathSync(path.dirname(path.resolve(options.out))), path.basename(options.out));
  if (fs.existsSync(out) || [workspace, source].some(root => out === root || out.startsWith(root + path.sep))) throw Error('Output must be a new directory outside workspace and source');
  const planInput = read(contained(workspace, 'study-manifest.json')), rosterInput = read(contained(workspace, 'study-roster.json'));
  const plan = planInput.value, roster = rosterInput.value;
  const cohort = validateCohort(plan, roster);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.runDate) || new Date(plan.runDate + 'T00:00:00Z').toISOString().slice(0, 10) !== plan.runDate) throw Error('Invalid study date');
  const aggregateInput = read(aggregatePath), scoreInput = read(scoresPath);
  const aggregate = aggregateInput.value, scores = scoreInput.value;
  if (aggregate.schema !== 'full-benchmark-study-aggregation/v1' || aggregate.studyId !== plan.studyId || aggregate.sourceCommit !== FULL_PROTOCOL.sourceCommit) throw Error('Aggregate study or source mismatch');
  if (aggregate.provenance?.studyManifestSha256 !== planInput.sha256 || aggregate.provenance.rosterSha256 !== rosterInput.sha256 || aggregate.provenance.scoresSha256 !== scoreInput.sha256) throw Error('Aggregate input hashes do not match');
  if (typeof aggregate.partial !== 'boolean') throw Error('Aggregate must declare partial status');
  if (manifest.commit !== FULL_PROTOCOL.sourceCommit) throw Error('Reference commit mismatch');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'full-benchmark-report-'));
  const sourceFiles = [], copies = [
    { filename: contained(workspace, 'study-manifest.json'), artifactPath: 'inputs/study-manifest.json', sha256: planInput.sha256 },
    { filename: contained(workspace, 'study-roster.json'), artifactPath: 'inputs/study-roster.json', sha256: rosterInput.sha256 },
    { filename: aggregatePath, artifactPath: 'inputs/aggregation.json', sha256: aggregateInput.sha256 },
    { filename: scoresPath, artifactPath: 'inputs/eval-scores.json', sha256: scoreInput.sha256 },
  ];
  try {
    fs.writeFileSync(path.join(scratch, 'package.json'), '{"type":"module"}');
    const reference = name => {
      const relative = 'runner/' + name, bytes = fs.readFileSync(path.join(source, relative));
      const pin = manifest.files.find(file => file.path === relative);
      if (!pin || sha256(bytes) !== pin.sha256) throw Error('Pinned source changed: ' + relative);
      if (!sourceFiles.some(file => file.path === relative)) sourceFiles.push({ path: relative, sha256: pin.sha256 });
      fs.writeFileSync(path.join(scratch, name), bytes);
      return bytes;
    };
    for (const name of ['eval-score.js', 'eval-signals.js', 'classify.js', 'reply-clean.js', 'pools.js', 'message-style.js', 'eval-audit.js', 'eval-rubric.md']) reference(name);
    if (criteria.commit !== FULL_PROTOCOL.sourceCommit || criteria.source_sha256 !== sha256(reference('eval-rubric.md'))) throw Error('Rubric reference mismatch');
    for (const file of aggregate.provenance.sourceFiles || []) {
      if (!file.path.startsWith('runner/') || file.path.slice(7).includes('/')) throw Error('Invalid aggregate source path');
      if (sha256(reference(file.path.slice(7))) !== file.sha256) throw Error('Aggregate source pin mismatch');
    }
    const [{ CHECKS, SIGNAL_GATE, deriveScores }, { convoSignals }, pools, { normalizeUserMessage }] = await Promise.all(
      ['eval-score.js', 'eval-signals.js', 'pools.js', 'message-style.js'].map(name => import(pathToFileURL(path.join(scratch, name)).href)));
    const definitions = Object.entries(CHECKS).flatMap(([mode, dimensions]) => Object.entries(dimensions).flatMap(([dimension, checks]) => Object.entries(checks).map(([id, points]) => ({ mode, dimension, id, points, signal_gate: SIGNAL_GATE[id] || null }))));
    equal(criteria.criteria.map(({ mode, dimension, id, points, signal_gate }) => ({ mode, dimension, id, points, signal_gate })), definitions, 'Criterion weights or gates changed');
    const rubricLines = reference('eval-rubric.md').toString('utf8').split('\n');
    for (const criterion of criteria.criteria) {
      const rows = rubricLines.filter(line => line.startsWith(`| \`${criterion.id}\` |`));
      if (rows.length !== 1 || rows[0].split('|').at(-2).trim() !== criterion.passes_when) throw Error('Criterion pass definition changed');
    }
    // Recompute the supplied aggregate in disposable storage. This does not execute captures or judges.
    const recompute = spawnSync(process.execPath, [new URL('./aggregate.mjs', import.meta.url).pathname, '--workspace', workspace, '--source', source,
      '--scores', scoresPath, '--label', aggregate.label, '--out', path.join(scratch, 'aggregation'), ...(aggregate.partial ? ['--allow-partial'] : [])],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH || '' } });
    if (recompute.status !== 0) throw Error('Aggregate verification failed: ' + (recompute.stderr || recompute.stdout).slice(-1500));
    const recomputed = read(path.join(scratch, 'aggregation/aggregation.json')).value;
    for (const key of ['studyId', 'label', 'partial', 'missing', 'rankingWindow', 'coverage', 'providers', 'ledger', 'guardrails', 'bakedRows']) equal(aggregate[key], recomputed[key], 'Aggregate arithmetic or coverage mismatch: ' + key);
    for (const key of ['inputs', 'sourceFiles', 'rawManifestSha256', 'extractedAggregationSha256']) equal(aggregate.provenance[key], recomputed.provenance[key], 'Aggregate provenance mismatch: ' + key);
    const rawById = new Map();
    const conversations = plan.contexts.map(context => {
      const id = `${plan.runDate}/${context.id}.json`, rawPath = `results/${plan.runDate}/conv/${context.id}.json`;
      const plannedQuestions = (context.mode === 'shopping' ? pools.SHOPPING_THEMES : pools.SUPPORT_THEMES).find(theme => theme.key === context.theme).turns.map(normalizeUserMessage);
      if (!fs.existsSync(path.join(workspace, rawPath))) return { ...context, id, status: 'pending', plannedQuestions, turns: [], checks: [] };
      const raw = read(contained(workspace, rawPath));
      if (raw.value.key !== context.storeKey || raw.value.vendor !== context.provider || raw.value.mode !== context.mode || raw.value.theme !== context.theme || raw.value.date !== plan.runDate || !Array.isArray(raw.value.turns)) throw Error('Raw identity mismatch: ' + id);
      rawById.set(id, raw);
      const artifactPath = 'raw/' + context.id + '.json'; copies.push({ filename: contained(workspace, rawPath), artifactPath, sha256: raw.sha256 });
      const score = scores[id] || null, signals = convoSignals(raw.value.turns);
      const literal = !!score?.audited && aggregate.label === 'as-published-audit';
      const checks = criteria.criteria.filter(c => c.mode === context.mode).map(c => {
        const check = score?.checks?.[c.id];
        if (score && (!check || typeof check.pass !== 'boolean')) throw Error('Score lacks required checks: ' + id);
        const gate = literal && c.signal_gate === 'no_deflect' ? null : c.signal_gate;
        const pass = !!check?.pass && (literal || typeof check.evidence === 'string' && check.evidence.trim().length >= 3) && (!gate || signals[gate]);
        return { ...c, verdict: check || null, primary: null, audit: null, signal: c.signal_gate ? signals[c.signal_gate] : null, activeGate: gate, awarded: score ? pass ? c.points : 0 : null };
      });
      if (score) {
        if (score.v !== 2 || score.mode !== context.mode || checks.reduce((sum, check) => sum + check.awarded, 0) !== score.total) throw Error('Criterion arithmetic mismatch: ' + id);
        const sums = Object.fromEntries(Object.keys(CHECKS[context.mode]).map(dimension => [dimension, checks.filter(c => c.dimension === dimension).reduce((sum, c) => sum + c.awarded, 0)]));
        equal(sums, score.rubric, 'Criterion dimension totals mismatch: ' + id);
      }
      const ledger = aggregate.ledger.find(row => row.id === id);
      return { ...context, id, plannedQuestions, status: raw.value.error || raw.value.turns.some(t => t.error) ? 'capture error' : ledger?.exclusion || (raw.value.valid === false ? 'capture ineligible' : score ? 'judged' : 'awaiting judgment'), capturedAt: raw.value.capturedAt || null,
        rawSha256: raw.sha256, rawPath, artifactPath, raw: raw.value, turns: raw.value.turns, score, signals, checks, ledger };
    });
    for (const id of Object.keys(scores)) if (!rawById.has(id)) throw Error('Score without a captured context: ' + id);
    let seal = null, audit = null;
    if (options.complete) {
      if (aggregate.partial || rawById.size !== plan.contexts.length || !aggregate.coverage.officialCoverageGatePassed || !options.audit) throw Error('Complete report requires full sealed capture, non-partial aggregate, coverage and audit receipt');
      const completion = read(contained(workspace, 'study-completion.json')), rawManifest = read(contained(workspace, 'raw-manifest.json'));
      const files = rawManifest.value.files;
      if (completion.value.studyId !== plan.studyId || completion.value.rawManifestSha256 !== rawManifest.sha256 || rawManifest.value.studyManifestSha256 !== planInput.sha256
        || completion.value.coreAttemptsFinished !== plan.expectedCoreConversations || completion.value.guardrailAttemptsFinished !== plan.expectedGuardrailConversations
        || !Array.isArray(files) || files.length !== plan.contexts.length || new Set(files.map(file => file.id)).size !== files.length) throw Error('Incomplete or mismatched raw seal');
      for (const context of plan.contexts) {
        const file = files.find(row => row.id === context.id), raw = rawById.get(`${plan.runDate}/${context.id}.json`);
        if (!file || file.sha256 !== raw.sha256 || file.path && file.path !== `results/${plan.runDate}/conv/${context.id}.json`) throw Error('Sealed raw hash/path mismatch');
      }
      seal = { completion: completion.value, completionSha256: completion.sha256, rawManifestSha256: rawManifest.sha256 };
      copies.push({ filename: contained(workspace, 'study-completion.json'), artifactPath: 'inputs/study-completion.json', sha256: completion.sha256 },
        { filename: contained(workspace, 'raw-manifest.json'), artifactPath: 'inputs/raw-manifest.json', sha256: rawManifest.sha256 });
      const receipt = read(fs.realpathSync(options.audit));
      copies.push({ filename: fs.realpathSync(options.audit), artifactPath: 'audit/receipt.json', sha256: receipt.sha256 });
      const a = receipt.value;
      if (a.schema !== 'full-benchmark-report-audit/v1' || a.complete !== true || !['as-published-audit', 'canonical-audit'].includes(a.variant) || a.variant !== aggregate.label
        || a.studyManifestSha256 !== planInput.sha256 || a.rawManifestSha256 !== rawManifest.sha256 || a.scoresSha256 !== scoreInput.sha256 || a.aggregateSha256 !== aggregateInput.sha256) throw Error('Audit receipt does not bind these exact inputs');
      const pinned = (pin, artifactPath) => {
        if (!pin?.path || !/^[a-f0-9]{64}$/.test(pin.sha256 || '')) throw Error('Invalid audit artifact pin');
        const filename = contained(workspace, pin.path), item = read(filename);
        if (item.sha256 !== pin.sha256) throw Error('Audit artifact hash mismatch: ' + pin.path);
        if (artifactPath) copies.push({ filename, artifactPath, sha256: pin.sha256 });
        return item;
      };
      if (!Array.isArray(a.auditedFiles) || !a.auditedFiles.length || !Array.isArray(a.judgmentProvenance) || !a.judgmentProvenance.length) throw Error('Audit outputs and operator-validated judgment provenance pins are required');
      const pre = pinned(a.preAuditScores, 'audit/pre-audit-scores.json'), summary = pinned(a.auditSummary, 'audit/summary.json');
      a.judgmentProvenance.forEach((pin, i) => pinned(pin, `audit/judgment-provenance-${i + 1}.json`));
      equal(Object.keys(pre.value).sort(), Object.keys(scores).sort(), 'Pre/post audit score identities changed');
      const audited = a.auditedFiles.flatMap((pin, i) => { const item = pinned(pin, `audit/audited-${i + 1}.json`); if (!Array.isArray(item.value)) throw Error('Audited file must contain an array'); return item.value; });
      const selected = sampleIds(pre.value);
      equal(audited.map(row => row.id).sort(), [...selected].sort(), 'Audit differs from source default sample');
      for (const row of audited) {
        const before = pre.value[row.id], defs = criteria.criteria.filter(c => c.mode === before.mode);
        equal(Object.keys(row.audit || {}).sort(), defs.map(c => c.id).sort(), 'Audit must address every required check');
        for (const [id, verdict] of Object.entries(row.audit)) if (!['AGREE', 'FALSE_POSITIVE', 'FALSE_NEGATIVE'].includes(verdict.classification)
          || verdict.classification === 'FALSE_POSITIVE' && before.checks[id].pass !== true
          || verdict.classification === 'FALSE_NEGATIVE' && before.checks[id].pass !== false) throw Error('Invalid audit correction');
      }
      for (const [id, score] of Object.entries(pre.value)) {
        const raw = rawById.get(id), derived = deriveScores(score.mode, score.checks, convoSignals(raw.value.turns));
        if (!derived || derived.total !== score.total || score.v !== 2 || score.audited) throw Error('Pre-audit canonical score does not reconcile');
        equal(derived.rubric, score.rubric, 'Pre-audit dimensions do not reconcile');
      }
      fs.writeFileSync(path.join(scratch, 'eval-scores.json'), pre.bytes);
      fs.mkdirSync(path.join(scratch, 'audited'));
      fs.writeFileSync(path.join(scratch, 'audited/audited-01.json'), JSON.stringify(audited));
      const rawDir = path.join(scratch, 'results', plan.runDate, 'conv'); fs.mkdirSync(rawDir, { recursive: true });
      for (const [id, raw] of rawById) fs.writeFileSync(path.join(rawDir, id.slice(11)), raw.bytes);
      const merge = spawnSync(process.execPath, [path.join(scratch, 'eval-audit.js'), 'merge', path.join(scratch, 'audited')], { cwd: scratch, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH || '' } });
      if (merge.status !== 0) throw Error('Pinned offline audit merge failed');
      const expected = read(path.join(scratch, 'eval-scores.json')).value, expectedSummary = read(path.join(scratch, 'eval-audit.json')).value;
      if (a.variant === 'canonical-audit') for (const [id, score] of Object.entries(expected)) {
        const derived = deriveScores(score.mode, score.checks, convoSignals(rawById.get(id).value.turns));
        score.rubric = derived.rubric; score.total = derived.total;
      }
      equal(scores, expected, 'Final cache differs from declared audit path');
      const withoutDate = value => { const rest = { ...value }; delete rest.audited_at; return rest; };
      equal(withoutDate(summary.value), withoutDate(expectedSummary), 'Audit summary arithmetic mismatch');
      for (const c of conversations) for (const check of c.checks) { check.primary = pre.value[c.id]?.checks[check.id] || null; check.audit = audited.find(row => row.id === c.id)?.audit[check.id] || null; }
      audit = { receipt: a, receiptSha256: receipt.sha256, summary: summary.value, sampledIds: selected, core: selected.filter(id => !conversations.find(c => c.id === id).guardrail).length, guardrail: selected.filter(id => conversations.find(c => c.id === id).guardrail).length,
        provenanceAuthentication: 'Operator-supplied judgment files are hash-checked only. This renderer does not authenticate model calls or replace independent lineage validation.' };
    }
    const captured = conversations.filter(c => c.rawSha256), dates = captured.map(c => Date.parse(c.capturedAt)).filter(Number.isFinite);
    const visibleAggregate = structuredClone(aggregate);
    if (!options.complete) visibleAggregate.providers = visibleAggregate.providers.map(provider => ({ name: provider.name, overall: null,
      ...Object.fromEntries(['shopping', 'support'].map(lane => [lane, { provider: provider.name, rankable: false, composite: null,
        ...Object.fromEntries(['outcomes', 'capturedAttempts', 'excludedAttempts', 'latencyValidConversations', 'judgeScored'].map(key => [key, provider[lane][key]])) }])) }));
    return { out, copies, data: { schema: 'full-benchmark-private-report/v1', private: true, commissioner: 'Alhena Research Lab', status: options.complete ? 'complete-inputs-verified' : 'partial', generatedAt: new Date().toISOString(), protocol: FULL_PROTOCOL,
      plan, roster, cohort, criteria: criteria.criteria, aggregate: visibleAggregate, conversations, audit, seal, sourceFiles,
      artifacts: copies.map(({ artifactPath, sha256: hash }) => ({ path: artifactPath, sha256: hash })),
      counts: { plannedContexts: plan.contexts.length, plannedCoreQuestions: plan.plannedCoreTurns, plannedGuardrailQuestions: plan.plannedGuardrailTurns, captured: captured.length, coreCaptured: captured.filter(c => !c.guardrail).length, guardrailCaptured: captured.filter(c => c.guardrail).length, judged: captured.filter(c => c.score).length,
        recordedRows: captured.reduce((n, c) => n + c.turns.length, 0), explicitlyUnsent: captured.reduce((n, c) => n + c.turns.filter(t => t.unsent).length, 0), measuredAiReplies: captured.reduce((n, c) => n + c.turns.filter(t => !t.unsent && t.by === 'ai' && t.complete_ms != null).length, 0) },
      captureWindow: { firstStartedAt: dates.length ? new Date(Math.min(...dates)).toISOString() : null, lastStartedAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null, missingOrInvalidStarts: captured.length - dates.length, sealedAt: seal?.completion.finishedAt || null },
      provenance: { studyManifestSha256: planInput.sha256, rosterSha256: rosterInput.sha256, aggregateSha256: aggregateInput.sha256, scoresSha256: scoreInput.sha256, sourceCommit: FULL_PROTOCOL.sourceCommit },
      limitations: [
        'Commissioned by Alhena Research Lab. This is a private selected-storefront study, not independent third-party certification or a market-wide ranking.',
        'The renderer verifies source pins, file seals and deterministic arithmetic. It does not authenticate model calls, deployment attribution, browser execution or operator-supplied judgment provenance; those require separate validation before rendering.',
        'Automation measures classified containment. Transcript quality in cold, logged-out sessions does not independently verify catalog or policy facts, or completion of refunds, cancellations and other order actions.',
        'Recorded question rows are not proof of submission. Explicitly unsent rows, measured AI replies, planned questions and handoffs are counted separately. Unmeasured does not mean no visible reply.',
        'Capture timestamps mark context starts. A cohort seal, when supplied, is an upper bound on finishing, not the exact time of the final reply.',
        'The primary path is pinned homepage gen.js arithmetic. Guardrails are excluded from composites but may enter the published audit sample. Detailed-report widget rules differ and are not blended.',
        'The published audit merger omits canonical support no_deflect gates and minimum quote-length checks for changed conversations. As-published and canonical variants must be retained and identified; selecting a favorable variant is not permitted.',
        'The source ranks a 90-day window; the application’s separate 30-day original-capture reuse policy is not enforced by this local renderer. Derived comparisons do not create new evidence or a fresh joint audit.',
        'Runtime, adapter, source amendments and judgment-lineage exceptions need separate operator review. This renderer does not infer archive exclusions or compatibility from a file name.',
      ] } };
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
