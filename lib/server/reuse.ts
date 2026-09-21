import { getReport, listReports, protocol, reportSummary, validateEvidence, PROTOCOL_ID, SEED_SLUG } from './evidence.ts';
import { ApiError, type Provider, type Row } from './model.ts';
import { assembleEvidence } from '../../worker/evidence.mjs';
import { evaluationCounts } from '../../worker/protocol.mjs';
import { evidenceHash, providerIdentity, storefrontIdentity, laneIdentity, validateReusableConversation, reuseLimitations, reusableAt, REUSE_WINDOW_MS } from '../../worker/reuse.mjs';

// The imported report contains vendor names but no provider website field. This explicit,
// immutable mapping applies only to this exact public evidence bundle, never arbitrary names.
const SEED_HASH = '41da1fccf0baf9283c88f5a1f585ac2babfd484fb0f9fe58e66953295bf94085';
const SEED_WEBSITES: Record<string, string> = { Alhena: 'https://alhena.ai/', Gorgias: 'https://www.gorgias.com/' };
type Source = { report: Row; evidence: Row; digest: string; providers: Provider[]; historical: boolean };
type Lane = { source: Source; conversation: Row; provider: Provider };
type Cohort = { source: Source; provider: Provider; lanes: Lane[]; key: string; newest: string; oldest: string };
type ReusePlan = { version: number; protocolSnapshotSha256: string; providers: Provider[]; references: Row[]; reusedConversations: number; newConversations: number; reusedStores: number; newStores: number; sources: Row[]; exactReport?: { slug: string; title: string }; existingReport?: { slug: string; title: string }; previousReport?: { slug: string; title: string }; existingTool?: { id: string; name: string; reportSlug: string } };
function bad(): never { throw new ApiError(422, 'The selected published evidence is no longer compatible or its integrity changed.'); }
const canonicalProviders = (providers: Provider[]) => providers.map(p => `${providerIdentity(p.website)}\0${p.customers.map(c => storefrontIdentity(c.website)).sort().join('\0')}`).sort();

