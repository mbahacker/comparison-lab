import fs from 'node:fs';

export const RUBRIC = JSON.parse(fs.readFileSync(new URL('../rubric/criteria.json', import.meta.url), 'utf8'));
export const QUESTIONS = JSON.parse(fs.readFileSync(new URL('../rubric/questions.json', import.meta.url), 'utf8'));
export const PROTOCOL = Object.freeze({ id: 'quality-pilot-v1', rubricCommit: RUBRIC.commit,
  storesPerProvider: 3, providers: 2, conversations: 12, turns: 120, qualityChecks: 156,
  qualityOnly: true, themes: { shopping: 'everyday-value', support: 'returns' } });
export function criteriaFor(mode) { return RUBRIC.criteria.filter(c => c.mode === mode); }
export function assertJob(job) {
  if (!job?.id || !job.leaseToken || !Number.isInteger(job.fencingToken)) throw new Error('Invalid job lease');
  if (job.protocol?.id !== PROTOCOL.id || job.protocol?.rubricCommit !== RUBRIC.commit) throw new Error('Unsupported protocol');
  if (job.providers?.length !== 2 || job.providers.some(p => !p.name || !p.website || p.customers?.length !== 3)) throw new Error('Exactly two providers with three storefronts each required');
  for (const provider of job.providers) for (const store of provider.customers) {
    const url = new URL(store.website);
    if (!store.name || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid storefront');
  }
}
export class WorkerError extends Error {
  constructor(code, message, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}
