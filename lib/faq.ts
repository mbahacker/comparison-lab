import type { PolicyStudySummary } from './policy-study.ts';
import { studyFindings } from './study-findings.ts';

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

/** The first answer is composed from the latest study, so it always quotes current published scores. */
export function faqItems(study?: PolicyStudySummary): FaqItem[] {
  if (!study?.providers.length) return STATIC_FAQ;
  const points = studyFindings(study).filter(f => !f.startsWith('Overall'));
  return [{ q: `What did the latest study find?`, a: `${study.title}. ${points.join(' ')}`, lead: `${study.title}:`, points, href: `/studies/${study.slug}`, linkText: 'Read the study' }, ...STATIC_FAQ];
}

