import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { db } from './db.ts';
import { hash, iso } from './security.ts';
import { ApiError, type Provider, type Row } from './model.ts';
import { deriveCheckedScore } from '../../worker/scoring.mjs';
import { evaluationCounts } from '../../worker/protocol.mjs';
import { authorizedReuse, auditClassification, reuseLimitations, reuseSources, evidenceHash, reusableAt } from '../../worker/reuse.mjs';

export const SOURCE_COMMIT = '19b1420d2520d48baa52be81ac33fc4b9bd0ff8b';
export const PROTOCOL_ID = 'quality-pilot-v1';
export const SEED_SLUG = 'alhena-vs-gorgias-2026-09-20';

export function seedEvidence(): Row {
  return JSON.parse(fs.readFileSync(path.join(config().contentDir, SEED_SLUG, 'evidence.json'), 'utf8'));
}
export function protocol() {
  const seed = seedEvidence();
  const questions = {
    shopping: seed.question_pools.shopping.find((p: Row) => p.key === 'everyday-value').turns,
    support: seed.question_pools.support.find((p: Row) => p.key === 'returns').turns,
  };
  const snapshot = {
    id: PROTOCOL_ID, rubricCommit: SOURCE_COMMIT,
    rubricUrl: `https://github.com/gorgias/ai-agent-benchmark/blob/${SOURCE_COMMIT}/runner/eval-rubric.md`,
    questions, criteria: JSON.parse(fs.readFileSync(path.resolve('rubric/criteria.json'), 'utf8')).criteria,
    maxTurns: 120, maxConversations: 12, maxConcurrentBrowsers: 1,
    qualityOnly: true, minimumAuditAgreement: 90,
  };
  return { ...snapshot, sha256: hash(JSON.stringify(snapshot)) };
}

function fail(message: string): never { throw new ApiError(422, `Evidence validation failed: ${message}`); }
function object(value: any, message: string): asserts value is Row { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(message); }
function nonempty(value: any) { return typeof value === 'string' && value.trim().length > 0; }
const normalizeQuote = (value: string) => value.replace(/\s+/g, ' ').trim();
function quoteInConversation(quote: unknown, turns: Row[]) {
  if (typeof quote !== 'string' || normalizeQuote(quote).length < 3) return false;
  return turns.some(turn => normalizeQuote(turn.reply_as_judged).includes(normalizeQuote(quote)));
}
function sameWebsite(a: string, b: string) {
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
}

function validateAuthorProof(turn: Row, conversation: Row) {
  const proof = turn.author_evidence;
  if (turn.author_verified !== true || !proof || !['dom-ai-author', 'reviewed-bot-selector'].includes(proof.kind) || !nonempty(proof.selector) || proof.provider !== conversation.vendor || !nonempty(proof.adapter_id) || proof.adapter_id !== conversation.capture_metadata.adapter || !Number.isInteger(proof.message_count) || proof.message_count <= 0 || !Array.isArray(proof.markers) || !proof.markers.length) fail('every response requires positive, deployment-specific AI author evidence.');
  if (proof.kind === 'reviewed-bot-selector') {
    if (!proof.markers.every((marker: Row) => marker.attribute === 'reviewed-selector' && marker.value === proof.selector)) fail('reviewed bot-selector evidence does not match the captured selector.');
  } else {
    // Kept in sync with the capture worker's explicit author metadata allowlist.
    const attributes = new Set(['data-author', 'data-author-type', 'data-sender-type', 'data-message-author', 'data-message-role', 'data-role']);
    const values = new Set(['ai', 'assistant', 'bot']);
    const testIds = new Set(['assistant-message', 'ai-message', 'bot-message']);
    if (!proof.markers.every((marker: Row) => typeof marker.value === 'string' && (marker.attribute === 'data-testid' ? testIds.has(marker.value.trim().toLowerCase()) : attributes.has(marker.attribute) && values.has(marker.value.trim().toLowerCase())))) fail('the captured DOM marker does not positively identify an AI author.');
  }
}

