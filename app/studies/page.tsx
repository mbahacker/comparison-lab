import Link from 'next/link';
import { listPolicyStudies } from '@/lib/server/policy-studies';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Policy-resolution studies', description: 'Separately versioned Alhena Research Lab studies of policy-compliant resolution, quality and speed in public storefront sessions.', alternates: { canonical: '/studies' } };
export default function Page() {
  const studies = listPolicyStudies();
  return <main id="main" className="shell prose-page"><p className="eyebrow">ALHENA RESEARCH LAB</p><h1>Policy-resolution studies</h1><p className="intro">Policy-compliant resolution, quality and speed measured separately, with public summaries and evidence behind a verified work-email gate.</p><p>This is a separately versioned Alhena Research Lab method. It is not the Gorgias leaderboard or the three-storefront quality pilot.</p><p><Link href="/studies/policy-resolution-v1">Read the versioned methodology</Link> · <Link href="/">Browse current research results</Link></p>{studies.length ? studies.map(study => <article className="method-card" key={study.slug}><h2><Link href={`/studies/${study.slug}`}>{study.title}</Link></h2><p>{study.description}</p><p className="private-note">{study.protocol} · Published {study.publishedAt.slice(0, 10)}</p></article>) : <p className="notice">No policy-resolution study has been approved for publication. There are no public scores yet.</p>}</main>;
}
