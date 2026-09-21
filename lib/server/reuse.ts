import { getReport, listReports, protocol, SEED_SLUG } from './evidence.ts';
import { ApiError, type Provider, type Row } from './model.ts';
import { evidenceHash, providerIdentity, storefrontIdentity, laneIdentity, validateReusableConversation, reuseLimitations, reusableAt, REUSE_WINDOW_MS } from '../../worker/reuse.mjs';

// The imported report contains vendor names but no provider website field. This explicit,
// immutable mapping applies only to this exact public evidence bundle, never arbitrary names.
const SEED_HASH = '41da1fccf0baf9283c88f5a1f585ac2babfd484fb0f9fe58e66953295bf94085';
const SEED_WEBSITES: Record<string, string> = { Alhena: 'https://alhena.ai/', Gorgias: 'https://www.gorgias.com/' };
type Source = { report: Row; evidence: Row; digest: string; providers: Provider[]; historical: boolean };
type ReusePlan = { version: number; protocolSnapshotSha256: string; providers: Provider[]; references: Row[]; reusedConversations: number; newConversations: number; reusedStores: number; newStores: number; sources: Row[]; exactReport?: { slug: string; title: string }; existingReport?: { slug: string; title: string }; previousReport?: { slug: string; title: string } };
function bad(): never { throw new ApiError(422, 'The selected published evidence is no longer compatible or its integrity changed.'); }
const canonicalProviders = (providers: Provider[]) => providers.map(p => `${providerIdentity(p.website)}\0${p.customers.map(c => storefrontIdentity(c.website)).sort().join('\0')}`).sort();

