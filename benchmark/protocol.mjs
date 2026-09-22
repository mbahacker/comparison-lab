// Company-neutral planning contract. No browser, model, mail, or publication side effects.
import { createHash } from 'node:crypto';
import criteria from '../rubric/criteria.json' with { type: 'json' };

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}
export const FULL_PROTOCOL = freeze({
  id: 'full-benchmark-v1',
  sourceCommit: '19b1420d2520d48baa52be81ac33fc4b9bd0ff8b',
  sourcePath: 'runner/gen.js',
  scoringPath: 'as-published-audit',
  qualityCriteria: 26,
  minimumSourcedStorefronts: 5,
  minimumLatencyValidCoreConversationsPerLane: 15,
  themes: {
    shopping: ['everyday-value', 'gift', 'problem-solver', 'compare-budget', 'beginner'],
    support: ['tracking', 'returns', 'damaged', 'order-mgmt', 'policy'],
  },
  turnsPerCoreConversation: 10,
  guardrails: { mode: 'shopping', theme: 'guardrails', turns: 3, includedInComposite: false },
  weights: {
    shopping: { automation: 0.40, quality: 0.35, speed: 0.25 },
    support: { automation: 0.50, quality: 0.40, speed: 0.10 },
  },
  speed: { fullCreditSeconds: 3, zeroCreditSeconds: 22, statistic: 'mean-full-answer-completion' },
  timing: { pollMs: 250, stableMs: 5000, minimumProseCharacters: 80, quietBeforeSendMs: 6000,
    quietBeforeSendLimitMs: 30000, interTurnSettleMs: 2500, timeoutMs: 120000,
    operationGraceMs: 15000, lateFlushMs: 60000 },
  minimumMeasuredRepliesPerConversation: 3,
  consecutiveUnmeasuredAbort: 4,
  loginWallColdRetries: 1,
  judge: { model: 'claude-opus-4-8', effort: 'high', prompt: 'runner/judge-api.mjs', rubric: 'runner/eval-rubric.md' },
  audit: { conversations: 24, batchSize: 8, selection: 'lexical-id-alternating-lanes', agreementThresholdPercent: 90 },
  sourceRankingWindowDays: 90,
  libraryReuseWindowDays: 30,
  qualityPilotCompatible: false,
});

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalJson = value => JSON.stringify(value, function (_key, item) {
  if (item && !Array.isArray(item) && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  return item;
});
export const PROTOCOL_SHA256 = sha256(canonicalJson({ protocol: FULL_PROTOCOL, criteria }));

export function validateCohort(plan, roster) {
  if (plan.upstreamCommit !== FULL_PROTOCOL.sourceCommit || (plan.protocol && plan.protocol !== FULL_PROTOCOL.id)) throw Error('Unsupported full-benchmark protocol');
  if (!Array.isArray(roster) || !roster.length || !Array.isArray(plan.contexts)) throw Error('A complete frozen cohort is required');
  const stores = new Map(), providers = new Map(), identities = new Set(), storeNames = new Set();
  for (const store of roster) {
    if (!/^[a-z0-9][a-z0-9-]{0,200}$/.test(store.key || '') || stores.has(store.key) || !store.vendor || !store.store) throw Error('Invalid or duplicate roster entry');
    sourceSafeLabel(store.vendor); sourceSafeLabel(store.store);
    const nameIdentity = `${store.vendor.toLowerCase()}/${store.store.toLowerCase()}`;
    if (storeNames.has(nameIdentity)) throw Error('Duplicate storefront name within a company');
    storeNames.add(nameIdentity);
    const identity = websiteIdentity(store.url);
    if (identities.has(identity)) throw Error('Duplicate storefront identity');
    identities.add(identity); stores.set(store.key, store);
    providers.set(store.vendor, (providers.get(store.vendor) || 0) + 1);
  }
  if ([...providers.values()].some(count => count < 5)) throw Error('Full benchmark requires at least five sourced storefronts per company');
  const expected = new Set(Object.entries(FULL_PROTOCOL.themes).flatMap(([mode, themes]) => themes.map(theme => `${mode}/${theme}`)).concat('shopping/guardrails'));
  const seen = new Map([...stores.keys()].map(key => [key, new Set()])), ids = new Set();
  for (const context of plan.contexts) {
    const store = stores.get(context.storeKey), laneTheme = `${context.mode}/${context.theme}`;
    if (!store || store.vendor !== context.provider || store.store !== context.store || store.url !== context.url
      || context.id !== `${context.storeKey}-${context.mode}-${context.theme}`
      || !/^[a-z0-9][a-z0-9-]{0,250}$/.test(context.id || '') || ids.has(context.id)
      || !expected.has(laneTheme) || seen.get(context.storeKey).has(laneTheme)) throw Error('Context does not match a unique complete roster scenario');
    const guardrail = context.theme === 'guardrails';
    if (context.guardrail !== guardrail || context.plannedTurns !== (guardrail ? 3 : 10)) throw Error('Context changes the published question count or guardrail treatment');
    ids.add(context.id); seen.get(context.storeKey).add(laneTheme);
  }
  if ([...seen.values()].some(themes => themes.size !== 11)) throw Error('Every storefront requires all ten core themes and its separate guardrail context');
  if (plan.expectedCoreConversations !== stores.size * 10 || plan.expectedGuardrailConversations !== stores.size
    || plan.plannedCoreTurns !== stores.size * 100 || plan.plannedGuardrailTurns !== stores.size * 3) throw Error('Planned counts do not reconcile with the complete cohort');
  return { tools: providers.size, storefronts: stores.size, contexts: ids.size };
}

function text(value, label, limit = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw Error(`Invalid ${label}`);
  return value.trim();
}

function sourceSafeLabel(value) {
  // The unchanged upstream generator groups names in ordinary JS objects.
  // Reject reserved keys rather than patching its aggregation or silently losing a row.
  if (Object.hasOwn(Object.prototype, value)) throw Error('Name conflicts with an upstream dictionary key; use the canonical full company name');
  return value;
}

// This normalizes identities only. Browser execution still requires DNS/socket-level
// public-network enforcement; a syntactically valid hostname is not an SSRF clearance.
export function websiteIdentity(input) {
  const url = new URL(text(input, 'website', 2000));
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Website must be an HTTP(S) URL without credentials');
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!host.includes('.') || host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host)
    || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw Error('A public storefront hostname is required');
  return host;
}

