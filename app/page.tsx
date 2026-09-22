import { ReportLibrary } from '@/components/lab/report-library';
import { getToolLibrary } from '@/lib/server/reuse';
import { getResearchLibrary } from '@/lib/server/research-library';
import { listReports } from '@/lib/server/evidence';
import { jsonLd, publicUrl, publisher } from '@/lib/server/public-data';
import type { ToolSummary, ReportSummary } from '@/lib/client';
export const metadata = { alternates: { canonical: '/' } };
export default function Home() {
  const historical = getToolLibrary();
  const research = getResearchLibrary();
  const data = {
    '@context': 'https://schema.org', '@type': 'DataCatalog',
    name: 'Alhena Research Lab current tool evaluations', url: publicUrl('/'),
    description: 'Latest published policy-resolution studies. Shopping and support composites combine policy-compliant resolution, quality and speed. Original capture dates and detailed evidence accompany each study.',
    publisher: publisher(),
    dataset: research.tools.map(t => ({ '@type': 'Dataset', name: `${t.name} policy-resolution evaluation`, url: publicUrl(`/tools/${t.id}`), measurementTechnique: t.protocol, temporalCoverage: `${t.captureStartAt}/${t.captureEndAt}`, citation: publicUrl(`/studies/${t.studySlug}`) })),
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} /><ReportLibrary tools={historical.tools as ToolSummary[]} reports={listReports() as ReportSummary[]} studies={research.studies} latestTools={research.tools} /></>;
}
