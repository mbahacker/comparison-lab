// Provider-neutral arithmetic for policy-resolution-v1. No capture, model or publication calls.
import { createHash } from 'node:crypto';

const deepFreeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child); return Object.freeze(value); };
export const POLICY_PROTOCOL = deepFreeze({
  id: 'policy-resolution-v1',
  unit: 'submitted-request-checkpoint',
  scope: 'public-session answer or policy-prescribed next step; not downstream case completion',
  primaryMetric: 'equal-conversation-then-store mean of verified attainment over assessable submitted checkpoints',
  audit: 'full independent blind audit; both judgments must attain with verified evidence',
  shoppingWeights: { resolution: .4, quality: .35, speed: .25 },
  supportWeights: { resolution: .5, quality: .4, speed: .1 },
  minimumScorableConversationsPerLane: 15,
  minimumObservedStorefrontsPerLane: 3,
  minimumRegisteredStorefrontsPerProvider: 5,
  plannedCoreTurns: 10,
  guardrailsInComposite: false,
  reuseDays: 30,
});
export const POLICY_PROTOCOL_HASH = createHash('sha256').update(JSON.stringify(POLICY_PROTOCOL)).digest('hex');
const statuses = new Set(['attained', 'not_attained', 'unverified', 'unassessable']);
const kinds = new Set(['answered', 'required_next_step', 'necessary_verification', 'none']);
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const rounded = (n, places = 1) => n === null ? null : Math.round(n * 10 ** places) / 10 ** places;
const sum = (xs, key) => xs.reduce((n, r) => n + r[key], 0);
const normalize = text => String(text).normalize('NFKC').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

export function checkDecision(decision, reply, allowedPolicyIds, turn) {
  if (!decision || !statuses.has(decision.status) || !kinds.has(decision.handling)
    || typeof decision.reason !== 'string' || !decision.reason.trim()
    || !Array.isArray(decision.policyRefs) || decision.policyRefs.some(id => !allowedPolicyIds.includes(id))) {
    throw Error('Invalid resolution decision or foreign policy reference');
  }
  if (decision.status === 'attained') {
    if (decision.evidence?.turn !== turn) throw Error('Attainment evidence must identify the current turn');
    const quote = normalize(decision.evidence?.quote || '');
    if (quote.replace(/[^a-z0-9]/g, '').length < 8 || !normalize(reply).includes(quote)) throw Error('Attainment needs a verified response quote');
    if (decision.handling === 'none') throw Error('Attainment needs a handling classification');
    if (decision.handling === 'required_next_step' && !decision.policyRefs.length) throw Error('Required next step needs independent policy evidence');
  }
  return decision;
}

export function reconcileCheckpoint(checkpoint, allowedPolicyIds = []) {
  if (!Number.isInteger(checkpoint.turn) || checkpoint.turn < 1 || typeof checkpoint.submitted !== 'boolean' || typeof checkpoint.assessable !== 'boolean') throw Error('Invalid checkpoint observation mask');
  if (!checkpoint.submitted || !checkpoint.assessable) return { turn: checkpoint.turn, status: 'unassessable', attained: 0, denominator: 0, disagreement: false };
  const p = checkDecision(checkpoint.primary, checkpoint.reply, allowedPolicyIds, checkpoint.turn);
  const a = checkDecision(checkpoint.audit, checkpoint.reply, allowedPolicyIds, checkpoint.turn);
  // A model cannot remove an observed checkpoint from the denominator.
  const attained = p.status === 'attained' && a.status === 'attained';
  const status = attained ? 'attained' : p.status === 'not_attained' && a.status === 'not_attained' ? 'not_attained' : 'unverified';
  return { turn: checkpoint.turn, status, attained: Number(attained), denominator: 1, disagreement: p.status !== a.status || p.handling !== a.handling };
}

