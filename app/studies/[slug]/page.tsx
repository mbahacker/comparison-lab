import { notFound } from 'next/navigation';
import { PolicyStudy } from '@/components/lab/policy-study';
import { getPolicyStudy } from '@/lib/server/policy-studies';
import { policyStudyStructuredData } from '@/lib/server/policy-study-public';
import { jsonLd } from '@/lib/server/public-data';
import { ApiError } from '@/lib/server/model';
export const dynamic = 'force-dynamic';
function summary(slug: string) {
  try { return getPolicyStudy(slug).summary; } catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const study = summary((await params).slug);
  return { title: study.title, description: study.description, alternates: { canonical: `/studies/${study.slug}` }, openGraph: { title: study.title, description: study.description, type: 'article' as const } };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const study = summary((await params).slug);
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(policyStudyStructuredData(study)) }} /><PolicyStudy study={study} /></>;
}
