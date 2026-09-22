// Pure public projection. File pins and model receipts must be verified by the private collector.
// No filesystem, model calls, publication catalog or credentials are accessible here.
import { validateCompleteCohort, reconcileCheckpoint } from './policy-resolution.mjs';
import { redactPrivateLinks } from './policy-privacy.mjs';

const count = (xs, predicate) => xs.filter(predicate).length;
const metric = (value, explanation) => ({ value, explanation });
const ids = refs => [...new Set((refs || []).map(r => typeof r === 'string' ? r : r.sourceId))];
const decision = d => d ? { status: d.status, handling: d.handling, reason: d.reason,
  evidence: { turn: d.evidence.turn, quote: d.evidence.quote }, policyRefs: ids(d.policyRefs) } : null;
const quality = q => {
  if (!q) return null;
  if (typeof q.provenance !== 'string' || typeof q.auditCoverage !== 'string') throw Error('Quality provenance and audit coverage must be sanitized strings');
  const criteria = q.criteria == null ? undefined : Object.fromEntries(Object.entries(q.criteria).map(([id, c]) => {
    const projected = {};
    for (const key of ['pass', 'evidence', 'weight', 'signalGate', 'signalSatisfied', 'awardedPoints']) if (Object.hasOwn(c, key)) {
      const v = c[key];
      if ((['pass','signalSatisfied'].includes(key) && typeof v !== 'boolean') || (key === 'evidence' && typeof v !== 'string') || (key === 'signalGate' && v !== null && typeof v !== 'string') || (['weight','awardedPoints'].includes(key) && (!Number.isFinite(v) || v < 0 || v > 100))) throw Error('Invalid public criterion field');
      projected[key] = v;
    }
    return [id, projected];
  }));
  return { total: q.total, checks: Object.fromEntries(Object.entries(q.checks || {}).map(([key, c]) => {
    if (typeof c.pass !== 'boolean' || typeof c.evidence !== 'string') throw Error('Invalid public quality verdict');
    return [key, { pass: c.pass, evidence: c.evidence }];
  })), provenance: q.provenance, auditCoverage: q.auditCoverage, criteria };
};
const iso = value => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw Error('Missing valid evidence date'); return new Date(value).toISOString(); };
const hash = value => { if (!/^[a-f0-9]{64}$/.test(value || '')) throw Error('Missing verified content hash'); return value; };
const publicProvenance = input => Object.fromEntries([
  ...['sourceStudySha256', 'studySpecSha256', 'originalScoresSha256', 'repairPlanSha256', 'repairRawManifestSha256', 'pcrCompletionSha256', 'qualityCompletionSha256', 'originalQualityReuseSha256'].map(k => [k, hash(input?.[k])]),
  ...(Object.hasOwn(input || {}, 'schedulingAmendmentSha256') ? [['schedulingAmendmentSha256', hash(input.schedulingAmendmentSha256)]] : []),
]);

