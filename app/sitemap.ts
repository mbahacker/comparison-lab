import type { MetadataRoute } from 'next';
import { getToolLibrary } from '@/lib/server/reuse';
import { listReports } from '@/lib/server/evidence';
import { publicUrl } from '@/lib/server/public-data';
import { listPolicyStudies } from '@/lib/server/policy-studies';
export const dynamic='force-dynamic';
export default function sitemap():MetadataRoute.Sitemap{
 const library=getToolLibrary();
 return [{url:publicUrl('/')},{url:publicUrl('/methodology')},{url:publicUrl('/studies')},{url:publicUrl('/studies/policy-resolution-v1')},...listPolicyStudies().map(s=>({url:publicUrl(`/studies/${s.slug}`),lastModified:new Date(s.publishedAt)})),...library.tools.map(t=>({url:publicUrl(`/tools/${t.id}`),lastModified:new Date(t.evaluatedAt)})),...listReports().map(r=>({url:publicUrl(`/reports/${r.slug}`),lastModified:new Date(r.publishedAt)}))];
}
