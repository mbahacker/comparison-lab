import type { MetadataRoute } from 'next';
import { publicUrl } from '@/lib/server/public-data';
export const dynamic='force-dynamic';
// Every crawler, including AI search and assistant agents, may read public pages. Private request, review and API routes stay excluded.
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/review','/requests/']},sitemap:publicUrl('/sitemap.xml')};}
