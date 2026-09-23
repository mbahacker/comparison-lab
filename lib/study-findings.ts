import type { PolicyLane, PolicyLaneResult, PolicyStudySummary, StudyMetric } from './policy-study.ts';
import type { ResearchTool } from './research-library.ts';
import { captureRange, score } from './client.ts';
import { fullAnswerSeconds } from './score-parts.ts';

/**
 * Plain-language sentences about a published study, composed from its public summary at render time.
 * Pages, structured data and llms.txt all quote these, so every stated score tracks the published data.
 * Providers keep their study order; nothing here ranks vendors.
 */
type Provider = PolicyStudySummary['providers'][number];
const LANES: PolicyLane[] = ['shopping', 'support'];
const value = (metric: StudyMetric) => metric.value === null ? 'not eligible' : score(metric.value);
const seconds = (lane: PolicyLaneResult) => { const s = fullAnswerSeconds(lane); return s === null ? null : `${s.toFixed(1)} s`; };
const list = (providers: Provider[], pick: (p: Provider) => string) => providers.map(p => `${p.name} ${pick(p)}`).join(', ');

/** Vendor names in alphabetical order, so "A vs. B" reads the same wherever a pairing appears. */
function vendorNames(study: PolicyStudySummary) {
  return study.providers.map(p => p.name).sort((a, b) => a.localeCompare(b));
}
const joinNames = (names: string[]) => names.length < 3 ? names.join(' vs. ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** Reader-facing headline. The published record title stays unchanged for citation. */
export function studyHeadline(study: PolicyStudySummary) {
  const names = vendorNames(study);
  if (names.length === 1) return `How ${names[0]}'s AI agent handles real shoppers`;
  return `${joinNames(names)}: which AI agent gets shoppers the right answer?`;
}
/** Short name for running text, e.g. "Alhena vs. Sierra study". */
export function studyShortName(study: PolicyStudySummary) {
  return `${joinNames(vendorNames(study))} study`;
}
/** One-sentence description of what was done, for the study page intro. */
export function studyLede(study: PolicyStudySummary) {
  const stores = studyDeployments(study);
  return study.providers.length === 1
    ? `We ran the same scripted shopping and support conversations with ${study.providers[0].name}'s AI agent on ${stores} live storefronts, then scored every answer for resolution, quality and speed.`
    : `We ran the same scripted shopping and support conversations with each AI agent on its own live storefronts, ${stores} in total, then scored every answer for resolution, quality and speed.`;
}

export function studyDeployments(study: PolicyStudySummary) {
  return study.providers.reduce((sum, p) => sum + p.registeredStores, 0);
}

export function studyScope(study: PolicyStudySummary) {
  return `Scores cover the AI agent in each store's on-site chat widget across the ${studyDeployments(study)} storefront deployments captured ${captureRange(study.captureStartAt, study.captureEndAt)}. They do not cover other products either vendor sells, every deployment, or an overall vendor ranking. Alhena operates Alhena Research Lab.`;
}

export function studyFindings(study: PolicyStudySummary): string[] {
  const p = study.providers;
  if (!p.length) return [];
  const findings = [
    `Shopping composite, out of 100: ${list(p, x => value(x.shopping.composite))}.`,
    `Support composite, out of 100: ${list(p, x => value(x.support.composite))}.`,
    `Overall composite, the mean of both lanes: ${list(p, x => value(x.overallComposite))}.`,
  ];
  if (p.every(x => LANES.every(lane => seconds(x[lane]) !== null))) {
    findings.push(`Average time to a full answer: shopping ${list(p, x => seconds(x.shopping)!)}; support ${list(p, x => seconds(x.support)!)}.`);
  }
  const partial = p.filter(x => LANES.some(lane => x[lane].coverage.includedStores < x.registeredStores));
  if (partial.length) {
    findings.push(`${partial.map(x => `${x.name}'s results include ${x.shopping.coverage.includedStores} of ${x.registeredStores} storefronts for shopping and ${x.support.coverage.includedStores} of ${x.registeredStores} for support`).join('; ')}. Storefronts that could not be scored are left out, not counted as zero.`);
  }
  findings.push(studyScope(study));
  return findings;
}

/** Scope caveat for summaries that span several studies. */
export const LIBRARY_SCOPE = "Scores cover the AI agent in each store's on-site chat widget on the storefronts in each tool's study, not other products the vendors sell, every deployment, or an overall vendor ranking. Alhena operates Alhena Research Lab.";

/**
 * The study to illustrate the method with: the most recent original (not derived) study with the most
 * providers. Derived comparisons recombine earlier captures, so they never stand in for "the latest study".
 */
export function featuredStudy(studies: PolicyStudySummary[]): PolicyStudySummary | undefined {
  const time = (s: string) => Date.parse(s) || 0;
  return studies.filter(s => !s.derivedFrom && s.providers.length)
    .sort((a, b) => b.providers.length - a.providers.length || time(b.captureEndAt) - time(a.captureEndAt) || time(b.publishedAt) - time(a.publishedAt))[0];
}

/** One sentence per tool from its latest published study, plus the scope caveat. */
export function latestResults(tools: ResearchTool[]): string[] {
  return tools.length ? [...tools.map(toolSummarySentence), LIBRARY_SCOPE] : [];
}

/** One-line description that leads with the scores, for meta and social previews. */
export function studyMetaDescription(study: PolicyStudySummary) {
  const scores = study.providers.map(x => `${x.name} ${value(x.shopping.composite)}/${value(x.support.composite)}`).join(' vs ');
  return `${scores}: shopping/support composite scores out of 100 across ${studyDeployments(study)} storefront deployments, captured ${captureRange(study.captureStartAt, study.captureEndAt)}.`;
}

/** Answer-first sentence for a tool profile. */
export function toolSummarySentence(tool: ResearchTool) {
  const shop = seconds(tool.shopping), support = seconds(tool.support);
  const timing = shop && support ? ` Full answers arrived in ${shop} for shopping and ${support} for support on average.` : '';
  return `In its latest study (captured ${captureRange(tool.captureStartAt, tool.captureEndAt)}), ${tool.name} scored ${value(tool.shopping.composite)} for shopping and ${value(tool.support.composite)} for support, as composite scores out of 100.${timing}`;
}
