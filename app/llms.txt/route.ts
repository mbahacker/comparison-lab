import { getToolLibrary } from '@/lib/server/reuse';
import { getResearchLibrary } from '@/lib/server/research-library';
import { listReports } from '@/lib/server/evidence';
import { publicUrl } from '@/lib/server/public-data';
export const dynamic = 'force-dynamic';
const label = (s: string) => s.replace(/[\r\n\[\]<>]/g, ' ').trim();
export async function GET() {
  const research = getResearchLibrary();
  const historical = getToolLibrary();
  const text = `# Alhena Research Lab

> Alhena-operated, commissioned evaluations of ecommerce AI tools on selected customer storefronts.

## Current scoring: policy-resolution-v1

The homepage and current tool profiles use the newest published compatible policy-resolution study for each provider, selected by capture date. Shopping and support COMPOSITE scores combine policy-compliant resolution, answer quality and full-answer speed. Quality is a distinct component and must not be used as a label for a composite. Shopping weights: resolution 40%, quality 35%, speed 25%. Support weights: resolution 50%, quality 40%, speed 10%. Overall is the equal mean of the unrounded lane composites when both are eligible.

Resolution measures correct answers or verified merchant-prescribed next steps in public sessions. It does not establish completed refunds, account actions or human-resolved cases. This is Alhena Research Lab's method, not Gorgias's automation ranking or independent third-party certification. Registered and included samples, exclusions, capture dates and limitations must accompany comparisons. Profiles may draw from different studies; use each linked study's sample and dates.

## Public sources

- [Current results and historical archive](${publicUrl('/')})
- [Scoring methodology](${publicUrl('/methodology')})
- [Complete current method](${publicUrl('/studies/policy-resolution-v1')})
- [Current machine-readable tool scores, explicit metrics, v2](${publicUrl('/tool-scores.json')})
- [All approved study summaries](${publicUrl('/study-scores.json')})
- [Study catalog](${publicUrl('/studies')})
- [Sitemap](${publicUrl('/sitemap.xml')})

## Current tool profiles

${research.tools.length ? research.tools.map(t => `- [${label(t.name)}](${publicUrl(`/tools/${t.id}`)}) — ${t.protocol}; captures ${t.captureStartAt} to ${t.captureEndAt}; source [${label(t.studyTitle)}](${publicUrl(`/studies/${t.studySlug}`)})`).join('\n') : 'No current policy-resolution evaluations have been published.'}

## Published studies

${research.studies.map(s => `- [${label(s.title)}](${publicUrl(`/studies/${s.slug}`)}) — published ${s.publishedAt}; original captures ${s.captureStartAt} to ${s.captureEndAt}`).join('\n')}

## Historical quality pilot and submissions

quality-pilot-v1 measures quality only using the 26 pinned criteria: three storefronts, six conversations and two fixed question themes per tool. Its original scores are preserved in the historical archive and are not the current study scores. New Analyze your tool submissions use policy-resolution-v1: the user supplies three customer storefronts, research verifies two more, and operator approval authorizes the five-storefront evaluation and automatic publication after validation. Existing pilot jobs retain their frozen scope. Compatible pilot evidence can be reused within 30 days of its original capture; publication does not refresh that clock.

- [Historical quality archive](${publicUrl('/#archive')})
- [Original quality-pilot method and criteria](${publicUrl('/methodology/quality-pilot-v1')})
- [Historical quality-pilot scores, v1](${publicUrl('/quality-pilot-scores.json')})

${listReports().filter(r => r.vendors.length === 2).map(r => `- [${label(r.title)} — quality pilot](${publicUrl(`/reports/${r.slug}`)})`).join('\n')}

Historical quality-only profiles without a published current study:
${historical.tools.filter(t => !research.tools.some(current => current.id === t.id)).map(t => `- [${label(t.name)} — quality pilot only](${publicUrl(`/tools/${t.id}`)})`).join('\n') || 'None.'}

## Evidence access

Public summaries, scores and methodology are open. Detailed conversations, criterion decisions, source records and downloadable evidence require a verified work email. No requester identity is included in public datasets. Always cite the original capture dates and sample limitations. Republished or reused evidence is not a fresh evaluation.
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' } });
}
