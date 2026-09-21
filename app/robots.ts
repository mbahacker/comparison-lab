import type { MetadataRoute } from 'next';
import { publicUrl } from '@/lib/server/public-data';
export const dynamic='force-dynamic';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/api/','/review','/requests/','/request']},sitemap:publicUrl('/sitemap.xml')};}
