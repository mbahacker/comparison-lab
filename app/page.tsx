import { ReportLibrary } from '@/components/lab/report-library';
import { getToolLibrary } from '@/lib/server/reuse';
import { listReports } from '@/lib/server/evidence';
import { jsonLd, publicUrl, publisher } from '@/lib/server/public-data';
import type { ToolSummary, ReportSummary } from '@/lib/client';
export const metadata={alternates:{canonical:'/'}};
export default function Home(){
 const library=getToolLibrary();
 const data={'@context':'https://schema.org','@type':'DataCatalog',name:'Alhena Research Lab tool evaluations',url:publicUrl('/'),description:'Shopping and support quality scores from selected storefront evaluations. Public summaries with original capture dates; detailed evidence requires a verified work email.',publisher:publisher(),dataset:library.tools.map(t=>({'@type':'Dataset',name:`${t.name} quality evaluation`,url:publicUrl(`/tools/${t.id}`)}))};
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(data)}}/><ReportLibrary tools={library.tools as ToolSummary[]} reports={listReports() as ReportSummary[]}/></>;
}
