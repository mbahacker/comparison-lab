import type { MetadataRoute } from 'next';
import { getToolLibrary } from '@/lib/server/reuse';
import { getResearchLibrary } from '@/lib/server/research-library';
import { listReports } from '@/lib/server/evidence';
import { publicUrl } from '@/lib/server/public-data';
export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap {
  const research = getResearchLibrary();
  const profiles = new Map(getToolLibrary().tools.map(t => [t.id, { url: publicUrl(`/tools/${t.id}`), lastModified: new Date(t.evaluatedAt) }]));
  for (const tool of research.tools) profiles.set(tool.id, { url: publicUrl(`/tools/${tool.id}`), lastModified: new Date(tool.publishedAt) });
  const latest = research.studies[0] ? new Date(research.studies[0].publishedAt) : undefined;
  return [{ url: publicUrl('/'), lastModified: latest }, { url: publicUrl('/methodology') }, { url: publicUrl('/request') }, { url: publicUrl('/privacy') }, { url: publicUrl('/methodology/quality-pilot-v1') }, { url: publicUrl('/studies') }, { url: publicUrl('/studies/policy-resolution-v1') }, ...research.studies.map(s => ({ url: publicUrl(`/studies/${s.slug}`), lastModified: new Date(s.publishedAt) })), ...profiles.values(), ...listReports().map(r => ({ url: publicUrl(`/reports/${r.slug}`), lastModified: new Date(r.publishedAt) }))];
}