function readSource(slug: string, snapshot: Row): Source {
  const { report, evidence } = getReport(slug); const digest = evidenceHash(evidence);
  const historical = slug === SEED_SLUG && digest === SEED_HASH;
  if (slug === SEED_SLUG && !historical) bad();
  if (evidence.study?.source_commit !== snapshot.rubricCommit || evidence.study?.quality_only !== true || (!historical && evidence.study?.protocol_id !== snapshot.id) || evidence.validation?.passed !== true || !Array.isArray(evidence.study?.limitations) || !evidence.study.limitations.length || evidence.live_conversations?.length !== 12) bad();
  if (!historical && evidenceHash(evidence.rubric?.criteria) !== evidenceHash(snapshot.criteria)) bad();
  const audit = historical ? evidence.audit?.summary : evidence.audit;
  if (audit?.trusted !== true || audit.agreement_pct < snapshot.minimumAuditAgreement) bad();
  let providers: Provider[];
  if (historical) {
    providers = Object.entries(SEED_WEBSITES).map(([name, website]) => ({ name, website, customers: [...new Map<string, { name: string; website: string }>(evidence.live_conversations.filter((c: Row) => c.vendor === name).map((c: Row) => [storefrontIdentity(c.url), { name: c.store, website: c.url }])).values()] }));
  } else {
    providers = evidence.study.providers;
    if (!Array.isArray(providers) || providers.length !== 2 || providers.some(p => !p.name || !p.website || p.customers?.length !== 3)) bad();
  }
  if (new Set(providers.map(p => providerIdentity(p.website))).size !== 2) bad();
  for (const p of providers) if (p.customers.length !== 3 || new Set(p.customers.map(c => storefrontIdentity(c.website))).size !== 3) bad();
  return { report, evidence, digest, providers, historical };
}
function sourceProvider(source: Source, c: Row) {
  const p = source.providers.find(p => p.name === c.vendor && p.customers.some(s => s.name === c.store && storefrontIdentity(s.website) === storefrontIdentity(c.url)));
  if (!p) bad(); return p;
}
function material(c: Row) { const { id, vendor, store, url, reuse, ...rest } = c; return rest; }
function origin(source: Source, c: Row, snapshot: Row, visited = new Set<string>()): { source: Source; conversation: Row; provider: Provider } {
  const key = `${source.report.slug}\0${c.id}`; if (visited.has(key) || visited.size > 10) bad(); visited.add(key);
  const provider = sourceProvider(source, c);
  if (!c.reuse) { validateReusableConversation(c, snapshot, source.historical); return { source, conversation: c, provider }; }
  const ref = c.reuse;
  const parent = readSource(ref.sourceReportSlug, snapshot);
  if (parent.digest !== ref.sourceReportHash) bad();
  const original = parent.evidence.live_conversations.find((item: Row) => item.id === ref.sourceConversationId);
  if (!original || evidenceHash(original) !== ref.sourceConversationHash || evidenceHash(material(original)) !== evidenceHash(material(c))) bad();
  const found = origin(parent, original, snapshot, visited);
  if (providerIdentity(provider.website) !== providerIdentity(found.provider.website) || storefrontIdentity(c.url) !== storefrontIdentity(found.conversation.url)) bad();
  for (const limitation of reuseLimitations([c])) if (!source.evidence.study.limitations.includes(limitation)) bad();
  return found;
}
function available(snapshot: Row) {
  const sources: Source[] = []; const lanes: Array<{ source: Source; conversation: Row; provider: Provider }> = [];
  for (const summary of listReports()) {
    try {
      const source = readSource(summary.slug, snapshot); let checked = 0, agreed = 0;
      const found = source.evidence.live_conversations.map((c: Row) => origin(source, c, snapshot));
      const identities = new Set<string>();
      for (const item of found) {
        const result = validateReusableConversation(item.conversation, snapshot, item.source.historical); checked += result.checked; agreed += result.agreed;
        identities.add(laneIdentity(item.provider.website, item.conversation.url, item.conversation.mode));
      }
      const reported = source.historical ? source.evidence.audit.summary : source.evidence.audit;
      if (identities.size !== 12 || checked !== 156 || reported.verdicts !== checked || reported.agreement_pct !== Math.round(agreed / checked * 1000) / 10 || (!source.historical && (reported.agreed !== agreed || reported.corrected !== checked - agreed))) continue;
      sources.push(source); lanes.push(...found);
    } catch { /* Unreadable, changed or incompatible published evidence is not offered for reuse. */ }
  }
  lanes.sort((a, b) => b.conversation.captured_at.localeCompare(a.conversation.captured_at) || b.source.report.publishedAt.localeCompare(a.source.report.publishedAt) || a.source.report.slug.localeCompare(b.source.report.slug) || a.conversation.id.localeCompare(b.conversation.id));
  sources.sort((a, b) => b.report.publishedAt.localeCompare(a.report.publishedAt) || a.report.slug.localeCompare(b.report.slug));
  return { sources, lanes };
}
export function getProviderCatalog(query = '', now = Date.now()) {
  const { lanes } = available(protocol()); const map = new Map<string, Row>();
  for (const { provider, conversation: c, source } of lanes) {
    const key = providerIdentity(provider.website);
    const entry = map.get(key) || { name: provider.name, website: provider.website, customers: [], latestAnalysisAt: c.captured_at };
    let customer = entry.customers.find((item: Row) => storefrontIdentity(item.website) === storefrontIdentity(c.url));
    if (!customer) { customer = { name: c.store, website: c.url, date: c.date, capturedAt: c.captured_at, shopping: null, support: null, sourceReportSlug: source.report.slug, analyses: {} }; entry.customers.push(customer); }
    if (customer[c.mode] === null) { customer[c.mode] = c.score; customer.analyses[c.mode] = { date: c.date, capturedAt: c.captured_at, score: c.score, sourceReportSlug: source.report.slug, reusable: reusableAt(c.captured_at, now), expiresAt: new Date(Date.parse(c.captured_at) + REUSE_WINDOW_MS).toISOString() }; }
    map.set(key, entry);
  }
  const q = query.trim().toLowerCase();
  return { providers: [...map.values()].filter(p => !q || p.name.toLowerCase().includes(q) || p.website.toLowerCase().includes(q)).map((p): Row => ({ ...p, customers: p.customers.filter((c: Row) => c.shopping !== null && c.support !== null).map((c: Row) => ({ ...c, reusable: c.analyses.shopping.reusable && c.analyses.support.reusable, expiresAt: [c.analyses.shopping.expiresAt, c.analyses.support.expiresAt].sort()[0] })).sort((a: Row, b: Row) => b.capturedAt.localeCompare(a.capturedAt) || a.website.localeCompare(b.website)) })).filter(p => p.customers.length).sort((a, b) => a.name.localeCompare(b.name) || a.website.localeCompare(b.website)) };
}
export function planReuse(providers: Provider[], snapshot: Row, reuseExisting = true, now = Date.now()): ReusePlan {
  const { sources, lanes } = available(snapshot); const references: Row[] = [];
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
  return { version: 1, protocolSnapshotSha256: snapshot.sha256, providers: structuredClone(providers), references,
    reusedConversations: references.length, newConversations: 12 - references.length,
    reusedStores: fullyReusedStores, newStores: 6 - fullyReusedStores,
    sources: [...new Map(references.map(ref => [ref.sourceReportSlug, { slug: ref.sourceReportSlug, capturedAt: ref.capturedAt }])).values()],
    ...(exactReport ? { exactReport, existingReport: exactReport } : matching.length ? { previousReport: { slug: matching[0].report.slug, title: matching[0].report.title } } : {}) };
}
export function resolveReuse(plan: Row | null | undefined, providers: Provider[], snapshot: Row, now = Date.now()) {
  if (!plan) return [];
  if (plan.version !== 1 || plan.protocolSnapshotSha256 !== snapshot.sha256 || evidenceHash(plan.providers) !== evidenceHash(providers) || !Array.isArray(plan.references)) bad();
  const seen = new Set<string>();
  return plan.references.map((ref: Row) => {
    const provider = providers.find(p => providerIdentity(p.website) === providerIdentity(ref.providerWebsite));
    const customer = provider?.customers.find(c => storefrontIdentity(c.website) === storefrontIdentity(ref.storefrontWebsite));
    if (!provider || !customer || !['shopping', 'support'].includes(ref.mode)) bad();
    const key = laneIdentity(provider.website, customer.website, ref.mode); if (seen.has(key)) bad(); seen.add(key);
    const source = readSource(ref.sourceReportSlug, snapshot);
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
