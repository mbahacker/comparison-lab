import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTool } from '@/lib/server/reuse';
import { listReports } from '@/lib/server/evidence';
import { breadcrumbData, publicUrl, jsonLd, toolStructuredData } from '@/lib/server/public-data';
import { ToolProfile } from '@/components/lab/tool-profile';
import type { ToolSummary, ReportSummary } from '@/lib/client';
import { getResearchLibrary } from '@/lib/server/research-library';
import { researchToolDescription, researchToolStructuredData } from '@/lib/research-library';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const id=(await params).id, research=getResearchLibrary().tools.find(tool=>tool.id===id);
 const pilot=research ? undefined : getTool(id); if(!research && !pilot) notFound();
 const title=research ? `${research.name} latest policy-resolution study results` : `${pilot!.name} historical quality-pilot evaluation`;
 const description=research ? researchToolDescription(research) : `${pilot!.name}: historical shopping quality ${pilot!.scores.shopping}/100 and support quality ${pilot!.scores.support}/100 across three selected storefronts. Original quality-pilot capture dates and limitations apply.`;
 return {title,description,alternates:{canonical:publicUrl(`/tools/${id}`)},openGraph:{title,description,url:publicUrl(`/tools/${id}`),type:'article',...(research ? {publishedTime:research.publishedAt} : {})},twitter:{card:'summary_large_image',title,description}};
}
export default async function Page({params}:{params:Promise<{id:string}>}){
 const id=(await params).id, library=getResearchLibrary(), research=library.tools.find(tool=>tool.id===id), pilot=getTool(id);
 if(!research && !pilot) notFound();
 const comparisons=pilot ? listReports().filter(r=>r.vendors.length===2 && pilot.comparisonSlugs?.includes(r.slug)) : [];
 const structured=research ? researchToolStructuredData(research,publicUrl('/')) : {...toolStructuredData(pilot!),distribution:{'@type':'DataDownload',contentUrl:publicUrl('/quality-pilot-scores.json'),encodingFormat:'application/json',name:'Historical quality-pilot summaries'}};
 const name=research?.name ?? pilot!.name, crumbs={'@context':'https://schema.org',...breadcrumbData([{name:'Alhena Research Lab',path:'/'},{name:'Results',path:'/#tools'},{name,path:`/tools/${id}`}])};
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(structured)}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(crumbs)}}/><ToolProfile research={research} study={library.studies.find(study=>study.slug===research?.studySlug)} pilot={pilot as ToolSummary | undefined} comparisons={comparisons as ReportSummary[]}/></>;
}