export function scoreConversation(record) {
  if (!record || !record.id || !record.provider || !record.store || !['shopping', 'support'].includes(record.mode)
    || record.theme === 'guardrails' || record.planned !== 10 || !Array.isArray(record.checkpoints)) throw Error('Invalid core conversation');
  const seen = new Set();
  for (const c of record.checkpoints) {
    if (seen.has(c.turn) || !Number.isInteger(c.turn) || c.turn < 1 || c.turn > record.planned) throw Error('Duplicate or out-of-range checkpoint');
    seen.add(c.turn);
  }
  if (record.exclusion) {
    if (typeof record.exclusion !== 'string') throw Error('Invalid exclusion');
    return { id: record.id, provider: record.provider, store: record.store, mode: record.mode, theme: record.theme,
      exclusion: record.exclusion, planned: record.planned, submitted: record.checkpoints.filter(c => c.submitted).length,
      assessable: 0, attained: 0, unverified: 0, notAttained: 0, unassessable: record.checkpoints.filter(c => c.submitted).length,
      disagreements: 0, score: null, quality: null, latencyMs: [], correctedCapture: !!record.correctedCapture };
  }
  const checks = record.checkpoints.map(c => reconcileCheckpoint(c, record.policyIds || []));
  const submitted = record.checkpoints.filter(c => c.submitted).length;
  const assessable = sum(checks, 'denominator'), attained = sum(checks, 'attained');
  const quality = record.quality ?? null;
  if (quality !== null && (!Number.isFinite(quality) || quality < 0 || quality > 100)) throw Error('Invalid quality score');
  const latencyMs = record.latencyMs || [];
  if (!Array.isArray(latencyMs) || latencyMs.some(n => !Number.isFinite(n) || n < 0)) throw Error('Invalid observed completion timing');
  return { id: record.id, provider: record.provider, store: record.store, mode: record.mode, theme: record.theme,
    exclusion: null, planned: record.planned, submitted, assessable, attained,
    unverified: checks.filter(c => c.status === 'unverified').length,
    notAttained: checks.filter(c => c.status === 'not_attained').length,
    unassessable: submitted - assessable, disagreements: checks.filter(c => c.disagreement).length,
    score: assessable ? 100 * attained / assessable : null, quality, latencyMs,
    correctedCapture: !!record.correctedCapture };
}