/** Publication checks are stricter than the renderer. The renderer never creates a score. */
export function validateEvidence(evidence: any, providers: Provider[], snapshot: Row, privateValues: string[] = [], authorizedReusedConversations: Row[] = [], now = Date.now()) {
  let expected: ReturnType<typeof evaluationCounts>;
  try { expected = evaluationCounts(providers); } catch { fail('one or two approved providers with three storefronts each are required.'); }
  object(evidence, 'the result must be an object.');
  if (evidence.schema_version !== 'comparison-lab-evidence/v1') fail('unsupported schema version.');
  object(evidence.study, 'study metadata is required.');
  if (evidence.study.protocol_id !== PROTOCOL_ID || evidence.study.source_commit !== SOURCE_COMMIT || evidence.study.quality_only !== true) fail('the pinned quality protocol must match.');
  if (!Array.isArray(evidence.study.providers) || evidenceHash(evidence.study.providers) !== evidenceHash(providers)) fail('published provider websites and deployments must match the approved request.');
  if (!nonempty(evidence.study.generated_at) || Number.isNaN(Date.parse(evidence.study.generated_at))) fail('completion timestamp is required.');
  if (!Array.isArray(evidence.study.limitations) || !evidence.study.limitations.length) fail('study limitations must be disclosed.');
  object(evidence.rubric, 'rubric metadata is required.');
  if (evidence.rubric.source_commit !== SOURCE_COMMIT) fail('rubric commit mismatch.');
  if (!Array.isArray(evidence.rubric.criteria) || evidence.rubric.criteria.length !== 26) fail('all 26 rubric criteria are required.');
  for (const expected of snapshot.criteria) {
    const matches = evidence.rubric.criteria.filter((c: Row) => c.id === expected.id && c.mode === expected.mode);
    if (matches.length !== 1 || matches[0].points !== expected.points || matches[0].dimension !== expected.dimension || matches[0].signal_gate !== expected.signal_gate || matches[0].passes_when !== expected.passes_when) fail(`rubric changed for ${expected.id}.`);
  }
  if (!Array.isArray(evidence.live_conversations) || evidence.live_conversations.length !== expected.conversations) fail(`exactly ${expected.conversations} complete conversations are required.`);
  if (evidence.validation?.passed !== true || evidence.audit?.trusted !== true) fail('a successful separate audit is required.');
  for (const limitation of reuseLimitations(authorizedReusedConversations)) if (!evidence.study.limitations.includes(limitation)) fail('inherited source limitations must remain visible.');
  if (authorizedReusedConversations.length && (!Array.isArray(evidence.provenance?.reused_sources) || evidenceHash(evidence.provenance.reused_sources) !== evidenceHash(reuseSources(authorizedReusedConversations)))) fail('published-source reuse provenance must match the approved plan.');
  const coverage = new Set<string>(); const ids = new Set<string>();
  let turnCount = 0; let checkCount = 0; let auditAgreed = 0;
  for (const conversation of evidence.live_conversations) {
    object(conversation, 'conversation must be an object.');
    if (!nonempty(conversation.id) || ids.has(conversation.id)) fail('conversation IDs must be unique.');
    ids.add(conversation.id);
    let reused: Row | null;
    try { reused = authorizedReuse(conversation, authorizedReusedConversations); } catch { fail('cached conversation differs from the approved immutable published source.'); }
    if (reused && !reusableAt(conversation.captured_at, now)) fail('cached capture is older than 30 days or has a future timestamp.');
    const historical = reused?.historicalAuthorVerification === true;
    if (typeof conversation.captured_at !== 'string' || !Number.isFinite(Date.parse(conversation.captured_at)) || Date.parse(conversation.captured_at) > now) fail('capture timestamps must be valid and cannot be in the future.');
    const provider = providers.find(p => p.name === conversation.vendor);
    const customer = provider?.customers.find(c => c.name === conversation.store && sameWebsite(c.website, conversation.url));
    if (!provider || !customer) fail('a conversation does not match an approved deployment.');
    const mode = conversation.mode;
    if (!['shopping', 'support'].includes(mode) || conversation.theme !== (mode === 'shopping' ? 'everyday-value' : 'returns')) fail('only the two fixed protocol themes may be published.');
    const coverageKey = `${provider.name}\0${customer.name}\0${mode}`;
    if (coverage.has(coverageKey)) fail('duplicate deployment/theme conversation.');
    coverage.add(coverageKey);
    if (!Array.isArray(conversation.turns) || conversation.turns.length !== 10) fail('each conversation needs all ten turns.');
    object(conversation.capture_metadata, 'session and provider attribution metadata is required.');
    if (!/^[a-f0-9]{64}$/.test(conversation.source_capture_sha256 || '')) fail('capture hashes are required.');
    for (let i = 0; i < 10; i++) {
      const turn = conversation.turns[i];
      if (turn.turn !== i + 1 || turn.question !== snapshot.questions[mode][i]) fail('the exact fixed question sequence must be preserved.');
      if (!nonempty(turn.reply) || !nonempty(turn.reply_as_judged) || turn.response_complete !== true || turn.speaker !== 'ai' || turn.handover !== false || turn.unsent !== false) fail('incomplete or human-handled conversations cannot be scored as a complete run.');
      if (!reused) validateAuthorProof(turn, conversation);
      if (turn.complete_ms !== null && (!Number.isFinite(turn.complete_ms) || turn.complete_ms < 0)) fail('invalid response timing.');
      turnCount++;
    }
    const expectedChecks = snapshot.criteria.filter((c: Row) => c.mode === mode);
    if (!Array.isArray(conversation.checks) || conversation.checks.length !== expectedChecks.length) fail('every criterion must have one decision.');
    object(conversation.signals, 'deterministic signals are required.');
    let score = 0; const dimensionScores: Row = {};
    for (const criterion of expectedChecks) {
      const matches = conversation.checks.filter((c: Row) => c.id === criterion.id);
      if (matches.length !== 1) fail(`missing or repeated criterion ${criterion.id}.`);
      const check = matches[0];
      if (check.points !== criterion.points || check.dimension !== criterion.dimension || typeof check.pass !== 'boolean' || typeof check.judge_pass !== 'boolean' || check.awarded !== (check.pass ? criterion.points : 0)) fail(`invalid score arithmetic for ${criterion.id}.`);
      if (typeof check.evidence !== 'string' || typeof check.primary?.pass !== 'boolean' || typeof check.primary?.evidence !== 'string' || typeof check.final?.pass !== 'boolean' || check.final.pass !== check.judge_pass || typeof check.final.evidence !== 'string' || check.evidence !== check.final.evidence) fail(`primary and final judge evidence is required for ${criterion.id}.`);
      const classification = auditClassification(check, historical);
      if (!['AGREE', 'FP', 'FN'].includes(classification) || !nonempty(check.audit?.reason) || typeof check.audit?.evidence !== 'string') fail(`separate audit evidence is required for ${criterion.id}.`);
      const expectedClassification = check.primary.pass === check.final.pass ? 'AGREE' : check.primary.pass ? 'FP' : 'FN';
      if (classification !== expectedClassification) fail(`audit classification is inconsistent for ${criterion.id}.`);
      if (classification === 'AGREE') {
        auditAgreed++;
        if (check.final.evidence !== check.primary.evidence) fail(`an agreeing audit changed primary evidence for ${criterion.id}.`);
      } else if (check.final.evidence !== check.audit.evidence && !(historical && classification === 'FP' && check.audit.classification === 'FALSE_POSITIVE' && check.final.evidence === check.primary.evidence)) fail(`audit correction evidence was not preserved for ${criterion.id}.`);
      if (check.primary.pass && !quoteInConversation(check.primary.evidence, conversation.turns)) fail(`primary passing quote is not in the captured judging transcript for ${criterion.id}.`);
      if (check.final.pass && !quoteInConversation(check.final.evidence, conversation.turns)) fail(`final passing quote is not in the captured judging transcript for ${criterion.id}.`);
      if (check.final.pass && !quoteInConversation(check.audit.evidence, conversation.turns)) fail(`auditor passing quote is not in the captured judging transcript for ${criterion.id}.`);
      let expectedPass = check.final.pass && typeof check.final.evidence === 'string' && check.final.evidence.trim().length >= 3;
      if (criterion.signal_gate) {
        if (typeof conversation.signals[criterion.signal_gate] !== 'boolean' || check.signal_gate !== criterion.signal_gate || check.signal_present !== conversation.signals[criterion.signal_gate]) fail(`signal gate evidence is missing for ${criterion.id}.`);
        expectedPass = expectedPass && conversation.signals[criterion.signal_gate];
      }
      if (mode === 'support' && ['s_answered', 's_outcome', 's_no_deflect'].includes(criterion.id)) {
        if (typeof conversation.signals.no_deflect !== 'boolean') fail('support deflection gate is missing.');
        expectedPass = expectedPass && conversation.signals.no_deflect;
      }
      if (check.pass !== expectedPass) fail(`deterministic gate disagrees for ${criterion.id}.`);
      score += check.awarded;
      dimensionScores[criterion.dimension] = (dimensionScores[criterion.dimension] || 0) + check.awarded;
      checkCount++;
    }
    if (conversation.score !== score) fail('conversation score does not equal fixed-weight arithmetic.');
    const recalculated = deriveCheckedScore(mode, Object.fromEntries(conversation.checks.map((check: Row) => [check.id, check.final])), conversation.signals);
    if (recalculated.total !== score) fail('the independent deterministic scorer disagrees.');
    for (const [dimension, expected] of Object.entries(dimensionScores)) if (conversation.dimension_scores?.[dimension] !== expected) fail('dimension score arithmetic disagrees.');
  }
  if (coverage.size !== expected.conversations || turnCount !== expected.turns || checkCount !== expected.checks) fail('complete coverage is required.');
  if (authorizedReusedConversations.some(c => !ids.has(c.id))) fail('an approved reused conversation is missing.');
  const agreement = Math.round(auditAgreed / checkCount * 1000) / 10;
  if (agreement < snapshot.minimumAuditAgreement || evidence.audit.agreement_pct !== agreement || evidence.audit.verdicts !== checkCount || evidence.audit.agreed !== auditAgreed || evidence.audit.corrected !== checkCount - auditAgreed) fail('audit agreement or decision totals do not reconcile, or agreement is below the publication threshold.');
  const serialized = JSON.stringify(evidence);
  for (const privateValue of privateValues.filter(v => v.length >= 8)) if (serialized.toLowerCase().includes(privateValue.toLowerCase())) fail('private request information was found in public evidence.');
  if (/comparison_lab_session|[?&](?:review_token|otp_code|access_token|api_key)=|\/api\/review\//i.test(serialized)) fail('private credentials or review links must not appear in evidence.');
  return { conversations: expected.conversations, turns: turnCount, checks: checkCount, criteria: 26, stores: expected.stores };
}

export function reportSummary(slug: string, evidence: Row, publishedAt = iso(), hasHtml = false) {
  const conversations: Row[] = evidence.live_conversations || [];
  const scores = new Map<string, Row>();
  for (const c of conversations) {
    const key = `${c.vendor}\0${c.store}`;
    const row = scores.get(key) || { vendor: c.vendor, store: c.store, shopping: null, support: null };
    row[c.mode] = c.score; scores.set(key, row);
  }
  const vendors = [...new Set(conversations.map(c => c.vendor))];
  const providerWebsites = vendors.map(vendor => evidence.study?.providers?.find((p: Row) => p.name === vendor)?.website || (slug === SEED_SLUG ? ({ Alhena: 'https://alhena.ai/', Gorgias: 'https://www.gorgias.com/' } as Record<string, string>)[vendor] : undefined)).filter(Boolean);
  const captureDates = conversations.map(c => c.captured_at).filter((value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value as string))).map((value: string) => new Date(value).toISOString()).sort();
  const means = vendors.map(vendor => {
    const rows = [...scores.values()].filter(s => s.vendor === vendor);
    return { vendor, shopping: Math.round(rows.reduce((sum, row) => sum + row.shopping, 0) / rows.length * 10) / 10, support: Math.round(rows.reduce((sum, row) => sum + row.support, 0) / rows.length * 10) / 10 };
  });
  return {
    slug, title: evidence.study?.title || 'Commerce AI evaluation', publishedAt, kind: vendors.length === 1 ? 'tool' : 'comparison',
    providers: vendors, vendors, providerWebsites, scores: means, captureStartAt: captureDates[0], captureEndAt: captureDates.at(-1),
    storeCount: scores.size, conversationCount: conversations.length,
    turnCount: conversations.reduce((n, c) => n + (c.turns?.length || 0), 0), criterionCount: evidence.rubric?.criteria?.length || 26,
    protocol: PROTOCOL_ID,
    counts: { stores: scores.size, conversations: conversations.length, turns: conversations.reduce((n, c) => n + (c.turns?.length || 0), 0), criteria: evidence.rubric?.criteria?.length || 26 },
    summary: `A fixed-rubric evaluation of ${scores.size} live storefront deployments, with complete conversations and a separate AI judge and audit.`,
    description: `Shopping and support quality across ${scores.size} live storefronts, with full conversations, fixed criteria, and a separate AI judge and audit.`,
    limitations: evidence.study?.limitations || [],
    qualityOnly: true, commissionedBy: evidence.study?.commissioned_by || 'Alhena Research Lab', hasHtml,
  };
}

