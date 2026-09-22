import {RUBRIC} from '../worker/protocol.mjs';
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {db,closeDb} from '../lib/server/db.ts';
import {hash} from '../lib/server/security.ts';
import {policyProtocol,completePolicyJob,planPolicyReuse} from '../lib/server/policy-automation.ts';
import {getResearchLibrary} from '../lib/server/research-library.ts';
import {listPolicyStudies} from '../lib/server/policy-studies.ts';
import {handlePolicyStudy} from '../lib/server/policy-study-api.ts';
import {handleApi} from '../lib/server/api.ts';
import {toolId} from '../lib/server/reuse.ts';
import {deriveCheckedScore} from '../worker/scoring.mjs';
import {makePolicyPlan,EVIDENCE_SCHEMA,EXECUTION_PROFILE,QUESTION_MANIFEST,digest,MODEL,merchantId} from '../worker/policy-contract.mjs';
import {validateAutomatedEvidence,pcrPacket} from '../worker/policy-evidence.mjs';
import {qualityPackets,qualityPrimaryRequest,qualityAuditRequest,validateQualityPrimary} from '../worker/policy-quality.mjs';
import {CHECKS} from '../worker/policy-quality-spec.mjs';
import {makeRequest} from '../benchmark/policy-judge.mjs';
import {finalizePolicyCapture,extractTurn} from '../worker/capture.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'policy-pipeline-'));
Object.assign(process.env,{DATA_DIR:directory,NODE_ENV:'test',APP_URL:'https://offline.example',MAIL_TRANSPORT:'file',WORKER_SECRET:'offline-secret-more-than-thirty-two-characters'});
after(()=>{closeDb();fs.rmSync(directory,{recursive:true,force:true});});
const upstream={rubricText:'SOFTWARE TEST FIXTURE; not a model or live evaluation',normalizeUserMessage:(s:string)=>s,stripWidgetChrome:(s:string)=>s,convoSignals:()=>Object.fromEntries(RUBRIC.criteria.filter(c=>c.signal_gate).map(c=>[c.signal_gate,false])),deriveScores:deriveCheckedScore};
const approvedAt=new Date(Date.now()-60000).toISOString();
function fixture(name='Fixture A') {
  const domain=name.replaceAll(' ','-').toLowerCase()+'.example',provider={name,website:`https://${domain}/`,customers:[1,2,3,4,5].map(n=>({name:`${name} store ${n}`,website:`https://${domain.replace('.example','')}-store-${n}.example/`}))};
  const snapshot=policyProtocol(),plan=makePolicyPlan([provider]);
  const sources=provider.customers.map(s=>({id:merchantId(s)+'-policy',merchantId:merchantId(s),merchant:s.name,url:s.website+'returns',retrievedAt:new Date().toISOString(),sha256:hash('This is an offline software test fixture, not a real merchant policy.'),text:'This is an offline software test fixture, not a real merchant policy.'}));
  const captures=plan.map(p=>{const c:any={id:p.id,kind:'live',vendor:p.provider,store:p.store,mode:p.mode,theme:p.theme,url:p.website,captured_at:new Date().toISOString(),merchantId:p.merchantId,capture_metadata:{adapter:'generic-visible-chat-v1',provider_attribution:{verified:true,observed_urls:[provider.website+'widget.js']}},turns:p.questions.map((q:string,i:number)=>({turn:i+1,question:q,reply:'OFFLINE TEST FIXTURE. This response does not answer the question. It is not a live storefront result.',speaker:'ai',submitted:true,assessable:true,observationState:'submitted',response_complete:true,complete_ms:3000,author_verified:true,author_evidence:{kind:'dom-ai-author',selector:'[data-role="assistant"]',provider:name,adapter_id:'generic-visible-chat-v1',message_count:1,markers:[{attribute:'data-role',value:'assistant'}]}}))};c.source_capture_sha256=hash(JSON.stringify(c));return c;});
  const call=(request:any,value:any)=>({value,metadata:{provider:'claude-cli',model:MODEL,requested_model:MODEL,effort:'high',execution_profile:'policy-resolution-v1',max_output_tokens:16384,timeout_ms:1200000,response_id:randomUUID(),created_at:new Date().toISOString(),requestSha256:digest(request)}});
  const judgments=captures.filter(c=>c.theme!=='guardrails').map(c=>{
    const q=qualityPackets(c,upstream),qualityValue={checks:Object.fromEntries(CHECKS[c.mode as keyof typeof CHECKS].map((id:string)=>[id,{pass:false,evidence:''}])),resolution_class:'failed',learning:'Offline fixture only.'};
    const primary=call(qualityPrimaryRequest(q,upstream.rubricText),qualityValue),audit=call(qualityAuditRequest(q,validateQualityPrimary(q,qualityValue),upstream.rubricText),{audit:Object.fromEntries(Object.keys(qualityValue.checks).map(id=>[id,{classification:'AGREE',evidence:'',reason:'No verified criterion evidence in fixture.',trap:''}]))});
    const packet=pcrPacket(c,sources),pcrValue={conversations:{[c.id]:{checkpoints:Object.fromEntries(c.turns.map((t:any)=>[t.turn,{turn:t.turn,status:'not_attained',handling:'none',evidence:{turn:t.turn,quote:''},policyRefs:[],reason:'Fixture does not answer the question.'}]))}}};
    return {captureId:c.id,rawSha256:c.source_capture_sha256,quality:{primary,audit},pcr:{packet,primary:call(makeRequest(packet,'primary'),pcrValue),audit:call(makeRequest(packet,'audit'),pcrValue)}};
  });
  return {provider,snapshot,evidence:{schema:EVIDENCE_SCHEMA,protocol:'policy-resolution-v1',protocolSnapshotSha256:snapshot.sha256,executionProfile:EXECUTION_PROFILE,questionManifest:QUESTION_MANIFEST,providers:[provider],captures,sources,judgments}};
}
function options(f:any){return{providers:[f.provider],protocolSnapshotSha256:f.snapshot.sha256,approvedAt,upstream};}
test('whole-cohort validation binds questions, attribution, provenance and independent blind calls',()=>{
  const f=fixture();assert.equal(validateAutomatedEvidence(f.evidence,options(f)).records.length,50);
  const foreign=structuredClone(f.evidence);foreign.providers[0].name='Injected name';assert.throws(()=>validateAutomatedEvidence(foreign,options(f)),/Provider metadata/);
  const fake=structuredClone(f.evidence);fake.captures[0].turns[0].author_evidence={};delete fake.captures[0].source_capture_sha256;fake.captures[0].source_capture_sha256=hash(JSON.stringify(fake.captures[0]));fake.judgments[0].rawSha256=fake.captures[0].source_capture_sha256;assert.throws(()=>validateAutomatedEvidence(fake,options(f)),/Unattributed/);
  const repeat=structuredClone(f.evidence);repeat.judgments[0].pcr.audit.metadata.response_id=repeat.judgments[0].pcr.primary.metadata.response_id;assert.throws(()=>validateAutomatedEvidence(repeat,options(f)),/duplicate.*provenance/);
  const future=structuredClone(f.evidence);future.sources[0].retrievedAt=new Date(Date.now()+60000).toISOString();assert.throws(()=>validateAutomatedEvidence(future,options(f)),/authorized date/);
});
test('short visible replies survive timeouts and future questions remain unsent',()=>{
  const c:any={turns:[{turn:1,question:'Q1',reply:'No.',speaker:'ai',submission_confirmed:true,author_verified:true,complete_ms:null}],capture_metadata:{}};
  finalizePolicyCapture(c,{merchantId:'fixture',questions:['Q1','Q2','Q3']},'capture_timeout');
  assert.equal(c.turns[0].reply,'No.');assert.equal(c.turns[0].assessable,true);assert.equal(c.turns[1].submitted,false);assert.equal(c.turns[1].observationState,'not_submitted');
  const unknown:any={turns:[{turn:1,question:'Q1',reply:'',observed_reply_text:extractTurn({text:'Q1\nYes.'},'Q1',true),speaker:'unknown',submission_confirmed:true,author_verified:false,complete_ms:null}],capture_metadata:{}};
  finalizePolicyCapture(unknown,{merchantId:'fixture',questions:['Q1']},'capture_timeout');
  assert.equal(unknown.turns[0].reply,'Yes.');assert.equal(unknown.turns[0].assessable,false);assert.equal(unknown.turns[0].speaker,'unknown');
  const stall:any={turns:[{turn:1,question:'Q1',reply:'',observed_reply_text:extractTurn({text:'Q1\nThinking…'},'Q1',true),speaker:'unknown',submission_confirmed:true,author_verified:false,complete_ms:null}],capture_metadata:{}};
  finalizePolicyCapture(stall,{merchantId:'fixture',questions:['Q1']},'capture_timeout');
  assert.deepEqual([stall.turns[0].reply,stall.turns[0].assessable,stall.turns[0].speaker],['Thinking…',false,'unknown'],'unattributed stall text is visible evidence, not proof of an empty response');
  const repeatedText='Q1\nQ1\nYes.',ambiguous:any={turns:[{turn:1,question:'Q1',reply:'',observed_reply_text:extractTurn({text:repeatedText},'Q1',true)||'',observed_reply_ambiguous:repeatedText.split('Q1').length!==2,speaker:'unknown',submission_confirmed:true,author_verified:false,complete_ms:null}],capture_metadata:{}};
  finalizePolicyCapture(ambiguous,{merchantId:'fixture',questions:['Q1']},'capture_timeout');
  assert.deepEqual([ambiguous.turns[0].assessable,ambiguous.turns[0].speaker],[false,'unknown'],'ambiguous question boundaries cannot become assessed no-response evidence');
});
function preparePublication(f:any){
  const id=randomUUID(),jobId=randomUUID(),lease=randomUUID(),user={id:'test-owner',name:'Offline Owner',email:'owner@private-fixture.example'};
  db().prepare('INSERT OR IGNORE INTO users(id,email,name,verified_at,created_at) VALUES(?,?,?,?,?)').run(user.id,user.email,user.name,approvedAt,approvedAt);
  db().prepare("INSERT INTO requests (id,user_id,providers_json,status,created_at,updated_at,review_token_hash,review_expires_at,review_decision,reviewed_at,attribution_confirmed_at,protocol_json) VALUES (?,?,?,'running',?,?,?,?,?,?,?,?)").run(id,user.id,JSON.stringify([f.provider]),approvedAt,approvedAt,hash(randomUUID()),Date.now()+3600000,'approve',approvedAt,approvedAt,JSON.stringify(f.snapshot));
  db().prepare("INSERT INTO jobs (id,request_id,state,protocol_json,available_at,created_at,updated_at,fencing_token,lease_token_hash,lease_expires_at,reuse_json) VALUES (?,?,'running',?,?,?,?,1,?,?,?)").run(jobId,id,JSON.stringify(f.snapshot),Date.now(),approvedAt,approvedAt,hash(lease),Date.now()+300000,JSON.stringify({selections:[]}));
  const job=db().prepare('SELECT * FROM jobs WHERE id=?').get(jobId) as any,row=db().prepare('SELECT * FROM requests WHERE id=?').get(id) as any;
  const input={jobId,leaseToken:lease,fencingToken:1,evidence:f.evidence};
  return {id,jobId,input,slug:`${toolId(f.provider.website)}-${id.slice(0,8)}`,complete:()=>completePolicyJob(input,job,row,user,{upstream})};
}
async function publish(f:any){return preparePublication(f).complete();}
test('validated publication updates current tools, creates comparisons, preserves dates and protects evidence',async()=>{
  const first=fixture(),one=await publish(first);
  let library=getResearchLibrary();assert.equal(library.tools.length,1);assert.equal(library.tools[0].shopping.composite.value,25);assert.equal(library.tools[0].support.composite.value,10);assert.equal(library.tools[0].overallComposite.value,17.5);
  assert.equal(planPolicyReuse([first.provider]).existingTool.studySlug,one.report.slug);
  const subset={...first.provider,customers:[first.provider.customers[4],first.provider.customers[0],first.provider.customers[2]]};
  assert.equal(planPolicyReuse([subset]).existingTool.studySlug,one.report.slug,'three entered storefronts identify the compatible published five-store study');
  const otherStore={...subset,customers:[...subset.customers.slice(0,2),{name:'Unregistered store',website:'https://unregistered-store.example/'}]};
  assert.equal(planPolicyReuse([otherStore]).existingTool,undefined,'a new storefront must not be substituted by the published cohort');
  assert.equal(planPolicyReuse([subset],{...first.snapshot,sha256:'0'.repeat(64)}).existingTool,undefined,'a changed execution snapshot cannot silently reuse old study results');
  const originalDate=library.tools[0].captureEndAt;
  await publish(fixture('Fixture B'));library=getResearchLibrary();assert.equal(library.tools.length,2);assert.equal(listPolicyStudies().filter(s=>s.derivedFrom).length,1);
  assert.equal(library.tools.find(t=>t.name==='Fixture A')!.captureEndAt,originalDate);
  const protectedResponse=await handlePolicyStudy(new Request(`https://offline.example/api/studies/${one.report.slug}/details`),one.report.slug,['details']);assert.equal(protectedResponse.status,401);
  const response=await handlePolicyStudy(new Request(`https://offline.example/api/studies/${one.report.slug}`),one.report.slug,[]);assert.equal(response.status,200);assert.equal((await response.text()).includes('OFFLINE TEST FIXTURE. This response'),false);
  assert.equal((db().prepare("SELECT COUNT(*) n FROM outbox WHERE event_key LIKE '%published%'").get() as any).n,4);
});