export function aggregatePolicyResolution(records) {
  if (!Array.isArray(records) || !records.length) throw Error('Registered core evidence is required');
  const ids = new Set();
  const rows = records.map(r => { if (ids.has(r.id)) throw Error('Duplicate conversation'); ids.add(r.id); return scoreConversation(r); });
  const providers = [...new Set(rows.map(r => r.provider))].map(provider => {
    const output = { name: provider };
    for (const lane of ['shopping', 'support']) {
      const rs = rows.filter(r => r.provider === provider && r.mode === lane);
      const stores = [...new Set(rs.map(r => r.store))].map(store => {
        const cs = rs.filter(r => r.store === store);
        const scored = cs.filter(c => c.score !== null);
        const qs = cs.filter(c => c.quality !== null).map(c => c.quality);
        const timing = cs.flatMap(c => c.latencyMs);
        return { store, resolution: mean(scored.map(c => c.score)), quality: qs.length ? Math.round(mean(qs)) : null,
          completionSeconds: timing.length ? rounded(Math.round(mean(timing)) / 1000) : null,
          scoredConversations: scored.length, plannedConversations: cs.length,
          plannedCheckpoints: sum(cs, 'planned'), submittedCheckpoints: sum(cs, 'submitted'),
          assessableCheckpoints: sum(cs, 'assessable'), attainedCheckpoints: sum(cs, 'attained') };
      });
      const scored = rs.filter(r => r.score !== null);
      const qualityConversations = rs.filter(r => r.quality !== null).length;
      const timingConversations = rs.filter(r => r.latencyMs.length >= 3).length;
      const rStores = stores.filter(s => s.resolution !== null), qStores = stores.filter(s => s.quality !== null), tStores = stores.filter(s => s.completionSeconds !== null);
      const resolution = mean(rStores.map(s => s.resolution));
      const quality = qStores.length ? Math.round(mean(qStores.map(s => s.quality))) : null;
      const completionSeconds = rounded(mean(tStores.map(s => s.completionSeconds)));
      const speed = completionSeconds === null ? null : Math.max(0, Math.min(100, (22 - completionSeconds) * 100 / 19));
      const rankable = scored.length >= POLICY_PROTOCOL.minimumScorableConversationsPerLane
        && qualityConversations >= POLICY_PROTOCOL.minimumScorableConversationsPerLane
        && timingConversations >= POLICY_PROTOCOL.minimumScorableConversationsPerLane
        && rStores.length >= POLICY_PROTOCOL.minimumObservedStorefrontsPerLane && quality !== null && speed !== null;
      const weights = POLICY_PROTOCOL[lane + 'Weights'];
      const composite = rankable ? resolution * weights.resolution + quality * weights.quality + speed * weights.speed : null;
      output[lane] = { resolution: rounded(resolution), quality, speed: rounded(speed), completionSeconds,
        composite: rounded(composite), rankable, unrounded: { resolution, speed, composite }, stores,
        coverage: { registeredStores: stores.length, resolutionStores: rStores.length, qualityStores: qStores.length, timingStores: tStores.length,
          registeredConversations: rs.length, assessedConversations: scored.length, excludedConversations: rs.filter(r => r.exclusion).length,
          qualityConversations, timingConversations,
          plannedCheckpoints: sum(rs, 'planned'), submittedCheckpoints: sum(rs, 'submitted'), assessableCheckpoints: sum(rs, 'assessable'),
          attainedCheckpoints: sum(rs, 'attained'), unverifiedCheckpoints: sum(rs, 'unverified'), notAttainedCheckpoints: sum(rs, 'notAttained'),
          unassessableSubmittedCheckpoints: sum(rs, 'unassessable'), disagreements: sum(rs, 'disagreements'), repairedCaptures: rs.filter(r => r.correctedCapture).length,
          verifiedAttainmentOfPlannedPercent: rs.length ? rounded(100 * sum(rs, 'attained') / sum(rs, 'planned')) : null } };
    }
    output.overall = output.shopping.rankable && output.support.rankable ? rounded((output.shopping.unrounded.composite + output.support.unrounded.composite) / 2) : null;
    return output;
  });
  return { protocol: POLICY_PROTOCOL.id, protocolHash: POLICY_PROTOCOL_HASH, providers, conversations: rows };
}

// Publication checks are separate from arithmetic so diagnostic partials remain usable.
export function validateCompleteCohort(records, expectedContexts) {
  if (!Array.isArray(expectedContexts) || !expectedContexts.length || records.length !== expectedContexts.length) throw Error('Incomplete registered cohort');
  const expected = new Map(expectedContexts.map(c => [c.id, c]));
  if (expected.size !== expectedContexts.length) throw Error('Duplicate planned context');
  const perProvider = new Map();
  for (const r of records) {
    const p = expected.get(r.id);
    if (!p || ['provider', 'store', 'mode', 'theme'].some(k => p[k] !== r[k])) throw Error('Evidence does not match the frozen cohort');
    expected.delete(r.id);
    const stores = perProvider.get(r.provider) || new Map();
    const themes = stores.get(r.store) || new Set();
    const key = `${r.mode}/${r.theme}`;
    if (themes.has(key)) throw Error('Duplicate storefront theme');
    themes.add(key); stores.set(r.store, themes); perProvider.set(r.provider, stores);
  }
  const themes = ['shopping/everyday-value', 'shopping/gift', 'shopping/problem-solver', 'shopping/compare-budget', 'shopping/beginner', 'support/tracking', 'support/returns', 'support/damaged', 'support/order-mgmt', 'support/policy'];
  for (const stores of perProvider.values()) {
    if (stores.size < POLICY_PROTOCOL.minimumRegisteredStorefrontsPerProvider) throw Error('At least five registered storefronts are required per provider');
    for (const registered of stores.values()) if (registered.size !== themes.length || themes.some(t => !registered.has(t))) throw Error('All ten themes must be accounted for');
  }
  return aggregatePolicyResolution(records);
}
