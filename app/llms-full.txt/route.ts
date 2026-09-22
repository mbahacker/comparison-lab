import questionPools from '@/rubric/full-questions.json';
import { demoUrl } from '@/components/lab/demo-link';
import { captureRange, date, score } from '@/lib/client';
import { faqItems } from '@/lib/faq';
import type { PolicyLane, PolicyStudySummary, StudyMetric } from '@/lib/policy-study';
import { COMPOSITE_WEIGHTS, fullAnswerSeconds } from '@/lib/score-parts';
import { studyFindings, toolSummarySentence } from '@/lib/study-findings';
import { getResearchLibrary } from '@/lib/server/research-library';
import { CAPABILITIES, PRODUCT_SCOPE_CHECKED_AT, notComparedOfferings, scopesFor, type VendorScope } from '@/lib/product-scope';
import { publicUrl } from '@/lib/server/public-data';
export const dynamic = 'force-dynamic';

/** Everything an answer engine needs in one fetch: method, every study's scores and limits, and the FAQ. */
const label = (s: string) => s.replace(/[\r\n\[\]<>|]/g, ' ').trim();
const LANES: { key: PolicyLane; name: string }[] = [{ key: 'shopping', name: 'Shopping' }, { key: 'support', name: 'Support' }];
const metric = (m: StudyMetric) => m.value === null ? 'not eligible' : score(m.value);
const pct = (n: number) => `${Math.round(n * 100)}%`;
type Pool = { label: string; guardrail?: boolean };

function scopeSection(study: PolicyStudySummary) {
  const vendors = scopesFor(study.providers);
  const intro = 'Scope: this study tests one form factor, the AI agent in each store\'s on-site chat widget. Other products the vendors sell were not tested.';
  if (!vendors) return intro;
  const cell = (v: VendorScope, key: string) => { const c = v.cells[key]; if (!c || c.status === 'not-listed') return `not listed on ${v.domain}`; return `${c.status === 'integration' ? 'via integrations' : 'yes'}${c.product ? ` (${label(c.product)})` : ''}`; };
  const rows = CAPABILITIES.map(row => `| ${row.label} | ${vendors.map(v => cell(v, row.key)).join(' | ')} | ${row.tested === true ? 'tested' : row.tested === 'partly' ? 'only inside chat conversations' : 'not tested'} |`).join('\n');
  const sources = [...new Set(vendors.flatMap(v => Object.values(v.cells).map(c => c.source).filter(Boolean)))];
  const offers = vendors.some(v => v.id === 'alhena') ? `\n\nAlhena products this study doesn't compare:\n${notComparedOfferings().map(o => `- ${o.title}: ${o.description} (${o.href})`).join('\n')}` : '';
  return `${intro}\n\nProduct scope beyond the chat widget, from each vendor's public website as of ${PRODUCT_SCOPE_CHECKED_AT} (reference information, not study results):\n\n| Capability | ${vendors.map(v => label(v.name)).join(' | ')} | In this study |\n|---|${vendors.map(() => '---').join('|')}|---|\n${rows}\n\nSources: ${sources.join(', ')}${offers}`;
}

function studySection(study: PolicyStudySummary) {
  const p = study.providers;
  const head = `| Measure | ${LANES.flatMap(l => p.map(x => `${l.name}: ${label(x.name)}`)).join(' | ')} |\n|---|${LANES.flatMap(() => p.map(() => '---:')).join('|')}|`;
  const row = (name: string, cell: (x: PolicyStudySummary['providers'][number], lane: PolicyLane) => string) => `| ${name} | ${LANES.flatMap(l => p.map(x => cell(x, l.key))).join(' | ')} |`;
  const table = [head,
    row('Composite (out of 100)', (x, l) => metric(x[l].composite)),
    row('Policy-compliant resolution', (x, l) => metric(x[l].policyResolution)),
    row('Answer quality', (x, l) => metric(x[l].quality)),
    row('Full-answer speed score', (x, l) => metric(x[l].speed)),
    row('Average time to a full answer', (x, l) => { const s = fullAnswerSeconds(x[l]); return s === null ? 'not published' : `${s.toFixed(1)} s`; }),
    row('Storefronts included', (x, l) => `${x[l].coverage.includedStores} of ${x.registeredStores}`),
    row('Conversations included', (x, l) => `${x[l].coverage.includedContexts} of ${x[l].coverage.includedContexts + x[l].coverage.excludedContexts}`),
  ].join('\n');
  return `### ${label(study.title)}

- URL: ${publicUrl(`/studies/${study.slug}`)}
- Published: ${date(study.publishedAt)}. Captured: ${captureRange(study.captureStartAt, study.captureEndAt)} (${study.captureStartAt} to ${study.captureEndAt}).
- Method: ${study.protocol}, frozen method SHA-256 ${study.method.sha256}. Commissioned by ${study.commissionedBy}.
- Sample: ${study.sample.capturedCoreContexts} conversations captured, ${study.sample.judgedCoreContexts} judged, ${study.sample.guardrailContexts} guardrail tests, ${study.sample.auditedPcrDecisions} checkpoints judged and audited.
- Overall composite: ${p.map(x => `${label(x.name)} ${metric(x.overallComposite)}`).join(', ')}.

${label(study.description)}

Key findings:
${studyFindings(study).map(f => `- ${f}`).join('\n')}

${table}

${scopeSection(study)}

Limitations:
${study.limitations.map(l => `- ${l}`).join('\n')}

Audit: ${study.audit.description}
${study.audit.limitations.map(l => `- ${l}`).join('\n')}

Changes from the source study:
${study.method.differences.map(d => `- ${d}`).join('\n')}`;
}

