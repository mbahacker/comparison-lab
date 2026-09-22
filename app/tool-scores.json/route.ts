import { getResearchLibrary } from '@/lib/server/research-library';
import { publicUrl, publisher } from '@/lib/server/public-data';
export const dynamic='force-dynamic';
export function GET() {
  const library = getResearchLibrary();
  return Response.json({
    schema_version: 'alhena-research-lab/tool-summaries-v2', generated_at: library.generatedAt, publisher: publisher(),
    scope: 'Latest compatible approved policy-resolution study per tool, selected by capture end date then publication date. Policy-compliant resolution, answer quality, full-answer speed and composite are separate measures. Public-session scope does not establish completed backend actions or a universal vendor ranking.',
    methodology_url: publicUrl('/studies/policy-resolution-v1'),
    quality_pilot_archive_url: publicUrl('/quality-pilot-scores.json'),
    evidence_access: 'Public summaries only. Detailed evidence requires a verified work email.',
    tools: library.tools.map(tool => ({ ...tool, url: publicUrl(`/tools/${tool.id}`), source_study_url: publicUrl(`/studies/${tool.studySlug}`) })),
  }, { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff' } });
}
