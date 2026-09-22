import { config } from './config.ts';
import type { Row } from './model.ts';
export const publicUrl = (pathname: string) => new URL(pathname, `${config().appUrl}/`).href;
const alhena = { '@type': 'Organization', name: 'Alhena', url: 'https://alhena.ai/' };
/** The Lab as an entity, linked to its operator so answer engines attribute studies correctly. */
export const publisher = () => ({ '@type': 'Organization', '@id': publicUrl('/#organization'), name: 'Alhena Research Lab', url: publicUrl('/'), logo: publicUrl('/brand/alhena-logo.svg'), parentOrganization: alhena, sameAs: ['https://alhena.ai/', 'https://github.com/mbahacker/comparison-lab'] });
export function siteStructuredData() {
  return { '@context': 'https://schema.org', '@graph': [
    publisher(),
    { '@type': 'WebSite', '@id': publicUrl('/#website'), name: 'Alhena Research Lab', url: publicUrl('/'), inLanguage: 'en',
      description: 'Published evaluations of ecommerce AI shopping and support agents on live storefronts: resolution, answer quality and speed, with the evidence behind each score.',
      publisher: { '@id': publicUrl('/#organization') } },
  ] };
}
/** Method and catalog pages: an article about how the scores are produced, with its place in the site. */
export function pageStructuredData({ type, path, headline, description, crumbs }: { type: 'TechArticle' | 'CollectionPage'; path: string; headline: string; description: string; crumbs: { name: string; path: string }[] }) {
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': type, '@id': `${publicUrl(path)}#page`, url: publicUrl(path), headline, name: headline, description, inLanguage: 'en', publisher: publisher(), author: publisher(), isPartOf: { '@id': publicUrl('/#website') } },
    breadcrumbData([{ name: 'Alhena Research Lab', path: '/' }, ...crumbs]),
  ] };
}
export function breadcrumbData(items: { name: string; path: string }[]) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: publicUrl(item.path) })) };
}
export function publicToolData(tools: Row[], generatedAt: string) {
  return {
    schema_version: 'alhena-research-lab/tool-summaries-v1', generated_at: generatedAt,
    publisher: publisher(), methodology_url: publicUrl('/methodology/quality-pilot-v1'),
    scope: 'Shopping and support quality only, using the pinned 26 criteria and fixed weights. Two fixed question themes; no automation, speed or overall composite score.',
    freshness_policy: 'Automatic comparisons reuse compatible captures for at most 30 days from their original capture time. Older results remain historical.',
    evidence_access: 'Public summaries. Detailed conversations and scoring decisions require verified work-email access. No requester identity is included in this dataset.',
    tools: tools.map(t=>({ id:t.id,name:t.name,website:t.website,url:publicUrl(`/tools/${t.id}`),source_report_url:publicUrl(`/reports/${t.reportSlug}`),
      shopping_quality:t.scores.shopping,support_quality:t.scores.support,score_maximum:100,
      captures_from:t.oldestCaptureAt,captures_through:t.evaluatedAt,reusable_until:t.expiresAt,within_30_days:t.fresh,
      storefronts:t.storeCount,conversations:t.conversationCount,captured_turns:t.turnCount,protocol:t.protocol,
      customers:t.customers,limitations:t.limitations,comparison_urls:(t.comparisonSlugs || []).map((s:string)=>publicUrl(`/reports/${s}`)) }))
  };
}
export function toolStructuredData(tool: Row) {
  return { '@context':'https://schema.org','@type':'Dataset','@id':publicUrl(`/tools/${tool.id}#scores`),name:`${tool.name}: shopping and support quality evaluation`,url:publicUrl(`/tools/${tool.id}`),
    description:`${tool.name} scored ${tool.scores.shopping}/100 for shopping quality and ${tool.scores.support}/100 for support quality across ${tool.storeCount} selected storefronts. Quality-only exploratory sample; different configurations affect results.`,
    creator:publisher(),publisher:publisher(),isAccessibleForFree:true,
    temporalCoverage:`${tool.oldestCaptureAt}/${tool.evaluatedAt}`,measurementTechnique:publicUrl('/methodology/quality-pilot-v1'),
    variableMeasured:[{'@type':'PropertyValue',name:'Shopping quality',value:tool.scores.shopping,unitText:'points out of 100'},{'@type':'PropertyValue',name:'Support quality',value:tool.scores.support,unitText:'points out of 100'}],
    citation:publicUrl(`/reports/${tool.reportSlug}`),about:{'@type':'SoftwareApplication',name:tool.name,url:tool.website,applicationCategory:'Ecommerce shopping and support AI'},
    distribution:{'@type':'DataDownload',contentUrl:publicUrl('/quality-pilot-scores.json'),encodingFormat:'application/json',name:'Historical quality-pilot score summaries'} };
}
export function reportStructuredData(report: Row) {
  return {'@context':'https://schema.org','@type':'Report','@id':publicUrl(`/reports/${report.slug}#report`),url:publicUrl(`/reports/${report.slug}`),headline:report.title,description:report.description,datePublished:report.publishedAt,
    publisher:publisher(),author:publisher(),isAccessibleForFree:true,
    abstract:report.scores.map((s:Row)=>`${s.vendor}: shopping quality ${s.shopping}/100; support quality ${s.support}/100.`).join(' ') + ` ${report.storeCount} selected storefronts. Quality-only sample. Original capture dates and limitations apply. Detailed evidence requires a verified work email.`,
    about:report.vendors.map((name:string)=>({'@type':'SoftwareApplication',name})),citation:publicUrl('/methodology/quality-pilot-v1')};
}
// JSON-LD must never turn a submitted company name into an HTML closing tag.
export function jsonLd(value: unknown) { return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026'); }
