import type { PolicyStudySummary } from './policy-study.ts';
import { latestResults } from './study-findings.ts';
import type { ResearchTool } from './research-library.ts';
import { exclusiveOfferings, integrationOnly, phraseList, scopesFor } from './product-scope.ts';

/** Homepage FAQ, also published as FAQPage structured data and in llms-full.txt. */
/** `a` is the full answer text (structured data, llms-full.txt); `lead` and `points` render the same sentences as a list. */
export type FaqItem = { q: string; a: string; href?: string; linkText?: string; lead?: string; points?: string[] };
const STATIC_FAQ: FaqItem[] = [
  { q: "How is each AI agent tested?", a: "Each tool is tested on five live storefronts where it is deployed: the vendor suggests three and the Lab verifies two more. Every store gets the same scripted shopping and support conversations, plus a guardrail test. Each checkpoint gets an AI judgment and a separate blind audit, and scores come from fixed arithmetic.", href: "/methodology", linkText: "Read the methodology" },
  { q: "Is this a ranking of vendors?", a: "No. Each score describes the storefronts and capture dates in its study. Merchant setups differ, and storefronts that could not be scored are left out rather than counted as zero." },
  { q: "What does the composite score measure?", a: "It combines resolution, answer quality and full-answer speed with published weights: 40/35/25 for shopping and 50/40/10 for support. Use the metric selector to inspect each part. Resolution can credit a documented next step, such as a required handoff; it does not confirm that a refund or case was completed afterwards." },
  { q: "Who runs Alhena Research Lab?", a: "Alhena operates and commissions these studies, and its own agent appears in the results. Separate AI judging and audits do not make the Lab an independent research institution, so the scoring record and limitations accompany every report." },
  { q: "What can I read without signing in?", a: "Study scores, sample sizes, capture dates, summaries and methods are public. Detailed conversations, criterion decisions and evidence downloads require a verified work email." },
  { q: "Is every evaluation fully automatic?", a: "Research verifies five customer deployments before an operator approves testing. AI then runs the conversations, judges responses and audits resolution decisions, and validated results publish automatically. Temporary failures can retry within fixed limits; unsupported widgets, uncertain response attribution and failed validation may need operator review. Incomplete runs stay unpublished." },
  { q: "How do I get my AI agent evaluated?", a: "Name the tool and three stores that use it, then verify your work email. The Lab researches two more storefronts, runs the evaluation after operator review, and publishes results that pass validation.", href: "/request", linkText: "Analyze your tool" },
  { q: "What happened to the earlier quality scores?", a: "They remain in the historical quality pilot archive with their original scores and capture dates. The pilot used a separate scope and protocol, so its scores are not combined with the current results." },
];

/**
 * The first answer quotes each tool's latest published result. The scope answer uses the most recent
 * study whose vendors all have sourced product-scope entries, so it never compares against a blank.
 */
export function faqItems({ tools, studies }: { tools: ResearchTool[]; studies: PolicyStudySummary[] }): FaqItem[] {
  const results = latestResults(tools);
  const latest: FaqItem[] = results.length ? [{ q: 'What are the latest results?', a: results.join(' '), lead: 'Latest published result for each tool:', points: results, href: '/studies', linkText: 'Browse the studies' }] : [];
  const time = (value: string) => Date.parse(value) || 0;
  const scoped = [...studies].filter(st => scopesFor(st.providers)).sort((a, b) => Number(Boolean(a.derivedFrom)) - Number(Boolean(b.derivedFrom)) || time(b.captureEndAt) - time(a.captureEndAt))[0];
  const vendors = scoped ? scopesFor(scoped.providers) : null;
  const scope: FaqItem[] = scoped && vendors ? [{
    q: `Does this compare everything ${vendors.map(v => v.name).join(' and ')} offer?`,
    a: `No. Studies test one form factor, the AI agent in each store's on-site chat widget. ${[
      ...vendors.map(v => {
        const others = vendors.filter(o => o !== v), own = exclusiveOfferings(v, others);
        if (!own.length) return '';
        const viaIntegration = own.some(row => others.some(o => o.cells[row.key]?.status === 'integration'));
        return `${v.name} lists ${phraseList(own)}, which ${others.map(o => o.domain).join(' and ')} ${others.length > 1 ? 'do' : 'does'} not ${viaIntegration ? 'sell as its own products' : 'list'}.`;
      }),
      ...vendors.map(v => { const linked = integrationOnly(v); return linked.length ? `${v.name} connects to ${phraseList(linked)} through integrations instead.` : ''; }),
    ].filter(Boolean).join(' ')} None of these were tested. The study's product scope table lists each vendor's offerings with sources.`,
    href: `/studies/${scoped.slug}#product-scope`, linkText: 'See the product scope table',
  }] : [];
  return [...latest, ...scope, ...STATIC_FAQ];
}