function readSource(slug: string, snapshot: Row, cache = new Map<string, Source>()): Source {
  const cached = cache.get(slug); if (cached) return cached;
  const { report, evidence } = getReport(slug); const digest = evidenceHash(evidence);
  const historical = slug === SEED_SLUG && digest === SEED_HASH;
  if (slug === SEED_SLUG && !historical) bad();
  if (evidence.study?.source_commit !== snapshot.rubricCommit || evidence.study?.quality_only !== true || (!historical && evidence.study?.protocol_id !== snapshot.id) || evidence.validation?.passed !== true || !Array.isArray(evidence.study?.limitations) || !evidence.study.limitations.length || !Array.isArray(evidence.live_conversations)) bad();
  if (!historical && evidenceHash(evidence.rubric?.criteria) !== evidenceHash(snapshot.criteria)) bad();
  const audit = historical ? evidence.audit?.summary : evidence.audit;
  if (audit?.trusted !== true || audit.agreement_pct < snapshot.minimumAuditAgreement) bad();
  let providers: Provider[];
  if (historical) {
    providers = Object.entries(SEED_WEBSITES).map(([name, website]) => ({ name, website, customers: [...new Map<string, { name: string; website: string }>(evidence.live_conversations.filter((c: Row) => c.vendor === name).map((c: Row) => [storefrontIdentity(c.url), { name: c.store, website: c.url }])).values()] }));
  } else {
    providers = evidence.study.providers;
    if (!Array.isArray(providers) || ![1, 2].includes(providers.length) || providers.some(p => !p.name || !p.website || p.customers?.length !== 3)) bad();
  }
  if (new Set(providers.map(p => providerIdentity(p.website))).size !== providers.length || evidence.live_conversations.length !== providers.length * 6) bad();
  for (const p of providers) if (p.customers.length !== 3 || new Set(p.customers.map(c => storefrontIdentity(c.website))).size !== 3) bad();
  const source = { report, evidence, digest, providers, historical }; cache.set(slug, source); return source;
}
function sourceProvider(source: Source, c: Row) {
  const p = source.providers.find(p => p.name === c.vendor && p.customers.some(s => s.name === c.store && storefrontIdentity(s.website) === storefrontIdentity(c.url)));
  if (!p) bad(); return p;
}
function material(c: Row) { const { id, vendor, store, url, reuse, ...rest } = c; return rest; }
function origin(source: Source, c: Row, snapshot: Row, visited = new Set<string>(), cache = new Map<string, Source>()): Lane {
  const key = `${source.report.slug}\0${c.id}`; if (visited.has(key) || visited.size > 10) bad(); visited.add(key);
  const provider = sourceProvider(source, c);
  if (!c.reuse) { validateReusableConversation(c, snapshot, source.historical); return { source, conversation: c, provider }; }
  const ref = c.reuse;
  const parent = readSource(ref.sourceReportSlug, snapshot, cache);
  if (parent.digest !== ref.sourceReportHash) bad();
  const original = parent.evidence.live_conversations.find((item: Row) => item.id === ref.sourceConversationId);
  if (!original || evidenceHash(original) !== ref.sourceConversationHash || evidenceHash(material(original)) !== evidenceHash(material(c))) bad();
  const found = origin(parent, original, snapshot, visited, cache);
  if (providerIdentity(provider.website) !== providerIdentity(found.provider.website) || storefrontIdentity(c.url) !== storefrontIdentity(found.conversation.url)) bad();
  for (const limitation of reuseLimitations([c])) if (!source.evidence.study.limitations.includes(limitation)) bad();
  return found;
}
function available(snapshot: Row) {
  const sources: Source[] = []; const lanes: Lane[] = []; const cohorts: Cohort[] = [];
  const cache = new Map<string, Source>();
  for (const summary of listReports()) {
    try {
      const source = readSource(summary.slug, snapshot, cache); let checked = 0, agreed = 0;
      const found = source.evidence.live_conversations.map((c: Row) => origin(source, c, snapshot, new Set(), cache));
      const identities = new Set<string>();
      for (const item of found) {
        const result = validateReusableConversation(item.conversation, snapshot, item.source.historical); checked += result.checked; agreed += result.agreed;
        identities.add(laneIdentity(item.provider.website, item.conversation.url, item.conversation.mode));
      }
      const reported = source.historical ? source.evidence.audit.summary : source.evidence.audit;
      const counts = evaluationCounts(source.providers);
      if (identities.size !== counts.conversations || checked !== counts.checks || reported.verdicts !== checked || reported.agreement_pct !== Math.round(agreed / checked * 1000) / 10 || (!source.historical && (reported.agreed !== agreed || reported.corrected !== checked - agreed))) continue;
      sources.push(source); lanes.push(...found);
      for (const provider of source.providers) {
        const group: Lane[] = found.filter((item: Lane) => providerIdentity(item.provider.website) === providerIdentity(provider.website));
        const audit = group.map(item => validateReusableConversation(item.conversation, snapshot, item.source.historical));
        if (group.length !== 6 || audit.reduce((n, a) => n + a.checked, 0) !== 78 || audit.reduce((n, a) => n + a.agreed, 0) / 78 * 100 < snapshot.minimumAuditAgreement) continue;
        const dates = group.map(item => new Date(item.conversation.captured_at).toISOString()).sort();
        const key = evidenceHash(group.map(item => ({ provider: providerIdentity(provider.website), storefront: storefrontIdentity(item.conversation.url), mode: item.conversation.mode, source: item.source.digest, conversation: evidenceHash(item.conversation) })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
        cohorts.push({ source, provider, lanes: group, key, oldest: dates[0], newest: dates[dates.length - 1] });
      }
    } catch { /* Unreadable, changed or incompatible published evidence is not offered for reuse. */ }
  }
  lanes.sort((a, b) => b.conversation.captured_at.localeCompare(a.conversation.captured_at) || b.source.report.publishedAt.localeCompare(a.source.report.publishedAt) || a.source.report.slug.localeCompare(b.source.report.slug) || a.conversation.id.localeCompare(b.conversation.id));
  sources.sort((a, b) => b.report.publishedAt.localeCompare(a.report.publishedAt) || a.report.slug.localeCompare(b.report.slug));
  cohorts.sort((a, b) => b.newest.localeCompare(a.newest) || b.oldest.localeCompare(a.oldest) || a.source.providers.length - b.source.providers.length || a.source.report.slug.localeCompare(b.source.report.slug));
  return { sources, lanes, cohorts };
}
export function toolId(website: string) { const identity = providerIdentity(website); return `${identity.replace(/[^a-z0-9]+/g, '-').slice(0, 65)}-${evidenceHash(identity).slice(0, 10)}`; }
function freshCohort(cohort: Cohort, now: number) { return cohort.lanes.every(item => reusableAt(item.conversation.captured_at, now)); }
function latestCohorts(cohorts: Cohort[], now: number) {
  const unique = new Map<string, Cohort>();
  for (const c of [...cohorts].sort((a, b) => Number(freshCohort(b, now)) - Number(freshCohort(a, now)))) if (!unique.has(providerIdentity(c.provider.website))) unique.set(providerIdentity(c.provider.website), c);
  return [...unique.values()];
}
function toolSummary(cohort: Cohort, cohorts: Cohort[], now: number): Row {
  const provider = cohort.provider;
  const customers = provider.customers.map(customer => {
    const lanes = cohort.lanes.filter(item => storefrontIdentity(item.conversation.url) === storefrontIdentity(customer.website));
    const analyses: Record<string, { date: string; capturedAt: string; score: number; sourceReportSlug: string; reusable: boolean; expiresAt: string }> = Object.fromEntries(lanes.map(({ source, conversation: c }) => [c.mode, { date: c.date, capturedAt: c.captured_at, score: c.score, sourceReportSlug: source.report.slug, reusable: reusableAt(c.captured_at, now), expiresAt: new Date(Date.parse(c.captured_at) + REUSE_WINDOW_MS).toISOString() }]));
    const captureDates = lanes.map(item => new Date(item.conversation.captured_at).toISOString()).sort();
    return { ...customer, shopping: analyses.shopping.score, support: analyses.support.score, oldestCaptureAt: captureDates[0], capturedAt: captureDates.at(-1), date: analyses.shopping.date, sourceReportSlug: cohort.source.report.slug, analyses, reusable: lanes.every(item => reusableAt(item.conversation.captured_at, now)), expiresAt: Object.values(analyses).map(a => a.expiresAt).sort()[0] };
  });
  const scores = Object.fromEntries(['shopping', 'support'].map(mode => [mode, Math.round(cohort.lanes.filter(item => item.conversation.mode === mode).reduce((n, item) => n + item.conversation.score, 0) / 3 * 10) / 10]));
  return { id: toolId(provider.website), name: provider.name, website: provider.website, reportSlug: cohort.source.report.slug,
    evaluatedAt: cohort.newest, oldestCaptureAt: cohort.oldest, expiresAt: new Date(Date.parse(cohort.oldest) + REUSE_WINDOW_MS).toISOString(), fresh: freshCohort(cohort, now), scores,
    storeCount: 3, conversationCount: 6, turnCount: 60, customers, limitations: [...new Set([...cohort.source.evidence.study.limitations, ...reuseLimitations(cohort.lanes.filter(item => item.source.historical).map(item => ({ reuse: { historicalAuthorVerification: true, sourceLimitations: item.source.evidence.study.limitations } })))])], protocol: PROTOCOL_ID,
    comparisonSlugs: [...new Set(cohorts.filter(c => c.source.providers.length === 2 && providerIdentity(c.provider.website) === providerIdentity(provider.website)).map(c => c.source.report.slug))] };
}
export function getToolLibrary(now = Date.now()) {
  const { cohorts } = available(protocol());
  return { tools: latestCohorts(cohorts, now).map(c => toolSummary(c, cohorts, now)).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), generatedAt: new Date(now).toISOString(), maxAgeDays: 30 };
}
export function getTool(id: string, now = Date.now()) { return getToolLibrary(now).tools.find(tool => tool.id === id); }
export function getProviderCatalog(query = '', now = Date.now()) {
  const q = query.trim().toLowerCase();
  return { providers: getToolLibrary(now).tools.filter(tool => !q || tool.name.toLowerCase().includes(q) || tool.website.toLowerCase().includes(q)).map(tool => ({ name: tool.name, website: tool.website, customers: tool.customers, latestAnalysisAt: tool.evaluatedAt })) };
}
export function planReuse(providers: Provider[], snapshot: Row, reuseExisting = true, now = Date.now()): ReusePlan {
  const counts = evaluationCounts(providers);
  const { sources, lanes, cohorts } = available(snapshot); const references: Row[] = [];
  if (reuseExisting) for (const provider of providers) for (const customer of provider.customers) for (const mode of ['shopping', 'support']) {
    const item = lanes.find(item => reusableAt(item.conversation.captured_at, now) && laneIdentity(item.provider.website, item.conversation.url, item.conversation.mode) === laneIdentity(provider.website, customer.website, mode));
    if (!item) continue;
    references.push({ providerWebsite: provider.website, storefrontWebsite: customer.website, mode,
      sourceReportSlug: item.source.report.slug, sourceReportHash: item.source.digest,
      sourceConversationId: item.conversation.id, sourceConversationHash: evidenceHash(item.conversation), capturedAt: item.conversation.captured_at });
  }
  const reusedStoreKeys = new Set(references.map(ref => `${providerIdentity(ref.providerWebsite)}\0${storefrontIdentity(ref.storefrontWebsite)}`));
  const fullyReusedStores = [...reusedStoreKeys].filter(key => references.filter(ref => `${providerIdentity(ref.providerWebsite)}\0${storefrontIdentity(ref.storefrontWebsite)}` === key).length === 2).length;
  const matching = sources.filter(source => evidenceHash(canonicalProviders(source.providers)) === evidenceHash(canonicalProviders(providers)));
  const exact = reuseExisting ? matching.find(source => source.evidence.live_conversations.every((c: Row) => reusableAt(c.captured_at, now))) : undefined;
  const exactReport = exact ? { slug: exact.report.slug, title: exact.report.title } : undefined;
  const sameTool = providers.length === 1 && reuseExisting ? cohorts.find(c => freshCohort(c, now) && evidenceHash(canonicalProviders([c.provider])) === evidenceHash(canonicalProviders(providers))) : undefined;
  return { version: 1, protocolSnapshotSha256: snapshot.sha256, providers: structuredClone(providers), references,
    reusedConversations: references.length, newConversations: counts.conversations - references.length,
    reusedStores: fullyReusedStores, newStores: counts.stores - fullyReusedStores,
    sources: [...new Map(references.map(ref => [ref.sourceReportSlug, { slug: ref.sourceReportSlug, capturedAt: ref.capturedAt }])).values()],
    ...(exactReport ? { exactReport, existingReport: exactReport } : matching.length ? { previousReport: { slug: matching[0].report.slug, title: matching[0].report.title } } : {}),
    ...(sameTool ? { existingTool: { id: toolId(sameTool.provider.website), name: sameTool.provider.name, reportSlug: sameTool.source.report.slug } } : {}) };
}
export function resolveReuse(plan: Row | null | undefined, providers: Provider[], snapshot: Row, now = Date.now()) {
  if (!plan) return [];
  if (plan.version !== 1 || plan.protocolSnapshotSha256 !== snapshot.sha256 || evidenceHash(plan.providers) !== evidenceHash(providers) || !Array.isArray(plan.references)) bad();
  const seen = new Set<string>();
  const cache = new Map<string, Source>();
  return plan.references.map((ref: Row) => {
    const provider = providers.find(p => providerIdentity(p.website) === providerIdentity(ref.providerWebsite));
    const customer = provider?.customers.find(c => storefrontIdentity(c.website) === storefrontIdentity(ref.storefrontWebsite));
    if (!provider || !customer || !['shopping', 'support'].includes(ref.mode)) bad();
    const key = laneIdentity(provider.website, customer.website, ref.mode); if (seen.has(key)) bad(); seen.add(key);
    const source = readSource(ref.sourceReportSlug, snapshot, cache);
    if (source.digest !== ref.sourceReportHash) bad();
    const c = source.evidence.live_conversations.find((c: Row) => c.id === ref.sourceConversationId);
    if (!c || evidenceHash(c) !== ref.sourceConversationHash || c.captured_at !== ref.capturedAt || !reusableAt(c.captured_at, now) || c.mode !== ref.mode || c.reuse) bad();
    const originalProvider = sourceProvider(source, c);
    if (providerIdentity(originalProvider.website) !== providerIdentity(provider.website) || storefrontIdentity(c.url) !== storefrontIdentity(customer.website)) bad();
    validateReusableConversation(c, snapshot, source.historical);
    return { ...structuredClone(c), id: `reuse-${evidenceHash({ key, source: ref.sourceReportHash, conversation: c.id }).slice(0, 32)}`, vendor: provider.name, store: customer.name, url: customer.website,
      reuse: { ...ref, sourcePublishedAt: source.report.publishedAt, sourceVendor: c.vendor, sourceStore: c.store, sourceUrl: c.url, date: c.date,
        historicalAuthorVerification: source.historical,
        authorVerification: source.historical ? 'Inherited original published attribution; no per-turn proof was recorded or newly verified.' : 'Inherited immutable AI-author proof from the original published capture; not recaptured.',
        sourceLimitations: structuredClone(source.evidence.study.limitations), sourceProvenance: structuredClone(source.evidence.provenance || {}), sourceStudyDisclosure: source.evidence.study.independence_disclosure || '' } };
  });
}

/** Pure composition; caller persists all generated reports in the source publication transaction. */
export function buildToolComparisons(toolReportSlug: string, snapshot: Row, now = Date.now()) {
  const data = available(snapshot);
  const source = data.sources.find(s => s.report.slug === toolReportSlug);
  if (!source || source.providers.length !== 1) bad();
  const selected = data.cohorts.find(c => c.source.report.slug === toolReportSlug);
  if (!selected || !freshCohort(selected, now)) return [];
  const existing = new Set<string>();
  for (const s of data.sources.filter(s => s.providers.length === 2)) {
    const cohorts = data.cohorts.filter(c => c.source.report.slug === s.report.slug);
    if (cohorts.length === 2) existing.add(evidenceHash(cohorts.map(c => c.key).sort()));
  }
  const results: Array<{ key: string; slug: string; evidence: Row; summary: Row }> = [];
  for (const other of latestCohorts(data.cohorts, now)) {
    if (providerIdentity(other.provider.website) === providerIdentity(selected.provider.website) || !freshCohort(other, now)) continue;
    const cohorts = [selected, other].sort((a, b) => providerIdentity(a.provider.website).localeCompare(providerIdentity(b.provider.website)));
    const key = evidenceHash(cohorts.map(c => c.key).sort()); if (existing.has(key)) continue;
    const providers = cohorts.map(c => structuredClone(c.provider));
    // Names are display labels, never identity. Homonyms are disambiguated only in derived display metadata.
    if (providers[0].name === providers[1].name) for (const p of providers) p.name = `${p.name} (${providerIdentity(p.website)})`;
    const references = cohorts.flatMap((cohort, i) => cohort.lanes.map(item => ({ providerWebsite: providers[i].website,
      storefrontWebsite: providers[i].customers.find(c => storefrontIdentity(c.website) === storefrontIdentity(item.conversation.url))!.website,
      mode: item.conversation.mode, sourceReportSlug: item.source.report.slug, sourceReportHash: item.source.digest,
      sourceConversationId: item.conversation.id, sourceConversationHash: evidenceHash(item.conversation), capturedAt: item.conversation.captured_at })));
    const reused = resolveReuse({ version: 1, protocolSnapshotSha256: snapshot.sha256, providers, references }, providers, snapshot, now);
    const evidence: Row = assembleEvidence({ providers, reusedConversations: reused }, reused, { reused_only: true, automatic_comparison: true }, { now });
    evidence.provenance.comparison_key = key;
    evidence.study.limitations.push('This comparison combines separately evaluated storefront samples. Capture dates, merchant configurations and judge/model provenance may differ; no new test or rejudging was performed to compose it.');
    const counts = validateEvidence(evidence, providers, snapshot, [], reused, now);
    const publishedAt = new Date(now).toISOString();
    evidence.publication = { published_at: publishedAt, validated_by: 'comparison-lab-server', protocol_snapshot_sha256: snapshot.sha256, counts, automatic_publication: true, automatic_comparison: true };
    const slug = `${cohorts.map(c => toolId(c.provider.website).split('-').slice(0, -1).join('-').slice(0, 40)).join('-vs-')}-${key.slice(0, 20)}`;
    results.push({ key, slug, evidence, summary: reportSummary(slug, evidence, publishedAt) }); existing.add(key);
  }
  return results;
}
