import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleApi } from '../lib/server/api.ts';
import { db, closeDb } from '../lib/server/db.ts';
import { hash } from '../lib/server/security.ts';
import { SEED_SLUG } from '../lib/server/evidence.ts';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-lab-reuse-api-'));
const realNow = Date.now;
let now = Date.parse('2026-09-21T00:00:00Z');
Date.now = () => now;
Object.assign(process.env, { DATA_DIR: directory, CONTENT_DIR: path.resolve('content/reports'), NODE_ENV: 'test', APP_URL: 'https://research.example', MAIL_TRANSPORT: 'file', WORKER_SECRET: 'fixture-worker-secret-with-32-characters' });
after(() => { Date.now = realNow; closeDb(); fs.rmSync(directory, { recursive: true, force: true }); });
const cookie = 'comparison_lab_session=fixture-session';
db().prepare('INSERT INTO users(id,email,name,verified_at,created_at) VALUES(?,?,?,?,?)').run('reader','reader@business.example','Reader',new Date(now).toISOString(),new Date(now).toISOString());
db().prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash('fixture-session'),'reader',now+100*86_400_000);
async function call(route:string, body?:unknown, worker=false) {
  if (body && ['tools/requests','tools/reuse/preview','requests','reuse/preview'].includes(route)) body = { ...(body as Record<string, unknown>), protocol: 'quality-pilot-v1' };
  const headers:Record<string,string> = { origin:process.env.APP_URL!, cookie };
  if(body!==undefined)headers['content-type']='application/json';
  if(worker)headers.authorization=`Bearer ${process.env.WORKER_SECRET}`;
  const response=await handleApi(new Request(`${process.env.APP_URL}/api/${route}`,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}));
  return {status:response.status,data:await response.json() as any};
}

test('existing pair is found regardless of order and does not enqueue duplicate work',async()=>{
  const catalog=await call('providers?q=');
  assert.equal(catalog.status,200);
  assert.deepEqual(catalog.data.providers.map((p:any)=>p.name),['Alhena','Gorgias']);
  const providers=catalog.data.providers.map((p:any)=>({name:p.name,website:p.website,customers:p.customers.map((c:any)=>({name:c.name,website:c.website}))})).reverse();
  const preview=await call('reuse/preview',{providers});
  assert.equal(preview.data.reusedConversations,12);assert.equal(preview.data.newConversations,0);
  assert.equal(preview.data.existingReport.slug,SEED_SLUG);
  assert.equal(JSON.stringify(preview.data).includes('reply_as_judged'),false);
  const submitted=await call('requests',{providers,consent:true});
  assert.equal(submitted.status,200);assert.equal(submitted.data.existingReport.slug,SEED_SLUG);
  assert.equal((db().prepare('SELECT COUNT(*) AS n FROM requests').get() as any).n,0);
  assert.equal((db().prepare('SELECT COUNT(*) AS n FROM jobs').get() as any).n,0);
});

test('partial reuse still needs operator approval and only server-selected evidence enters a lease',async()=>{
  const catalog=(await call('providers?q=Alhena')).data.providers[0];
  const providers=[{name:catalog.name,website:catalog.website,customers:catalog.customers.map((c:any)=>({name:c.name,website:c.website}))},{name:'New Provider',website:'https://new-provider.example/',customers:[1,2,3].map(i=>({name:`New Store ${i}`,website:`https://new-store-${i}.example/`}))}];
  const preview=await call('reuse/preview',{providers});
  assert.equal(preview.data.reusedConversations,6);assert.equal(preview.data.newConversations,6);
  const submitted=await call('requests',{providers,consent:true,reusedConversations:[{forged:true}]});
  assert.equal(submitted.status,201);assert.equal(submitted.data.request.status,'pending_review');
  assert.equal((await call('worker/claim',{},true)).data.job,null);
  const mail=db().prepare("SELECT text_body FROM outbox WHERE event_key=?").get(`request:${submitted.data.request.id}:review`) as any;
  const reviewToken=mail.text_body.match(/\/review\/([A-Za-z0-9_-]+)/)[1];
  const approved=await call(`review/${reviewToken}`,{decision:'approve',confirmAttribution:true});
  assert.equal(approved.status,200);assert.equal(approved.data.request.status,'queued');
  const claim=await call('worker/claim',{},true);
  assert.equal(claim.status,200);assert.equal(claim.data.job.reusedConversations.length,6);
  assert.equal(claim.data.job.reusedConversations.some((c:any)=>c.forged),false);
  assert.ok(claim.data.job.reusedConversations.every((c:any)=>c.reuse.sourceReportSlug===SEED_SLUG));
  const stored=db().prepare('SELECT reuse_json FROM jobs WHERE id=?').get(claim.data.job.id) as any;
  assert.equal(JSON.parse(stored.reuse_json).references.length,6);
  const job=claim.data.job;
  await call('worker/fail',{jobId:job.id,leaseToken:job.leaseToken,fencingToken:job.fencingToken,code:'fixture_stop',message:'Test-only stop; no storefronts contacted.',retryable:false},true);
});

test('analysis beyond 30 days can prefill targets but requires new work',async()=>{
  now=Date.parse('2026-10-22T00:00:00Z');
  const catalog=(await call('providers')).data.providers;
  assert.equal(catalog.length,2);assert.ok(catalog.every((p:any)=>p.customers.every((c:any)=>c.reusable===false)));
  const providers=catalog.map((p:any)=>({name:p.name,website:p.website,customers:p.customers.map((c:any)=>({name:c.name,website:c.website}))}));
  const preview=await call('reuse/preview',{providers});
  assert.equal(preview.status,200);assert.equal(preview.data.reusedConversations,0);assert.equal(preview.data.newConversations,12);
  assert.equal(preview.data.existingReport,undefined);assert.equal(preview.data.previousReport.slug,SEED_SLUG);
});