test('publication rollback after immutable writes can retry exact evidence without conflicts or duplicate mail',async()=>{
  const f=fixture('Fixture Retry'),pending=preparePublication(f),originalEvidenceHash=hash(JSON.stringify(f.evidence));
  const count=(table:string)=>(db().prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n;
  const before={releases:count('policy_releases'),outbox:count('outbox')};
  // publishArtifacts writes and verifies its files immediately before this insert.
  db().exec("CREATE TEMP TRIGGER fail_policy_publication BEFORE INSERT ON policy_releases BEGIN SELECT RAISE(ABORT,'offline injected failure after artifact writes'); END");
  try{await assert.rejects(pending.complete(),/offline injected failure after artifact writes/);}
  finally{db().exec('DROP TRIGGER fail_policy_publication');}
  assert.equal(count('policy_releases'),before.releases);
  assert.equal(count('outbox'),before.outbox);
  assert.equal((db().prepare('SELECT state FROM jobs WHERE id=?').get(pending.jobId) as any).state,'running');
  assert.equal((db().prepare('SELECT status FROM requests WHERE id=?').get(pending.id) as any).status,'running');
  const releaseRoot=path.join(directory,'published-studies','releases',pending.slug);
  const pinnedFiles=():Map<string,string>=>{
    const result=new Map<string,string>();
    const walk=(folder:string)=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else result.set(file,hash(fs.readFileSync(file)));}};
    walk(releaseRoot);return result;
  };
  const failedPins=pinnedFiles();
  assert.ok([...failedPins.keys()].some(file=>file.endsWith('/manifest.json')),'the failed transaction must leave a complete immutable artifact set to exercise retry');
  const failedSummaryFile=[...failedPins.keys()].find(file=>file.endsWith('/summary.json'))!;
  const failedSummary=JSON.parse(fs.readFileSync(failedSummaryFile,'utf8'));
  await new Promise(resolve=>setTimeout(resolve,5));
  const result=await pending.complete();
  assert.equal(result.report.slug,pending.slug);
  assert.notEqual(result.report.publishedAt,failedSummary.publishedAt,'retry tests different artifact bytes, not an identical timestamp coincidence');
  for(const [file,expectedHash]of failedPins)assert.equal(hash(fs.readFileSync(file)),expectedHash,'orphaned approved-input files remain unchanged');
  assert.ok(pinnedFiles().size>failedPins.size,'retry writes its own content-addressed artifact set');
  assert.equal(hash(JSON.stringify(f.evidence)),originalEvidenceHash);
  assert.equal((db().prepare("SELECT COUNT(*) n FROM outbox WHERE event_key LIKE ?").get(`request:${pending.id}:published%`) as any).n,2);
  const after={releases:count('policy_releases'),outbox:count('outbox')};
  const replay=await handleApi(new Request('https://offline.example/api/worker/complete',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.WORKER_SECRET}`},body:JSON.stringify(pending.input)}));
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).report.slug,pending.slug);
  assert.deepEqual({releases:count('policy_releases'),outbox:count('outbox')},after);
});
