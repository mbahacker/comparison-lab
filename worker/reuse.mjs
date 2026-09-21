import { createHash } from 'node:crypto';
import { RUBRIC, QUESTIONS, criteriaFor, WorkerError } from './protocol.mjs';
import { deriveCheckedScore } from './scoring.mjs';
import { AUTHOR_MARKERS } from './authorship.mjs';

export const REUSE_NOTE = 'Some conversations are reused unchanged from published reports. Their original capture dates and source limitations remain applicable; they were not recaptured or rejudged for this comparison.';
export const HISTORICAL_AUTHOR_NOTE = 'Historical reused captures inherit the original published source attribution. Per-turn AI-author proof was not recorded by that source and has not been invented or newly verified.';
export const REUSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export function reusableAt(capturedAt, now = Date.now()) { const captured = Date.parse(capturedAt); return Number.isFinite(captured) && captured <= now && now - captured <= REUSE_WINDOW_MS; }
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const evidenceHash = value => createHash('sha256').update(stableJson(value)).digest('hex');
function parsedWebsite(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid website');
  return url;
}
export function providerIdentity(value) { const url = parsedWebsite(value); return url.hostname.toLowerCase().replace(/^www\./, '') + (url.port ? `:${url.port}` : ''); }
export function storefrontIdentity(value) { const url = parsedWebsite(value); return providerIdentity(value) + url.pathname + url.search; }
export const laneIdentity = (provider, storefront, mode) => `${providerIdentity(provider)}\0${storefrontIdentity(storefront)}\0${mode}`;
export const auditClassification = (check, historical = false) => historical ? ({ FALSE_POSITIVE: 'FP', FALSE_NEGATIVE: 'FN' }[check.audit?.classification] || check.audit?.classification) : check.audit?.classification;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const normalized = value => value.replace(/\s+/g, ' ').trim();
const reject = () => { throw new WorkerError('incompatible_reuse', 'Published conversation is incompatible with the current quality protocol'); };

