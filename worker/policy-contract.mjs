import questions from '../rubric/full-questions.json' with { type: 'json' };
import reference from '../benchmark/upstream-manifest.json' with { type: 'json' };
import { POLICY_PROTOCOL, POLICY_PROTOCOL_HASH } from '../benchmark/policy-resolution.mjs';
import { FULL_PROTOCOL, websiteIdentity } from '../benchmark/protocol.mjs';
import { MODEL, EFFORT, stable, sha256 } from '../benchmark/policy-judge.mjs';
export { POLICY_PROTOCOL, POLICY_PROTOCOL_HASH, MODEL, EFFORT };
export const digest = value => sha256(stable(value));
export const EVIDENCE_SCHEMA = 'alhena-research-lab/automated-policy-evidence-v1';
export const EXECUTION_PROFILE = Object.freeze({ id: POLICY_PROTOCOL.id, model: MODEL, effort: EFFORT, maxOutputTokens: 16384, timeoutMs: 1200000, concurrency: 1, timing: Object.freeze({pollMs:250,stableMs:5000,minimumProseCharacters:80,quietBeforeSendMs:6000,quietBeforeSendLimitMs:30000,timeoutMs:120000}), sourceCommit: FULL_PROTOCOL.sourceCommit, qualityAudit: 'full-transcript-canonical', pcrAudit: 'full-blind-conservative-both-attain' });
export const QUESTION_MANIFEST = Object.freeze({ sourceCommit: questions.sourceCommit, sourcePath: questions.sourcePath, sourceSha256: questions.sourceSha256, questionsSha256: digest(questions) });
if (questions.sourceCommit !== FULL_PROTOCOL.sourceCommit || reference.files.find(f => f.path === questions.sourcePath)?.sha256 !== questions.sourceSha256) throw Error('Full question source pin mismatch');
export const themes = () => ['shopping','support'].flatMap(mode => questions[mode].map(theme => ({mode,...theme})));
export const scenario = (mode, theme) => themes().find(s => s.mode === mode && s.key === theme);
export const merchantId = store => `merchant-${sha256(websiteIdentity(store.website)).slice(0,24)}`;
export function makePolicyPlan(providers) {
  if (!Array.isArray(providers) || ![1,2].includes(providers.length)) throw Error('Policy study requires one or two providers');
  const seenProviders=new Set(), seenStores=new Set(), contexts=[];
  for (const provider of providers) {
    const p=websiteIdentity(provider.website);
    if (!provider.name?.trim() || seenProviders.has(p) || provider.customers?.length !== 5) throw Error('Five unique registered storefronts per provider are required');
    seenProviders.add(p); const names=new Set();
    for (const store of provider.customers) {
      const host=websiteIdentity(store.website);
      if (!store.name?.trim() || names.has(store.name.toLowerCase()) || seenStores.has(host)) throw Error('Duplicate or invalid storefront');
      names.add(store.name.toLowerCase()); seenStores.add(host);
      for (const s of themes()) contexts.push({id:`c-${sha256(`${p}/${host}/${s.mode}/${s.key}`).slice(0,32)}`,provider:provider.name,store:store.name,website:store.website,merchantId:merchantId(store),mode:s.mode,theme:s.key,guardrail:s.key==='guardrails',planned:s.turns.length,questions:s.turns});
    }
  }
  return contexts;
}
export function assertPolicyJob(job) {
  if (!job?.id || !job.leaseToken || !Number.isInteger(job.fencingToken) || job.protocol?.id !== POLICY_PROTOCOL.id || !/^[a-f0-9]{64}$/.test(job.protocol.sha256 || '')) throw Error('Invalid policy job or frozen snapshot');
  if (job.protocol.methodHash && job.protocol.methodHash !== POLICY_PROTOCOL_HASH) throw Error('Policy method hash mismatch');
  return makePolicyPlan(job.providers);
}
export function checkCallMetadata(metadata, request, sessions) {
  if (!metadata || metadata.model !== MODEL || metadata.requested_model !== MODEL || metadata.effort !== EFFORT || metadata.execution_profile !== POLICY_PROTOCOL.id || metadata.max_output_tokens !== 16384 || metadata.timeout_ms !== 1200000 || !['claude-cli','anthropic','openai'].includes(metadata.provider) || !metadata.response_id || sessions.has(metadata.response_id) || metadata.requestSha256 !== digest(request)) throw Error('Incompatible or duplicate policy judge provenance');
  sessions.add(metadata.response_id);
}