export function projectPolicyStudy({ records, expectedContexts, providers, sources, guardrails, repairSelections = null,
  slug, title, description, preparedAt, methodSha256, sourceCommit, provenance, limitations = [], auditLimitations = [] }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) throw Error('Invalid study slug');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw Error('Pinned original source commit required');
  if (!Array.isArray(guardrails)) throw Error('Guardrail accounting required');
  hash(methodSha256); iso(preparedAt);
  const seenSources = new Set(), sourceMerchants = new Map();
  for (const s of sources) {
    if (!s.id || seenSources.has(s.id)) throw Error('Duplicate or missing policy source');
    if (typeof s.merchantId !== 'string' || !s.merchantId) throw Error('Policy source needs a merchant identity');
    seenSources.add(s.id); sourceMerchants.set(s.id, s.merchantId); hash(s.sha256); iso(s.retrievedAt);
    if (!['http:', 'https:'].includes(new URL(s.url).protocol)) throw Error('Invalid policy URL');
  }
  const normalized = records.map(r => {
    hash(r.rawSha256); iso(r.capturedAt);
    if (typeof r.merchantId !== 'string' || !r.merchantId) throw Error('Conversation needs a merchant identity');
    const seenTurns = new Set();
    for (const t of r.checkpoints) {
      if (seenTurns.has(t.turn)) throw Error('Duplicate observation');
      seenTurns.add(t.turn);
      if (typeof t.question !== 'string' || typeof t.reply !== 'string') throw Error('Literal checkpoint evidence required');
      if (t.observationState !== 'submitted' && t.observationState !== 'not_submitted' && t.observationState !== 'unknown') throw Error('Observation state required');
      if (typeof t.submitted !== 'boolean' || typeof t.assessable !== 'boolean' || (t.observationState === 'not_submitted' && t.submitted) || (t.observationState === 'submitted' && !t.submitted) || (t.observationState === 'unknown' && t.assessable) || (t.assessable && !t.submitted)) throw Error('Inconsistent observation mask');
      if (t.completeMs !== null && (!Number.isFinite(t.completeMs) || t.completeMs < 0)) throw Error('Invalid completion measurement');
    }
    if (seenTurns.size !== 10) throw Error('All ten planned checkpoints must remain visible');
    if (!Array.isArray(r.policyIds) || new Set(r.policyIds).size !== r.policyIds.length || r.policyIds.some(id => !seenSources.has(id))) throw Error('Unknown or duplicate policy reference');
    if (r.policyIds.some(id => sourceMerchants.get(id) !== r.merchantId)) throw Error('Foreign merchant policy reference');
    for (const t of r.checkpoints) for (const d of [t.primary, t.audit]) if (d && ids(d.policyRefs).some(id => !r.policyIds.includes(id) || sourceMerchants.get(id) !== r.merchantId)) throw Error('Decision cites a foreign merchant policy reference');
    if (r.qualityEvidence?.total !== (r.quality ?? undefined) && !(r.quality === null && !r.qualityEvidence)) throw Error('Quality evidence/score mismatch');
    if (r.correctedCapture && r.quality !== null && r.qualityEvidence.provenance !== 'fresh-repair-quality') throw Error('Repair cannot reuse original quality');
    return { ...r, checkpoints: r.checkpoints.map(t => ({ ...t, primary: decision(t.primary), audit: decision(t.audit) })) };
  });
  const aggregation = validateCompleteCohort(normalized, expectedContexts);
  const repaired = normalized.filter(r => r.correctedCapture), selectedIds = new Set();
  if (repaired.length && (!repairSelections || !Array.isArray(repairSelections.candidates) || repairSelections.candidates.length !== repaired.length || typeof repairSelections.selectionRule !== 'string' || !repairSelections.selectionRule.trim())) throw Error('Complete repair selection evidence required');
  if (!repaired.length && repairSelections?.candidates?.length) throw Error('Unexpected repair selection evidence');
  const publicRepairs = repairSelections ? {
    selectionRule: repairSelections.selectionRule,
    sourceClassificationNote: 'The original detector classification shown here is the observation being corrected, not confirmation that a human replied. These original excerpts explain selection and do not enter the revised scores.',
    candidates: repairSelections.candidates.map(c => {
      const r = repaired.find(r => r.id === c.id);
      if (!r || selectedIds.has(c.id) || ['provider','store','mode','theme'].some(k => c[k] !== r[k])) throw Error('Repair selection identity mismatch');
      selectedIds.add(c.id);
      if (hash(c.originalRawSha256) !== r.originalRawSha256 || hash(c.newRawSha256) !== r.rawSha256 || iso(c.originalCapturedAt) > iso(r.capturedAt)) throw Error('Repair selection source mismatch');
      if (typeof c.reason !== 'string' || !c.reason.trim()) throw Error('Repair selection reason required');
      const t = c.originalFlaggedStop;
      if (t !== null && (!t || !Number.isInteger(t.turn) || t.turn < 1 || t.turn > 10 || typeof t.question !== 'string' || t.question !== r.checkpoints.find(x => x.turn === t.turn)?.question || typeof t.reply !== 'string' || typeof t.sourceActorLabel !== 'string' || (t.handoverHit !== null && typeof t.handoverHit !== 'string'))) throw Error('Invalid original repair-stop evidence');
      return { id: c.id, provider: c.provider, store: c.store, mode: c.mode, theme: c.theme, reason: c.reason,
        originalRawSha256: c.originalRawSha256, newRawSha256: c.newRawSha256, originalCapturedAt: iso(c.originalCapturedAt),
        originalFlaggedStop: t && { turn: t.turn, question: t.question, reply: t.reply, sourceActorLabel: t.sourceActorLabel, handoverHit: t.handoverHit } };
    }),
  } : null;
  const dates = normalized.map(r => iso(r.capturedAt)).sort();
  const lane = (provider, name) => {
    const result = provider[name], coverage = result.coverage;
    const rs = normalized.filter(r => r.provider === provider.name && r.mode === name);
    return {
      policyResolution: metric(result.resolution, 'Verified correct answer or policy-prescribed next step, averaged equally by conversation and storefront. This does not measure downstream case completion.'),
      quality: metric(result.quality, 'The original fixed answer-quality rubric. Unchanged captures retain their original judgments; repaired captures receive a fresh judgment and audit.'),
      speed: metric(result.speed, `Full-answer completion ${result.completionSeconds ?? 'unavailable'} seconds; 100 at 3 seconds, zero at 22 seconds, bounded between 0 and 100.`),
      composite: metric(result.composite, result.rankable ? (name === 'shopping' ? '40% policy-compliant resolution, 35% quality, 25% speed.' : '50% policy-compliant resolution, 40% quality, 10% speed.') : 'Insufficient observed coverage for a headline composite; component results remain inspectable.'),
      coverage: {
        plannedCheckpoints: coverage.plannedCheckpoints,
        attemptedCheckpoints: coverage.submittedCheckpoints,
        observedCheckpoints: count(rs.flatMap(r => r.checkpoints), t => t.observationState === 'submitted'),
        submittedCheckpoints: coverage.submittedCheckpoints,
        assessedCheckpoints: coverage.assessableCheckpoints,
        unassessableCheckpoints: coverage.unassessableSubmittedCheckpoints,
        attainedCheckpoints: coverage.attainedCheckpoints,
        policyUnverifiedCheckpoints: coverage.unverifiedCheckpoints,
        includedContexts: coverage.assessedConversations,
        excludedContexts: coverage.registeredConversations - coverage.assessedConversations,
        includedStores: coverage.resolutionStores,
        excludedStores: coverage.registeredStores - coverage.resolutionStores,
        qualityEligibleContexts: coverage.qualityConversations,
        qualityEligibleStores: coverage.qualityStores,
        originalCaptures: rs.filter(r => !r.correctedCapture).length,
        repairedCaptures: coverage.repairedCaptures,
      },
    };
  };
  const summary = {
    schema: 'alhena-research-lab/policy-study-summary-v1', protocol: 'policy-resolution-v1',
    slug, title, description, publishedAt: iso(preparedAt), captureStartAt: dates[0], captureEndAt: dates.at(-1),
    commissionedBy: 'Alhena Research Lab',
    method: { status: 'final', sha256: methodSha256, sourceCommit,
      differences: ['Replaces the source automation classifier with policy-compliant resolution.', 'Every eligible checkpoint receives two fresh blind judgments; attainment requires agreement and valid evidence.', `Cause-selected capture repairs retained: ${normalized.filter(r => r.correctedCapture).length}. The source study remains unchanged.`] },
    sample: { plannedCoreContexts: expectedContexts.length, capturedCoreContexts: normalized.length, guardrailContexts: guardrails.length,
      judgedCoreContexts: aggregation.conversations.filter(r => r.score !== null).length,
      pcrDecisions: aggregation.conversations.reduce((n, r) => n + r.assessable, 0),
      auditedPcrDecisions: aggregation.conversations.reduce((n, r) => n + r.assessable, 0) },
    providers: aggregation.providers.map(p => {
      const identity = providers.find(x => x.name === p.name);
      if (!identity || !/^https?:\/\//.test(identity.website)) throw Error('Missing provider identity');
      return { id: identity.id, name: p.name, website: identity.website,
        registeredStores: new Set(normalized.filter(r => r.provider === p.name).map(r => r.store)).size,
        shopping: lane(p, 'shopping'), support: lane(p, 'support'),
        overallComposite: metric(p.overall, 'Equal mean of the two unrounded lane composites; only available when both lanes meet coverage floors.') };
    }),
    limitations: [
      'Alhena commissioned and operates this study. Selected storefront deployments do not establish a universal provider ranking or independent certification.',
      'This methodology was developed after reviewing the original automation results, then frozen before the new policy-resolution judgments.',
      'The sessions were logged out. No real order, refund, account change or completed human resolution was independently verified.',
      'Unknown delivery or actor attribution remains unassessable. Unsent questions are not successes or failures. Conditional scores must be read with planned and assessed coverage.',
      ...limitations,
    ],
    audit: { description: 'Every assessed policy-resolution checkpoint receives a primary and a fresh blind audit. Both must award valid evidence-backed attainment. Attainment disagreements receive zero verified credit and remain visible.',
      limitations: ['Provider names were masked where practicable; full anonymity is not claimed.', 'Retained original quality judgments have separate historical audit coverage. The repair-quality audit sees the primary quality verdicts and full captured replies; it is distinct from the blind policy-resolution audit.', ...auditLimitations] },
  };
  const evidence = {
    schema: 'alhena-research-lab/policy-study-evidence-v1', protocol: summary.protocol,
    provenance: publicProvenance(provenance), coverageDefinitions: {
      submitted: 'Recorded attempted UI submission, not independent proof of backend delivery.',
      observed: 'A recorded submission state rather than an unknown state; includes confirmed empty-response observations.',
      assessed: 'Recorded submitted checkpoints with a sufficiently known actor and observation state.',
      attained: 'Both primary and blind audit grant attainment with valid same-response evidence.',
    },
    conversations: normalized.map(r => ({
      id: r.id, provider: r.provider, store: r.store, mode: r.mode, theme: r.theme,
      capturedAt: r.capturedAt, correctedCapture: r.correctedCapture, rawSha256: r.rawSha256,
      originalRawSha256: r.originalRawSha256, exclusion: r.exclusion || null, limitations: r.limitations || [],
      turns: r.checkpoints.map(t => ({ turn: t.turn, question: t.question, reply: t.reply,
        unsent: t.observationState === 'not_submitted', observationState: t.observationState,
        observationReason: t.observationReason, assessed: !r.exclusion && t.submitted && t.assessable,
        completeMs: t.completeMs, primary: t.primary, audit: t.audit,
        final: r.exclusion ? { status: 'unassessable', attained: 0, denominator: 0 } : reconcileCheckpoint(t, r.policyIds),
      })), quality: quality(r.qualityEvidence),
    })),
    policySources: sources.map(s => ({ id: s.id, merchantId: s.merchantId, merchant: s.merchant, url: s.url, retrievedAt: s.retrievedAt,
      sha256: s.sha256, referenceSha256: s.referenceSha256, limitations: s.limitations })),
    guardrails: guardrails.map(g => ({ id: g.id, provider: g.provider, store: g.store, capturedAt: iso(g.capturedAt), rawSha256: hash(g.rawSha256),
      provenance: 'Unchanged original guardrail capture; excluded from the policy-resolution composite.',
      exclusion: g.exclusion || null, quality: quality(g.quality),
      turns: g.turns.map(t => ({ turn: t.turn, question: t.question, reply: t.reply, unsent: t.unsent === true,
        completeMs: t.completeMs ?? null, actor: t.actor, limitation: t.limitation })),
    })),
    repairSelections: publicRepairs,
    storefrontResults: aggregation.providers.flatMap(p => ['shopping', 'support'].flatMap(mode => p[mode].stores.map(s => ({ provider: p.name, mode, ...s })))),
    arithmetic: aggregation,
  };
  const display = redactPrivateLinks({ summary, evidence });
  if (display.redactions.length) {
    display.value.evidence.privacyRedactions = display.redactions;
    display.value.summary.limitations.push('Private cart, session or customer links are redacted from displayed evidence and quotations. Judgments used the unchanged original captures; these display redactions do not change scores.');
  }
  return { ...display.value, aggregation: display.value.evidence.arithmetic, reviewState: 'Unpublished review package; approval and a separate validated publication manifest are required.' };
}