export function listReports() {
  const results: Row[] = (db().prepare('SELECT summary_json FROM reports ORDER BY published_at DESC').all() as Row[]).map(r => JSON.parse(r.summary_json));
  const seedFile = path.join(config().contentDir, SEED_SLUG, 'evidence.json');
  if (fs.existsSync(seedFile) && !results.some(r => r.slug === SEED_SLUG)) {
    results.push(seedSummary());
  }
  return results.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getReport(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,150}$/.test(slug)) throw new ApiError(404, 'Report not found.');
  if (slug === SEED_SLUG) {
    const evidence = seedEvidence();
    return { report: seedSummary(), evidence };
  }
  const row = db().prepare('SELECT * FROM reports WHERE slug = ?').get(slug) as Row | undefined;
  if (!row) throw new ApiError(404, 'Report not found.');
  const bytes = fs.readFileSync(path.join(config().dataDir, 'reports', path.basename(row.evidence_path)));
  if (hash(bytes) !== row.evidence_sha256) throw new ApiError(503, 'Report evidence integrity check failed.');
  return { report: JSON.parse(row.summary_json), evidence: JSON.parse(bytes.toString('utf8')) };
}

function seedSummary() {
  const base = reportSummary(SEED_SLUG, seedEvidence(), '2026-09-20T20:00:00.000Z', true);
  const metadata = path.join(config().contentDir, SEED_SLUG, 'metadata.json');
  return fs.existsSync(metadata) ? { ...base, ...JSON.parse(fs.readFileSync(metadata, 'utf8')) } : base;
}
