import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLd, publicToolData, reportStructuredData } from '../lib/server/public-data.ts';
process.env.APP_URL='https://research.example';
test('public machine summaries allowlist fields and cannot leak private evidence',()=>{
 const input={id:'tool-safe',name:'Test tool',website:'https://tool.example/',reportSlug:'safe-report',scores:{shopping:0,support:92.5},oldestCaptureAt:'2026-09-01T00:00:00Z',evaluatedAt:'2026-09-02T00:00:00Z',expiresAt:'2026-10-01T00:00:00Z',fresh:true,storeCount:3,conversationCount:6,turnCount:60,protocol:'quality-pilot-v1',customers:[],limitations:['Selected sample'],comparisonSlugs:['pair-a'],email:'private@business.example',live_conversations:[{reply:'private transcript'}],notes:'private note'};
 const output=publicToolData([input],'2026-09-03T00:00:00Z');
 assert.equal(output.tools[0].shopping_quality,0);
 assert.equal(output.tools[0].source_report_url,'https://research.example/reports/safe-report');
 assert.deepEqual(output.tools[0].comparison_urls,['https://research.example/reports/pair-a']);
 assert.equal(JSON.stringify(output).includes('private@'),false);
 assert.equal(JSON.stringify(output).includes('private transcript'),false);
 assert.equal(JSON.stringify(output).includes('private note'),false);
});
test('JSON-LD safely embeds submitted names and reports only actual public scores',()=>{
 const unsafe='</script><script>alert(1)</script>&';
 assert.equal(jsonLd({name:unsafe}).includes('<'),false);
 assert.equal(JSON.parse(jsonLd({name:unsafe})).name,unsafe);
 const report=reportStructuredData({slug:'a-vs-b',title:unsafe,description:'Quality sample',publishedAt:'2026-09-20',scores:[{vendor:'A',shopping:0,support:85.5},{vendor:'B',shopping:92,support:100}],vendors:['A','B'],storeCount:6});
 assert.match(report.abstract,/A: shopping quality 0\/100; support quality 85.5\/100/);
 assert.match(report.abstract,/verified work email/);
 assert.equal('aggregateRating' in report,false);
});
