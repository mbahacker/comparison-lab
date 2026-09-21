import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportExplorer } from "@/components/lab/report-explorer";
import { config } from "@/lib/server/config";
import { getReport } from "@/lib/server/evidence";
import { ApiError } from "@/lib/server/model";

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
  const description = `${report.description} ${report.storeCount} storefronts, ${report.turnCount} live test turns and ${report.criterionCount} published criteria. Quality pilot commissioned by ${report.commissionedBy || "Comparison Lab / Alhena"}.`;
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
    title: report.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "Alhena Comparison Lab",
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
  return <ReportExplorer slug={(await params).slug} />;
}
