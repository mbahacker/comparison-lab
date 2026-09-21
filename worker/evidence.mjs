import { PROTOCOL, RUBRIC, QUESTIONS, criteriaFor, WorkerError } from './protocol.mjs';
import { deriveCheckedScore, checkQuotes } from './scoring.mjs';
import { AUTHOR_MARKERS } from './authorship.mjs';

export function assembleEvidence(job, conversations, manifest) {
  let agreed = 0, checked = 0;
  for (const c of conversations) for (const check of c.checks) { checked++; if (check.audit.classification === 'AGREE') agreed++; }
  const agreement = checked ? Math.round(agreed / checked * 1000) / 10 : 0;
  const evidence = { schema_version: 'comparison-lab-evidence/v1',
    study: { title: `${job.providers[0].name} vs ${job.providers[1].name}`, protocol_id: PROTOCOL.id, source_commit: RUBRIC.commit,
      date: new Date().toISOString().slice(0, 10), commissioned_by: 'Comparison Lab / Alhena',
      performed_by: 'Automated live-browser capture with separate AI judge and auditor requests.',
      independence_disclosure: 'Operated by Comparison Lab / Alhena. Separate AI judging requests do not constitute an independent research institution, certification, or fully blinded study.',
      scope: 'Six approved storefront deployments, three per provider. Twelve ten-turn conversations use the fixed everyday-value shopping and returns support themes. All 26 published quality criteria apply.',
      scoring_statement: 'Audited binary verdicts are scored by the unmodified hash-verified upstream function, using the published fixed weights and deterministic signal gates. Independent arithmetic is checked for equality. This quality-only pilot does not compute an automation, speed, or overall composite.',
      rubric_url: RUBRIC.source_url,
      generated_at: new Date().toISOString(), quality_only: true, counts: { storefronts: 6, conversations: 12, turns: 120, criteria: 26, decisions: 156 },
      limitations: ['Operator-approved storefront sample; merchant configuration and catalogue differ.', 'Two fixed themes cover all 26 quality criteria, not all upstream question themes.', 'Quality-only exploratory report, not the publisher leaderboard or vendor-wide superiority.', 'Separate model judge and auditor; limited masking, not an institutionally independent study.', 'Generic DOM extraction can be blocked by unsupported widget layouts; failed runs do not publish scores.', 'Source-policy and real cart correctness are not independently audited by this automated protocol.'] },
    rubric: { source_commit: RUBRIC.commit, source_url: RUBRIC.source_url, source_sha256: RUBRIC.source_sha256, criteria: RUBRIC.criteria },
    question_pools: QUESTIONS, executed_themes: PROTOCOL.themes, live_conversations: conversations,
    archived_conversations: [], audit: { agreement_pct: agreement, trusted: agreement >= 90, verdicts: checked, agreed, corrected: checked - agreed,
      method: 'Separate fresh model requests; all 156 criteria audited against full judging packets' },
    provenance: { protocol: PROTOCOL.id, pinned_reference: manifest, generated_by: 'comparison-lab-worker', factual_claim_verification: 'Not independently performed; rubric quality is not factual perfection' },
    validation: { passed: false } };
  validateEvidence(evidence, job);
  evidence.validation = { passed: true, checked_at: new Date().toISOString(), checks: ['coverage', 'fixed_questions', 'complete_visible_responses', 'verbatim_passing_quotes', 'canonical_weights_and_signal_gates', 'audited_decisions', 'minimum_audit_agreement', 'sensitive_data_gate'] };
  return evidence;
}
export function validateEvidence(evidence, job) {
  if (evidence.live_conversations?.length !== 12) throw new WorkerError('incomplete_evidence', 'Exactly twelve complete conversations required');
  if (!evidence.audit?.trusted || evidence.audit.agreement_pct < 90) throw new WorkerError('audit_disagreement', 'Audit agreement below the published 90% threshold; review required');
  const required = new Set(job.providers.flatMap(p => p.customers.flatMap(s => ['shopping', 'support'].map(mode => `${p.name}|${s.name}|${new URL(s.website).href}|${mode}`))));
  const seenIds = new Set();
  for (const c of evidence.live_conversations) {
    const key = `${c.vendor}|${c.store}|${new URL(c.url).href}|${c.mode}`;
    if (!required.delete(key) || seenIds.has(c.id)) throw new WorkerError('incomplete_evidence', 'Duplicate or unexpected conversation');
    seenIds.add(c.id);
    if (c.turns?.length !== 10 || c.theme !== QUESTIONS[c.mode]?.key) throw new WorkerError('incomplete_evidence', 'Wrong theme or turn count');
    c.turns.forEach((t, i) => {
      if (t.question !== QUESTIONS[c.mode].turns[i] || t.turn !== i + 1 || t.speaker !== 'ai' || t.handover || t.unsent || t.response_complete !== true || !t.reply || !t.reply_as_judged) throw new WorkerError('incomplete_evidence', 'Missing or altered turn');
      const proof = t.author_evidence;
      if (t.author_verified !== true || !proof || !['dom-ai-author', 'reviewed-bot-selector'].includes(proof.kind) || !proof.selector || proof.provider !== c.vendor || proof.adapter_id !== c.capture_metadata?.adapter || !Number.isInteger(proof.message_count) || proof.message_count < 1 || !Array.isArray(proof.markers) || !proof.markers.length) throw new WorkerError('unverified_author', 'Every response requires positive AI-author evidence');
      if (proof.markers.some(m => proof.kind === 'dom-ai-author' ? !AUTHOR_MARKERS[m.attribute]?.includes(m.value) : m.attribute !== 'reviewed-selector' || m.value !== proof.selector)) throw new WorkerError('unverified_author', 'Author evidence did not match an allowed marker or reviewed selector');
      if (/\b(?:your (?:unique|personal|exclusive) (?:coupon|discount|promo)?\s*code|password|one[- ]time (?:code|password)|verification code)\s*(?:is|:)/i.test(t.reply)) throw new WorkerError('privacy_review_required', 'Potential private credentials or individualized coupon requires review');
    });
    if (c.checks?.length !== criteriaFor(c.mode).length) throw new WorkerError('incomplete_evidence', 'Missing criteria');
    const final = Object.fromEntries(c.checks.map(x => [x.id, x.final]));
    checkQuotes(final, c.turns.map(t => ({ reply: t.reply_as_judged })));
    const score = deriveCheckedScore(c.mode, final, c.signals);
    if (score.total !== c.score || c.checks.reduce((n, v) => n + v.awarded, 0) !== c.score) throw new WorkerError('scoring_mismatch', 'Score does not reconcile');
  }
  if (required.size) throw new WorkerError('incomplete_evidence', 'Missing storefront/lane coverage');
  return true;
}