const keyFor = (name, identity) => `${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tool'}-${sha256(identity).slice(0, 12)}`;

export function executionFingerprint(profile) {
  if (!profile || typeof profile !== 'object') throw Error('An explicit execution profile is required');
  const normalized = {};
  for (const field of ['browserBuild', 'captureEnvironment', 'timingProfile', 'judgeTransport', 'judgeModel', 'judgeEffort', 'judgeRuntime', 'auditorModel', 'auditorTransport', 'auditorEffort', 'auditorRuntime']) normalized[field] = text(profile[field], field, 1000);
  for (const field of ['judgeSpecSha256', 'auditorSpecSha256', 'timingSourceSha256']) {
    if (!/^[a-f0-9]{64}$/.test(profile[field] || '')) throw Error(`A verified SHA-256 is required for ${field}`);
    normalized[field] = profile[field];
  }
  if (normalized.judgeModel !== FULL_PROTOCOL.judge.model || normalized.judgeEffort !== FULL_PROTOCOL.judge.effort) throw Error('Full protocol requires its pinned judge model and effort');
  return { profile: normalized, sha256: sha256(canonicalJson({ protocolSha256: PROTOCOL_SHA256, profile: normalized })) };
}

export function createEvaluationPlan(input) {
  if (!input || !Array.isArray(input.tools) || !input.tools.length) throw Error('At least one tool is required');
  const runDate = text(input.runDate, 'run date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate) || new Date(`${runDate}T00:00:00Z`).toISOString().slice(0, 10) !== runDate) throw Error('Run date must be a real YYYY-MM-DD date');
  const execution = executionFingerprint(input.executionProfile);
  const toolIdentities = new Set(), names = new Set(), storeIdentities = new Set(), contexts = [], roster = [];
  const tools = input.tools.map(tool => {
    const name = sourceSafeLabel(text(tool.name, 'tool name')), identity = websiteIdentity(tool.website);
    if (toolIdentities.has(identity) || names.has(name.toLowerCase())) throw Error('Duplicate tool identity or name');
    toolIdentities.add(identity); names.add(name.toLowerCase());
    if (!Array.isArray(tool.storefronts) || tool.storefronts.length < FULL_PROTOCOL.minimumSourcedStorefronts) throw Error(`${name}: full benchmark needs at least five sourced storefronts; three belongs to the quality pilot`);
    const key = keyFor(name, identity);
    const customerNames = new Set();
    const storefronts = tool.storefronts.map(store => {
      const storeName = sourceSafeLabel(text(store.name, 'storefront name')), storeIdentity = websiteIdentity(store.website);
      if (customerNames.has(storeName.toLowerCase())) throw Error('Duplicate storefront name within a company');
      customerNames.add(storeName.toLowerCase());
      // One storefront must not be silently attributed to two competing tools in a cohort.
      if (storeIdentities.has(storeIdentity)) throw Error(`Duplicate storefront identity: ${storeIdentity}`);
      storeIdentities.add(storeIdentity);
      const adapter = text(store.adapter, 'reviewed adapter ID');
      const deploymentEvidence = text(store.deploymentEvidence, 'deployment evidence reference', 2000);
      if (store.deploymentVerified !== true || store.adapterReviewed !== true) throw Error(`${storeName}: deployment and adapter review are required before freezing the plan`);
      const storeKey = `${key}-${keyFor(storeName, storeIdentity)}`;
      roster.push({ key: storeKey, vendor: name, store: storeName, url: store.website, widget: adapter, locale: store.locale || 'en-US' });
      for (const [mode, themes] of Object.entries(FULL_PROTOCOL.themes)) {
        for (const theme of themes) contexts.push({ id: `${storeKey}-${mode}-${theme}`, storeKey, provider: name,
          store: storeName, url: store.website, mode, theme, guardrail: false, plannedTurns: 10 });
      }
      const { mode, theme, turns } = FULL_PROTOCOL.guardrails;
      contexts.push({ id: `${storeKey}-${mode}-${theme}`, storeKey, provider: name, store: storeName,
        url: store.website, mode, theme, guardrail: true, plannedTurns: turns });
      return { key: storeKey, name: storeName, website: store.website, identity: storeIdentity, adapter,
        locale: store.locale || 'en-US', deploymentEvidence, deploymentVerified: true, adapterReviewed: true };
    });
    return { key, name, website: tool.website, identity, storefronts };
  });
  const core = contexts.filter(item => !item.guardrail), guardrails = contexts.filter(item => item.guardrail);
  const plan = { schema: 'alhena-research-lab/full-benchmark-plan/v1', protocol: FULL_PROTOCOL.id,
    protocolSha256: PROTOCOL_SHA256, upstreamCommit: FULL_PROTOCOL.sourceCommit, runDate,
    status: 'prepared-not-executed', executionProfile: execution.profile, comparisonFingerprint: execution.sha256,
    tools, contexts, expectedCoreConversations: core.length, expectedGuardrailConversations: guardrails.length,
    plannedCoreTurns: core.length * 10, plannedGuardrailTurns: guardrails.length * 3 };
  return { plan: { studyId: `full-${runDate}-${sha256(canonicalJson(plan)).slice(0, 16)}`, ...plan }, roster };
}

// Compatibility is not a score calculation or a publication gate. Callers must still
// validate all sealed evidence and source-defined eligibility before composing reports.
export function comparisonCompatibility(evaluations, now = new Date()) {
  const reasons = [];
  if (!Array.isArray(evaluations) || evaluations.length < 2) return { compatible: false, reasons: ['At least two evaluations are required'] };
  const clock = +new Date(now);
  if (!Number.isFinite(clock)) throw Error('Invalid comparison date');
  const first = evaluations[0];
  for (const evaluation of evaluations) {
    if (evaluation.protocol !== FULL_PROTOCOL.id || evaluation.protocolSha256 !== PROTOCOL_SHA256) reasons.push('Protocol mismatch; quality-pilot scores cannot enter the full benchmark');
    if (!/^[a-f0-9]{64}$/.test(evaluation.comparisonFingerprint || '') || evaluation.comparisonFingerprint !== first.comparisonFingerprint) reasons.push('Execution, judge, or timing profile differs');
    if (evaluation.status !== 'validated' || evaluation.auditComplete !== true || !evaluation.evidenceSealed) reasons.push('Evaluation has not passed evidence validation and audit');
    if (!Array.isArray(evaluation.captureDates) || !evaluation.captureDates.length) reasons.push('Original capture dates are required');
    for (const date of evaluation.captureDates || []) {
      const age = clock - +new Date(date);
      if (!Number.isFinite(age) || age < 0 || age > FULL_PROTOCOL.libraryReuseWindowDays * 86400000) reasons.push('Evidence falls outside the 30-day reuse window');
    }
  }
  return { compatible: reasons.length === 0, reasons: [...new Set(reasons)] };
}
