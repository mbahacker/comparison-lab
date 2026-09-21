import rubric from '../rubric/criteria.json' with { type: 'json' };
import questions from '../rubric/questions.json' with { type: 'json' };

// Static JSON imports work in both the Node worker and Next's server bundler.
export const RUBRIC = rubric;
export const QUESTIONS = questions;
export const PROTOCOL = Object.freeze({ id: 'quality-pilot-v1', rubricCommit: RUBRIC.commit,
  storesPerProvider: 3, providers: 2, conversations: 12, turns: 120, qualityChecks: 156,
  qualityOnly: true, themes: { shopping: 'everyday-value', support: 'returns' } });
export function criteriaFor(mode) { return RUBRIC.criteria.filter(c => c.mode === mode); }
export function evaluationCounts(providers) {
  if (!Array.isArray(providers) || ![1, 2].includes(providers.length) || providers.some(p => !p.name || !p.website || p.customers?.length !== 3)) throw new Error('One or two providers with three storefronts each required');
  return { stores: providers.length * 3, conversations: providers.length * 6, turns: providers.length * 60, checks: providers.length * 78, criteria: 26 };
}
export function assertJob(job) {
  if (!job?.id || !job.leaseToken || !Number.isInteger(job.fencingToken)) throw new Error('Invalid job lease');
  if (job.protocol?.id !== PROTOCOL.id || job.protocol?.rubricCommit !== RUBRIC.commit) throw new Error('Unsupported protocol');
  const counts = evaluationCounts(job.providers);
  for (const provider of job.providers) for (const store of provider.customers) {
    const url = new URL(store.website);
    if (!store.name || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid storefront');
  }
  if (job.reusedConversations !== undefined && (!Array.isArray(job.reusedConversations) || job.reusedConversations.length > counts.conversations || job.reusedConversations.some(c => !c?.reuse || !c.id || !['shopping', 'support'].includes(c.mode)))) throw new Error('Invalid authorized reused conversations');
}
export class WorkerError extends Error {
  constructor(code, message, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}
