import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { POLICY_PROTOCOL, type PolicyStudySummary } from '../policy-study.ts';
import { db } from './db.ts';
import { config } from './config.ts';
import { ApiError } from './model.ts';
import { hash } from './security.ts';

const text = z.string().trim().min(1).max(6000);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative();
const date = z.string().datetime({ offset: true });
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).refine(s => s !== POLICY_PROTOCOL);
const metric = z.object({ value: z.number().min(0).max(100).nullable(), explanation: text }).strict();
const coverage = z.object({
  plannedCheckpoints: count, attemptedCheckpoints: count, observedCheckpoints: count,
  submittedCheckpoints: count, assessedCheckpoints: count, unassessableCheckpoints: count,
  attainedCheckpoints: count, policyUnverifiedCheckpoints: count,
  includedContexts: count, excludedContexts: count, includedStores: count, excludedStores: count,
  qualityEligibleContexts: count, qualityEligibleStores: count, originalCaptures: count, repairedCaptures: count,
}).strict();
const lane = z.object({ policyResolution: metric, quality: metric, speed: metric, composite: metric, coverage }).strict();
const website = z.string().url().refine(s => { const u = new URL(s); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; });
const summarySchema = z.object({
  schema: z.literal('alhena-research-lab/policy-study-summary-v1'), protocol: z.literal(POLICY_PROTOCOL),
  slug, title: text, description: text, publishedAt: date, captureStartAt: date, captureEndAt: date,
  commissionedBy: z.literal('Alhena Research Lab'),
  method: z.object({ status: z.literal('final'), sha256: sha, sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), differences: z.array(text).min(1) }).strict(),
  sample: z.object({ plannedCoreContexts: count.positive(), capturedCoreContexts: count.positive(), guardrailContexts: count, judgedCoreContexts: count, pcrDecisions: count.positive(), auditedPcrDecisions: count.positive() }).strict(),
  providers: z.array(z.object({ id: slug, name: text, website, registeredStores: count.positive(), shopping: lane, support: lane, overallComposite: metric }).strict()).min(1),
  derivedFrom: z.array(z.object({ slug, sha256: sha }).strict()).min(2).optional(),
  limitations: z.array(text).min(1), audit: z.object({ description: text, limitations: z.array(text) }).strict(),
}).strict();
const pin = z.object({ path: z.string().min(1), sha256: sha }).strict();
const manifestSchema = z.object({
  schema: z.literal('alhena-research-lab/policy-publication-v1'), slug,
  status: z.literal('approved'),
  summary: pin, evidence: pin, html: pin.optional(), bundle: pin.optional(), method: pin, validation: pin,
}).strict();
const manualValidationSchema = z.object({
  schema: z.literal('alhena-research-lab/policy-publication-validation-v1'),
  protocol: z.literal(POLICY_PROTOCOL), status: z.literal('complete'), approvedForPublication: z.literal(true),
  summarySha256: sha, evidenceSha256: sha, methodSha256: sha,
  htmlSha256: sha.optional(), bundleSha256: sha.optional(),
  captureComplete: z.literal(true), scoringComplete: z.literal(true), pcrAuditComplete: z.literal(true),
  plannedCoreContexts: count.positive(), capturedCoreContexts: count.positive(), pcrDecisions: count.positive(), auditedPcrDecisions: count.positive(),
  // This is an operator's approval receipt, not authentication of model judgments by this reader.
  provenanceReviewed: z.literal(true), publicSummaryReviewed: z.literal(true),
  evidencePrivacyReviewed: z.literal(true), thirdPartyExcerptsReviewed: z.literal(true), approvedAt: date,
}).strict();
const automaticValidationSchema = z.object({
  schema: z.literal('alhena-research-lab/automatic-policy-validation-v1'),
  protocol: z.literal(POLICY_PROTOCOL), status: z.literal('complete'), approvedForPublication: z.literal(true),
  approvalBasis: z.literal('operator-approved-request-and-server-validation'),
  summarySha256: sha, evidenceSha256: sha, methodSha256: sha, htmlSha256: sha.optional(), bundleSha256: sha.optional(),
  plannedCoreContexts: count.positive(), capturedCoreContexts: count.positive(), pcrDecisions: count.positive(), auditedPcrDecisions: count.positive(),
  validation: z.literal('capture-lineage-blind-audit-arithmetic-privacy-v1'),
  sourceEvidenceSha256: sha, approvedAt: date,
}).strict();
const validationSchema = z.union([manualValidationSchema, automaticValidationSchema]);
const catalogSchema = z.object({ schema: z.literal('alhena-research-lab/policy-catalog-v1'), studies: z.array(pin) }).strict();