export async function GET() {
  const research = getResearchLibrary();
  const themes = LANES.map(l => `   - ${l.name}: ${(questionPools[l.key] as Pool[]).filter(x => !x.guardrail).map(x => x.label).join('; ')}.`).join('\n');
  const text = `# Alhena Research Lab: full reference

> Published evaluations of ecommerce AI shopping and support agents on live storefronts, operated by Alhena. Every tool gets the same customer conversations. Scores cover policy-compliant resolution, answer quality and full-answer speed, with conversation evidence behind each score.

Source: ${publicUrl('/')}. Index: ${publicUrl('/llms.txt')}. When citing a score, cite the study URL and its capture dates. Scores describe the storefronts in each study, not every deployment or an overall vendor ranking. Alhena operates the Lab, and its own agent appears in the results.

## What every score is made of

Shopping and support are scored separately, each out of 100.

- Policy-compliant resolution: did the customer get the correct answer, or the next step the merchant's published policy requires, such as a handoff to a person? It does not establish completed refunds, account actions or human-resolved orders.
- Answer quality: the 26 published quality criteria (16 for shopping, 10 for support), covering direct, specific answers grounded in the store's catalog and policies, useful product recommendations and clear next steps.
- Full-answer speed: time until the complete answer appears. 3 seconds scores 100; 22 seconds or more scores 0.
- Composite weights: shopping ${pct(COMPOSITE_WEIGHTS.shopping.policyResolution)} resolution, ${pct(COMPOSITE_WEIGHTS.shopping.quality)} quality, ${pct(COMPOSITE_WEIGHTS.shopping.speed)} speed; support ${pct(COMPOSITE_WEIGHTS.support.policyResolution)} resolution, ${pct(COMPOSITE_WEIGHTS.support.quality)} quality, ${pct(COMPOSITE_WEIGHTS.support.speed)} speed. The overall composite is the mean of the two lane composites when both are eligible.

## How an evaluation works

1. Pick live storefronts: five stores where the tool is deployed. The vendor suggests three; the Lab finds and verifies two more from published customer stories.
2. Talk to the agent like a customer: every store gets the same scripted conversations, five shopping and five support, plus a guardrail test that tries to pull the agent off course. Conversation themes:
${themes}
   Question pools come from Gorgias's public AI agent benchmark (https://github.com/gorgias/ai-agent-benchmark).
3. Judge every checkpoint twice, blind: each checkpoint gets an AI judgment and a separate blind audit, and only counts when both agree on the evidence. Scores come from fixed arithmetic.
4. Publish the evidence: scores, capture dates, coverage and limits are public. Detailed conversations and scoring decisions require a verified work email.

Full methodology: ${publicUrl('/methodology')} and ${publicUrl('/studies/policy-resolution-v1')}.

## Published studies

${research.studies.length ? research.studies.map(studySection).join('\n\n') : 'No policy-resolution study has been published yet.'}

## Current tool profiles

${research.tools.length ? research.tools.map(t => `- [${label(t.name)}](${publicUrl(`/tools/${t.id}`)}): ${toolSummarySentence(t)}`).join('\n') : 'No current evaluations have been published.'}

## Frequently asked questions

${faqItems(research.studies[0]).map(item => `### ${item.q}\n\n${item.a}${item.href ? ` (${publicUrl(item.href)})` : ''}`).join('\n\n')}

## Machine-readable data

- Current tool scores: ${publicUrl('/tool-scores.json')}
- Published study summaries: ${publicUrl('/study-scores.json')}
- Historical quality-pilot scores: ${publicUrl('/quality-pilot-scores.json')}
- Sitemap: ${publicUrl('/sitemap.xml')}

## Next steps

- Get an AI agent evaluated: ${publicUrl('/request')}
- See Alhena's shopping and support agents on your store: ${demoUrl('llms_full')}
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}
