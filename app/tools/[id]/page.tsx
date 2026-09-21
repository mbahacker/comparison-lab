import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTool } from '@/lib/server/reuse';
import { listReports } from '@/lib/server/evidence';
import { publicUrl, jsonLd, toolStructuredData } from '@/lib/server/public-data';
import { ToolProfile } from '@/components/lab/tool-profile';
import type { ToolSummary, ReportSummary } from '@/lib/client';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const tool=getTool((await params).id); if(!tool) notFound();
 const title=`${tool.name} AI shopping and support evaluation`;
 const description=`${tool.name}: shopping quality ${tool.scores.shopping}/100, support quality ${tool.scores.support}/100 across three selected storefronts. Explore dates, sample limits and comparison reports.`;
 return {title,description,alternates:{canonical:publicUrl(`/tools/${tool.id}`)},openGraph:{title,description,url:publicUrl(`/tools/${tool.id}`),type:'article'},twitter:{card:'summary_large_image',title,description}};
}
export default async function Page({params}:{params:Promise<{id:string}>}){
 const tool=getTool((await params).id); if(!tool) notFound();
 const comparisons=listReports().filter(r=>r.vendors.length===2 && tool.comparisonSlugs?.includes(r.slug));
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(toolStructuredData(tool))}}/><ToolProfile tool={tool as ToolSummary} comparisons={comparisons as ReportSummary[]}/></>;
}