/** Same quality gates for imported material; only pinned historical author/serialization gaps differ. */
export function validateReusableConversation(c, snapshot, historical = false) {
  if (!c || !nonempty(c.id) || c.kind === 'archived' || !['shopping', 'support'].includes(c.mode) || c.theme !== QUESTIONS[c.mode].key || !nonempty(c.date) || !nonempty(c.captured_at) || Number.isNaN(Date.parse(c.captured_at)) || !c.capture_metadata || !/^[a-f0-9]{64}$/.test(c.source_capture_sha256 || '') || c.turns?.length !== 10) reject();
  for (const [i, t] of c.turns.entries()) {
    if (t.turn !== i + 1 || t.question !== snapshot.questions[c.mode][i] || !nonempty(t.reply) || !nonempty(t.reply_as_judged) || t.speaker !== 'ai' || t.response_complete !== true || t.handover !== false || t.unsent !== false || (t.complete_ms !== null && (!Number.isFinite(t.complete_ms) || t.complete_ms < 0))) reject();
    if (!historical) {
      const p = t.author_evidence;
      if (t.author_verified !== true || !p || !['dom-ai-author', 'reviewed-bot-selector'].includes(p.kind) || !nonempty(p.selector) || p.provider !== c.vendor || p.adapter_id !== c.capture_metadata.adapter || !Number.isInteger(p.message_count) || p.message_count < 1 || !Array.isArray(p.markers) || !p.markers.length) reject();
      if (!p.markers.every(m => p.kind === 'dom-ai-author' ? AUTHOR_MARKERS[m.attribute]?.includes(String(m.value).trim().toLowerCase()) : m.attribute === 'reviewed-selector' && m.value === p.selector)) reject();
    }
  }
  const criteria = snapshot.criteria.filter(x => x.mode === c.mode);
  if (c.checks?.length !== criteria.length || !c.signals || typeof c.signals !== 'object') reject();
  let agreed = 0, total = 0; const dimensions = {};
  const quote = text => typeof text === 'string' && normalized(text).length >= 3 && c.turns.some(t => normalized(t.reply_as_judged).includes(normalized(text)));
  for (const criterion of criteria) {
    const checks = c.checks.filter(x => x.id === criterion.id); if (checks.length !== 1) reject(); const x = checks[0];
    if (x.points !== criterion.points || x.dimension !== criterion.dimension || typeof x.pass !== 'boolean' || typeof x.judge_pass !== 'boolean' || x.awarded !== (x.pass ? criterion.points : 0) || typeof x.evidence !== 'string' || typeof x.primary?.pass !== 'boolean' || typeof x.primary.evidence !== 'string' || typeof x.final?.pass !== 'boolean' || typeof x.final.evidence !== 'string' || x.final.pass !== x.judge_pass || x.final.evidence !== x.evidence || !nonempty(x.audit?.reason) || typeof x.audit.evidence !== 'string') reject();
    const classification = auditClassification(x, historical);
    if (classification !== (x.primary.pass === x.final.pass ? 'AGREE' : x.primary.pass ? 'FP' : 'FN')) reject();
    if (classification === 'AGREE') { agreed++; if (x.final.evidence !== x.primary.evidence) reject(); }
    else if (x.final.evidence !== x.audit.evidence && !(historical && classification === 'FP' && x.audit.classification === 'FALSE_POSITIVE' && x.final.evidence === x.primary.evidence)) reject();
    if ((x.primary.pass && !quote(x.primary.evidence)) || (x.final.pass && (!quote(x.final.evidence) || !quote(x.audit.evidence)))) reject();
    let expected = x.final.pass && x.final.evidence.trim().length >= 3;
    if (criterion.signal_gate) {
      if (typeof c.signals[criterion.signal_gate] !== 'boolean' || x.signal_gate !== criterion.signal_gate || x.signal_present !== c.signals[criterion.signal_gate]) reject();
      expected = expected && c.signals[criterion.signal_gate];
    }
    if (x.pass !== expected) reject();
    total += x.awarded; dimensions[x.dimension] = (dimensions[x.dimension] || 0) + x.awarded;
  }
  if (total !== c.score || Object.entries(dimensions).some(([key, value]) => c.dimension_scores?.[key] !== value)) reject();
  if (deriveCheckedScore(c.mode, Object.fromEntries(c.checks.map(x => [x.id, x.final])), c.signals).total !== total) reject();
  return { checked: criteria.length, agreed };
}
export function reusableFor(job, provider, store, mode) {
  return (job.reusedConversations || []).find(c => laneIdentity(c.reuse?.providerWebsite, c.reuse?.storefrontWebsite, c.mode) === laneIdentity(provider.website, store.website, mode));
}
export function authorizedReuse(conversation, authorized = []) {
  const expected = authorized.find(c => c.id === conversation.id);
  if (conversation.reuse || expected) {
    if (!expected || !conversation.reuse || evidenceHash(expected) !== evidenceHash(conversation)) throw new WorkerError('reuse_integrity', 'Cached conversation differs from the server-authorized published source');
    return expected.reuse;
  }
  return null;
}
export function reuseSources(conversations) {
  const sources = new Map();
  for (const c of conversations) if (c.reuse) sources.set(c.reuse.sourceReportSlug, { slug: c.reuse.sourceReportSlug, evidence_sha256: c.reuse.sourceReportHash, published_at: c.reuse.sourcePublishedAt });
  return [...sources.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
export function reuseLimitations(conversations) {
  const reused = conversations.filter(c => c.reuse);
  return reused.length ? [...new Set([REUSE_NOTE, ...reused.flatMap(c => c.reuse.sourceLimitations || []), ...(reused.some(c => c.reuse.historicalAuthorVerification) ? [HISTORICAL_AUTHOR_NOTE] : [])])] : [];
}
