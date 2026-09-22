import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportExplorer } from "@/components/lab/report-explorer";
import { config } from "@/lib/server/config";
import { getReport } from "@/lib/server/evidence";
import { ApiError } from "@/lib/server/model";
import { jsonLd, reportStructuredData } from "@/lib/server/public-data";
import type { ReportSummary } from "@/lib/client";
import Link from "next/link";
import { getToolLibrary, toolId } from "@/lib/server/reuse";
import { getResearchLibrary } from "@/lib/server/research-library";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let data: ReturnType<typeof getReport>;
  try {
    data = getReport(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const { report } = data;
  const metadataBase = new URL(config().appUrl);
  const url = new URL(`/reports/${encodeURIComponent(slug)}`, metadataBase)
    .href;
  const description = `${report.description} ${report.storeCount} storefronts, ${report.turnCount} live test turns and ${report.criterionCount} published criteria. Quality pilot commissioned by ${report.commissionedBy || "Alhena Research Lab / Alhena"}.`;
  const images = [
    {
      url: `${url}/opengraph-image`,
      width: 1200,
      height: 630,
      alt: `${report.title}: shopping and support quality pilot`,
    },
  ];
  return {
    metadataBase,
    title: `${report.title} · Quality pilot`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "Alhena Research Lab",
      title: report.title,
      description,
      url,
      publishedTime: report.publishedAt,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: report.title,
      description,
      images,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let report;
  try { report = getReport(slug).report; }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
  const sourceTools = getToolLibrary().tools.filter(t => t.reportSlug === slug || t.comparisonSlugs?.includes(slug));
  const newerStudy = getResearchLibrary().studies.find(study =>
    sourceTools.length === report.vendors.length &&
    Date.parse(study.captureEndAt) > Date.parse(report.publishedAt) &&
    sourceTools.every(tool => study.providers.some(provider => toolId(provider.website) === tool.id)));
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(reportStructuredData(report))}}/>
    <section className="shell"><div className="caveat"><strong>Historical quality-pilot report</strong><p>This report preserves its original quality scores and capture dates. {newerStudy ? <Link href={`/studies/${newerStudy.slug}`}>Read the newer policy-resolution study and current composite scores.</Link> : <Link href="/">Browse current research results.</Link>}</p><Link href="/methodology/quality-pilot-v1">Original quality-pilot methodology</Link></div></section>
    <ReportExplorer slug={slug} initialReport={report as ReportSummary}/></>;
}