function directory() { return path.join(config().dataDir, 'published-studies'); }
function readPinned(root: string, item: z.infer<typeof pin>) {
  if (path.isAbsolute(item.path) || item.path.split(/[\\/]/).some(p => p === '..' || p === '.')) throw new Error('Invalid study artifact path.');
  const base = fs.realpathSync(root), real = fs.realpathSync(path.join(base, item.path));
  if (!real.startsWith(`${base}${path.sep}`) || !fs.statSync(real).isFile()) throw new Error('Study artifact escapes its private directory.');
  const bytes = fs.readFileSync(real);
  if (hash(bytes) !== item.sha256) throw new Error('Study artifact hash mismatch.');
  return bytes;
}
function validateSummary(value: unknown): PolicyStudySummary {
  const s = summarySchema.parse(value);
  if (new Date(s.captureStartAt) > new Date(s.captureEndAt) || new Date(s.captureEndAt) > new Date(s.publishedAt) || new Date(s.publishedAt).getTime() > Date.now()) throw new Error('Invalid study dates.');
  if (s.sample.capturedCoreContexts !== s.sample.plannedCoreContexts || s.sample.pcrDecisions !== s.sample.auditedPcrDecisions || s.sample.judgedCoreContexts > s.sample.capturedCoreContexts) throw new Error('Study is incomplete.');
  if (new Set(s.providers.map(p => p.id)).size !== s.providers.length || new Set(s.providers.map(p => p.website)).size !== s.providers.length) throw new Error('Duplicate study provider.');
  for (const provider of s.providers) for (const mode of ['shopping', 'support'] as const) {
    const row = provider[mode], c = row.coverage;
    if (c.attainedCheckpoints > c.assessedCheckpoints || c.policyUnverifiedCheckpoints > c.assessedCheckpoints || c.assessedCheckpoints > c.observedCheckpoints || c.assessedCheckpoints > c.submittedCheckpoints || c.submittedCheckpoints > c.attemptedCheckpoints || c.observedCheckpoints > c.attemptedCheckpoints || c.attemptedCheckpoints > c.plannedCheckpoints || c.unassessableCheckpoints > c.plannedCheckpoints || c.qualityEligibleContexts > c.includedContexts || c.qualityEligibleStores > c.includedStores || c.includedStores + c.excludedStores !== provider.registeredStores) throw new Error('Invalid study coverage.');
    if (!c.observedCheckpoints && row.policyResolution.value !== null || !c.qualityEligibleContexts && row.quality.value !== null) throw new Error('Score has no eligible evidence.');
    if ([row.policyResolution, row.quality, row.speed].some(m => m.value === null) && row.composite.value !== null) throw new Error('Composite has a missing component.');
    if ([provider.shopping.composite, provider.support.composite].some(m => m.value === null) && provider.overallComposite.value !== null) throw new Error('Overall composite has a missing lane.');
  }
  return s;
}
export function readPolicyRelease(root: string, item: z.infer<typeof pin>) {
  pin.parse(item);
  const manifest = manifestSchema.parse(JSON.parse(readPinned(root, item).toString('utf8')));
  const summary = validateSummary(JSON.parse(readPinned(root, manifest.summary).toString('utf8')));
  const validation = validationSchema.parse(JSON.parse(readPinned(root, manifest.validation).toString('utf8')));
  if (manifest.slug !== summary.slug || validation.summarySha256 !== manifest.summary.sha256 || validation.evidenceSha256 !== manifest.evidence.sha256 || validation.methodSha256 !== manifest.method.sha256 || summary.method.sha256 !== manifest.method.sha256 || validation.htmlSha256 !== manifest.html?.sha256 || validation.bundleSha256 !== manifest.bundle?.sha256) throw new Error('Study release pins disagree.');
  for (const field of ['plannedCoreContexts', 'capturedCoreContexts', 'pcrDecisions', 'auditedPcrDecisions'] as const) if (validation[field] !== summary.sample[field]) throw new Error('Study validation counts disagree.');
  if (new Date(validation.approvedAt) > new Date(summary.publishedAt)) throw new Error('Study approval follows publication.');
  // Validate every protected artifact before exposing even the public summary.
  for (const field of ['evidence', 'html', 'bundle', 'method'] as const) if (manifest[field]) readPinned(root, manifest[field]);
  return { summary, manifest };
}
export function readPolicyCatalog(root: string) {
  const filename = path.join(root, 'catalog.json');
  if (!fs.existsSync(filename)) return { catalog: { schema: 'alhena-research-lab/policy-catalog-v1' as const, studies: [] as z.infer<typeof pin>[] }, releases: [] as ReturnType<typeof readPolicyRelease>[] };
  // The sole publication switch is the explicit operator installer; request handlers never write it.
  const catalog = catalogSchema.parse(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const rows = catalog.studies.map(item => readPolicyRelease(root, item));
  if (new Set(rows.map(r => r.summary.slug)).size !== rows.length) throw new Error('Duplicate published study.');
  return { catalog, releases: rows };
}
function releases() {
  const manual = readPolicyCatalog(directory()).releases;
  const automatic = (db().prepare('SELECT manifest_json FROM policy_releases ORDER BY slug').all() as {manifest_json: string}[])
    .map(row => readPolicyRelease(directory(), JSON.parse(row.manifest_json)));
  const rows = [...manual, ...automatic];
  if (new Set(rows.map(row => row.summary.slug)).size !== rows.length) throw Error('Duplicate published study.');
  return rows;
}
export function listPolicyStudies(): PolicyStudySummary[] { return releases().map(r => r.summary); }
export function getPolicyStudy(slugValue: string) {
  if (!slug.safeParse(slugValue).success) throw new ApiError(404, 'Study not found.');
  const result = releases().find(r => r.summary.slug === slugValue);
  if (!result) throw new ApiError(404, 'Study not found.');
  return result;
}
export function policyStudyArtifact(slugValue: string, resource: 'evidence' | 'html' | 'bundle' | 'method' | 'validation') {
  const release = getPolicyStudy(slugValue), artifact = release.manifest[resource];
  if (!artifact) throw new ApiError(404, 'Study artifact not found.');
  return { ...release, bytes: readPinned(directory(), artifact), sha256: artifact.sha256 };
}
