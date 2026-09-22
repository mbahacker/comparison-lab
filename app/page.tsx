import { ReportLibrary } from '@/components/lab/report-library';
import { HomeCallToAction, HomeFaq, HomeHero, HomeMeasures, HomeProcess } from '@/components/lab/home-sections';
import { faqItems } from '@/lib/faq';
import { getToolLibrary } from '@/lib/server/reuse';
import { getResearchLibrary } from '@/lib/server/research-library';
import { listReports } from '@/lib/server/evidence';
import { jsonLd, publicUrl, publisher } from '@/lib/server/public-data';
import type { ToolSummary, ReportSummary } from '@/lib/client';
export const metadata = { alternates: { canonical: '/', types: { 'application/json': '/tool-scores.json', 'text/plain': '/llms.txt' } } };
export default function Home() {
  const historical = getToolLibrary();
  const research = getResearchLibrary();
  const faq = faqItems(research.studies[0]);
  const catalog = {
    '@type': 'DataCatalog', '@id': publicUrl('/#catalog'),
    name: 'Alhena Research Lab current tool evaluations', url: publicUrl('/'),
    description: 'Latest published policy-resolution studies. Shopping and support composites combine policy-compliant resolution, quality and speed. Original capture dates and detailed evidence accompany each study.',
    publisher: publisher(),
    dataset: research.tools.map(t => ({ '@type': 'Dataset', name: `${t.name} policy-resolution evaluation`, url: publicUrl(`/tools/${t.id}`), measurementTechnique: t.protocol, temporalCoverage: `${t.captureStartAt}/${t.captureEndAt}`, citation: publicUrl(`/studies/${t.studySlug}`) })),
  };
  const data = { '@context': 'https://schema.org', '@graph': [catalog, {
    '@type': 'FAQPage', '@id': publicUrl('/#faq'),
    mainEntity: faq.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a, ...(item.href ? { url: publicUrl(item.href) } : {}) } })),
  }] };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
    <main id="main" className="home">
      <HomeHero tools={research.tools} studies={research.studies} />
      <HomeMeasures />
      <HomeProcess study={research.studies[0]} />
      <ReportLibrary tools={historical.tools as ToolSummary[]} reports={listReports() as ReportSummary[]} studies={research.studies} latestTools={research.tools} />
      <HomeCallToAction />
      <HomeFaq items={faq} />
    </main>
  </>;
}
