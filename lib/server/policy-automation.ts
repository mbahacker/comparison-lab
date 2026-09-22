import { priorRosterApprovals } from './roster-amendments.ts';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { db, transaction } from './db.ts';
import { ApiError, type Row } from './model.ts';
import { hash, iso, safeEqual } from './security.ts';
import { enqueueMail } from './mail.ts';
import { toolId } from './reuse.ts';
import { getPolicyStudy, listPolicyStudies, policyStudyArtifact, readPolicyRelease } from './policy-studies.ts';
import { EXECUTION_PROFILE, QUESTION_MANIFEST, POLICY_PROTOCOL_HASH, digest, merchantId } from '../../worker/policy-contract.mjs';
import { validateAutomatedEvidence } from '../../worker/policy-evidence.mjs';
import { loadUpstream } from '../../worker/upstream.mjs';
import { projectPolicyStudy } from '../../benchmark/policy-export.mjs';
import { renderPolicyReport } from '../../benchmark/policy-report.mjs';
const empty = () => ({captures: [] as Row[], sources: [] as Row[], judgments: [] as Row[]});
const fresh = (value: string, now = Date.now()) => { const age=now-Date.parse(value); return Number.isFinite(age)&&age>=0&&age<=30*86400000; };
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value,null,2)+'\n');
export function policyProtocol() {
  const snapshot={id:'policy-resolution-v1',version:'automated-policy-v1',methodHash:POLICY_PROTOCOL_HASH,rubricCommit:QUESTION_MANIFEST.sourceCommit,questionManifest:QUESTION_MANIFEST,executionProfile:EXECUTION_PROFILE,storesPerProvider:5,conversationsPerProvider:55,turnsPerProvider:515,qualityOnly:false};
  return {...snapshot,sha256:hash(JSON.stringify(snapshot))};
}
function storedSources() {
  return (db().prepare('SELECT * FROM policy_releases WHERE source_path IS NOT NULL ORDER BY rowid DESC').all() as Row[]).map(row=>{
    const root=fs.realpathSync(config().dataDir), file=fs.realpathSync(path.join(root,row.source_path));
    if(!file.startsWith(root+path.sep))throw Error('Invalid private source path');
    const content=fs.readFileSync(file);if(hash(content)!==row.source_sha256)throw Error('Private source integrity failure');
    return {row,evidence:JSON.parse(content.toString('utf8'))};
  });
}
export function getPolicyProviderCatalog(query=''): Row[] {
  const output=new Map<string,Row>();
  for(const {row,evidence} of storedSources())for(const p of evidence.providers){
    const id=toolId(p.website);if(output.has(id)||query&&!`${p.name} ${p.website}`.toLowerCase().includes(query.toLowerCase()))continue;
    output.set(id,{name:p.name,website:p.website,customers:p.customers.map((s:Row)=>({...s,sourceReportSlug:row.slug,capturedAt:evidence.captures.find((c:Row)=>c.store===s.name&&c.vendor===p.name)?.captured_at}))});
  }
  return [...output.values()];
}
export function planPolicyReuse(providers: Row[],snapshot: Row=policyProtocol()): Row {
  const reusedEvidence=empty(), sources:Row[]=[], selections:Row[]=[];
  for(const p of providers)for(const store of p.customers){
    for(const candidate of storedSources()){
      const e=candidate.evidence;
      if(e.protocolSnapshotSha256!==snapshot.sha256)continue;
      const old=e.providers.find((v:Row)=>toolId(v.website)===toolId(p.website)&&v.name===p.name&&v.customers.some((s:Row)=>s.website===store.website&&s.name===store.name));if(!old)continue;
      const cs=e.captures.filter((c:Row)=>c.vendor===p.name&&c.store===store.name&&c.url===new URL(store.website).href);
      const js=e.judgments.filter((j:Row)=>cs.some((c:Row)=>c.id===j.captureId)),ss=e.sources.filter((s:Row)=>s.merchantId===merchantId(store));
      if(cs.length!==11||js.length!==10||!cs.every((c:Row)=>fresh(c.captured_at))||!ss.length||!ss.every((s:Row)=>fresh(s.retrievedAt)))continue;
      reusedEvidence.captures.push(...cs);reusedEvidence.judgments.push(...js);reusedEvidence.sources.push(...ss);
      selections.push({slug:candidate.row.slug,sourceSha256:candidate.row.source_sha256,provider:p.name,store:store.name,website:store.website});sources.push({slug:candidate.row.slug,title:`${p.name}: ${store.name}`});break;
    }
  }
  const total=providers.reduce((n,p)=>n+(p.customers.length===3?5:p.customers.length),0),reusedStores=selections.length;
  const result:Row={reusedStores,newStores:total-reusedStores,reusedConversations:reusedStores*11,newConversations:(total-reusedStores)*11,sources,selections};
  if(providers.length===1&&[3,5].includes(providers[0].customers.length)&&reusedStores===providers[0].customers.length&&new Set(selections.map(s=>s.slug)).size===1){
    const original=storedSources().find(s=>s.row.slug===selections[0].slug);
    const fullProvider=original?.evidence.providers.find((p:Row)=>toolId(p.website)===toolId(providers[0].website));
    if(!fullProvider || fullProvider.customers.length!==5 || !original!.evidence.captures.filter((c:Row)=>c.vendor===fullProvider.name).every((c:Row)=>fresh(c.captured_at)) || !original!.evidence.sources.every((s:Row)=>fresh(s.retrievedAt)))return result;
    result.reusedStores=5;result.newStores=0;result.reusedConversations=55;result.newConversations=0;
    const p=providers[0],slug=selections[0].slug;result.existingTool={id:toolId(p.website),name:p.name,website:p.website,reportSlug:slug,studySlug:slug,reportPath:`/studies/${slug}`,comparisons:comparisonsFor(toolId(p.website))};
  }
  return result;
}
export function resolvePolicyReuse(plan:Row|null,providers:Row[],snapshot:Row) {
  const output=empty();
  for(const selected of plan?.selections||[]){
    const record=storedSources().find(s=>s.row.slug===selected.slug&&s.row.source_sha256===selected.sourceSha256);
    const p=providers.find(p=>p.name===selected.provider&&p.customers.some((s:Row)=>s.name===selected.store&&s.website===selected.website));
    if(!record||!p||record.evidence.protocolSnapshotSha256!==snapshot.sha256)throw new ApiError(422,'Authorized reused source is unavailable.');
    const cs=record.evidence.captures.filter((c:Row)=>c.vendor===p.name&&c.store===selected.store);
    if(cs.length!==11||!cs.every((c:Row)=>fresh(c.captured_at)))throw new ApiError(422,'Reusable evidence has expired.');
    output.captures.push(...cs);output.judgments.push(...record.evidence.judgments.filter((j:Row)=>cs.some((c:Row)=>c.id===j.captureId)));
    output.sources.push(...record.evidence.sources.filter((s:Row)=>s.merchantId===merchantId({website:selected.website})));
  }
  return output;
}
function comparisonsFor(id:string) { return listPolicyStudies().filter(s=>s.providers.length>1&&s.providers.some(p=>toolId(p.website)===id)).map(s=>({slug:s.slug,title:s.title,path:`/studies/${s.slug}`})); }
function writeImmutable(filename:string,content:Buffer) {
  fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  if(fs.existsSync(filename)){if(!fs.readFileSync(filename).equals(content))throw Error('Immutable artifact conflict');return;}
  const fd=fs.openSync(filename,'wx',0o600);try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function publishArtifacts(summary:Row,evidence:Row,methodText:string,sourceHash:string,approvedAt:string) {
  const root=path.join(config().dataDir,'published-studies'),prefix=`releases/${summary.slug}/${hash(bytes({summary,evidence,methodText,sourceHash,approvedAt})).slice(0,32)}`;
  const pin=(name:string,content:Buffer)=>{const relative=`${prefix}/${name}`;writeImmutable(path.join(root,relative),content);return{path:relative,sha256:hash(content)};};
  const summaryPin=pin('summary.json',bytes(summary)),evidencePin=pin('evidence.json',bytes(evidence)),methodPin=pin('method.md',Buffer.from(methodText));
  const htmlPin=pin('report.html',Buffer.from(renderPolicyReport({summary,evidence,methodText,reviewOnly:false})));
  const validation={schema:'alhena-research-lab/automatic-policy-validation-v1',protocol:'policy-resolution-v1',status:'complete',approvedForPublication:true,approvalBasis:'operator-approved-request-and-server-validation',summarySha256:summaryPin.sha256,evidenceSha256:evidencePin.sha256,methodSha256:methodPin.sha256,htmlSha256:htmlPin.sha256,validation:'capture-lineage-blind-audit-arithmetic-privacy-v1',sourceEvidenceSha256:sourceHash,approvedAt,
    ...Object.fromEntries(['plannedCoreContexts','capturedCoreContexts','pcrDecisions','auditedPcrDecisions'].map(k=>[k,summary.sample[k]]))};
  const manifestPin=pin('manifest.json',bytes({schema:'alhena-research-lab/policy-publication-v1',slug:summary.slug,status:'approved',summary:summaryPin,evidence:evidencePin,method:methodPin,html:htmlPin,validation:pin('validation.json',bytes(validation))}));
  readPolicyRelease(root,manifestPin);return manifestPin;
}
function privacyCheck(value:unknown,privateValues:string[]) {
  const text=JSON.stringify(value);
  for(const secret of privateValues.filter(s=>typeof s==='string'&&s.length>=6))if(text.toLowerCase().includes(secret.toLowerCase()))throw new ApiError(422,'Private requester or runtime data was found in evidence.');
  if(/(?:sk-ant-|sk-proj-|SG\.[a-zA-Z0-9_-]{20}|Bearer\s+[a-zA-Z0-9_.-]{20}|BEGIN .*PRIVATE KEY)/.test(text))throw new ApiError(422,'Credential-like data was found in evidence.');
}
export async function completePolicyJob(input:Row,job:Row,row:Row,user:Row, options: {upstream?: any} = {}) {
  const providers=JSON.parse(row.providers_json),snapshot=JSON.parse(job.protocol_json),completedAt=iso();
  if(row.review_decision!=='approve'||!row.attribution_confirmed_at)throw new ApiError(422,'Study was not approved.');
  const authorizedReuse=resolvePolicyReuse(job.reuse_json?JSON.parse(job.reuse_json):null,providers,snapshot);
  const upstream=options.upstream || await loadUpstream(path.join(config().dataDir,'reference-cache'));
  let validated;
  try{validated=validateAutomatedEvidence(input.evidence,{providers,protocolSnapshotSha256:snapshot.sha256,authorizedReuse: authorizedReuse as any,approvedAt:row.reviewed_at,priorApprovals:priorRosterApprovals(row,job),now:new Date(completedAt),upstream});}catch(error){throw new ApiError(422,`Policy evidence validation failed: ${error instanceof Error?error.message:'invalid evidence'}`);}
  const sourceHash=hash(bytes(input.evidence)),slug=`${providers.map((p:Row)=>toolId(p.website)).join('-vs-')}-${row.id.slice(0,8)}`;
  const methodText=fs.readFileSync(path.resolve('rubric/policy-method.md'),'utf8');
  const projection=projectPolicyStudy({...validated,slug,title:providers.map((p:Row)=>p.name).join(' vs. ')+': policy-resolution study',description:'Live storefront evaluation of policy-compliant resolution, answer quality and response speed.',preparedAt:completedAt,methodSha256:hash(methodText),sourceCommit:snapshot.rubricCommit,
    provenance:{kind:'automated-policy-v1',protocolSnapshotSha256:snapshot.sha256,capturesSha256:digest(input.evidence.captures),judgmentsSha256:digest(input.evidence.judgments),policySourcesSha256:digest(input.evidence.sources),executionProfileSha256:digest(input.evidence.executionProfile)},limitations:['Unresolved capture failures pause publication; completed studies do not represent every deployment of a provider.'] as any});
  privacyCheck(projection,[user.email,user.name,config().adminEmail,input.leaseToken,config().workerSecret]);
  const sourcePath=`automation-evidence/${sourceHash}.json`;writeImmutable(path.join(config().dataDir,sourcePath),bytes(input.evidence));
  return transaction(()=>{
    const live=db().prepare('SELECT * FROM jobs WHERE id=?').get(job.id) as Row;
    if(live.state!=='running'||live.fencing_token!==input.fencingToken||!safeEqual(live.lease_token_hash,hash(input.leaseToken))||live.lease_expires_at<=Date.now())throw new ApiError(409,'Job lease expired during validation.');
    const manifest=publishArtifacts(projection.summary,projection.evidence,methodText,sourceHash,row.reviewed_at);
    db().prepare('INSERT INTO policy_releases (slug,manifest_json,source_path,source_sha256,request_id,generation_key) VALUES (?,?,?,?,?,?)').run(slug,JSON.stringify(manifest),sourcePath,sourceHash,row.id,`job:${job.id}`);
    const generated=providers.length===1?createComparisons(projection.summary,projection.evidence,sourceHash,methodText,row.reviewed_at):[];
    const id=providers.length===1?toolId(providers[0].website):null;
    const comparisons=id?comparisonsFor(id):[];
    const response={ok:true,report:projection.summary,toolId:id,comparisons};
    db().prepare("UPDATE jobs SET state='published',updated_at=?,lease_token_hash=NULL,lease_expires_at=NULL,error=NULL,completion_token_hash=?,completion_evidence_hash=?,completion_json=? WHERE id=?").run(completedAt,hash(input.leaseToken),hash(JSON.stringify(input.evidence)),JSON.stringify(response),job.id);
    db().prepare("UPDATE requests SET status='published',report_slug=?,tool_id=?,comparisons_json=?,updated_at=?,error=NULL WHERE id=?").run(slug,id,JSON.stringify(comparisons),completedAt,row.id);
    const url=`${config().appUrl}/studies/${slug}`;
    enqueueMail(`request:${row.id}:published`,user.email,`Your tool analysis is published: ${providers.map((p:Row)=>p.name).join(' vs. ')}`,`Hi ${user.name},\n\nYour policy-resolution evaluation passed validation and is published. The current leaderboard, charts and tool profile use these results.\n\n${url}\n\n${generated.length} comparisons were created from compatible studies captured within 30 days. Original dates and limitations are retained.\n${comparisons.map(r=>`${r.title}: ${config().appUrl}${r.path}`).join('\n')}\n\nDetailed evidence requires a verified work email.\n\nAlhena Research Lab`);
    enqueueMail(`request:${row.id}:published-admin`,config().adminEmail,`Published: ${projection.summary.title}`,`The approved policy-resolution analysis passed server validation.\n\n${url}\n\n${generated.length} comparisons were generated. The submitter notification is queued.\n\nAlhena Research Lab`);
    return response;
  });
}
function createComparisons(summary:Row,evidence:Row,sourceHash:string,methodText:string,approvedAt:string) {
  const own=summary.providers[0],candidates=new Map<string,{study:Row;provider:Row}>();
  for(const study of listPolicyStudies().filter(s=>!s.derivedFrom && s.method.sourceCommit===summary.method.sourceCommit).sort((a,b)=>b.captureEndAt.localeCompare(a.captureEndAt)))for(const p of study.providers){
    const id=toolId(p.website);if(id===toolId(own.website)||candidates.has(id)||!fresh(study.captureStartAt)||!fresh(study.captureEndAt))continue;candidates.set(id,{study,provider:p});
  }
  const generated=[];
  for(const {study,provider}of candidates.values()){
    const original=JSON.parse(policyStudyArtifact(study.slug,'evidence').bytes.toString('utf8'));
    const selected=original.conversations.filter((c:Row)=>c.provider===provider.name);
    if(!selected.length||!selected.every((c:Row)=>fresh(c.capturedAt)))continue;
    if (study.method.sha256 !== summary.method.sha256) continue;
    const sourcePin=getPolicyStudy(study.slug).manifest.evidence.sha256;
    const key=`pair:${[sourceHash,sourcePin+':'+provider.id].sort().join(':')}`;
    if(db().prepare('SELECT slug FROM policy_releases WHERE generation_key=?').get(key))continue;
    const name=[own.name,provider.name].sort(),slug=`${[toolId(own.website),toolId(provider.website)].sort().join('-vs-')}-${hash(key).slice(0,10)}`;
    const conversations=[...evidence.conversations,...selected],guardrails=[...evidence.guardrails,...(original.guardrails||[]).filter((c:Row)=>c.provider===provider.name)];
    const dates=conversations.map((c:Row)=>c.capturedAt).sort(),assessed=conversations.flatMap((c:Row)=>c.turns).filter((t:Row)=>t.assessed).length;
    const combined={...summary,slug,title:`${name.join(' vs. ')}: policy-resolution comparison`,description:'Comparison assembled from published evaluations; no new conversations were run for this comparison.',captureStartAt:dates[0],captureEndAt:dates.at(-1),providers:[own,provider],derivedFrom:[{slug:summary.slug,sha256:sourceHash},{slug:study.slug,sha256:sourcePin}],sample:{plannedCoreContexts:conversations.length,capturedCoreContexts:conversations.length,guardrailContexts:guardrails.length,judgedCoreContexts:conversations.filter((c:Row)=>c.turns.some((t:Row)=>t.assessed)).length,pcrDecisions:assessed,auditedPcrDecisions:assessed},audit:{description:'This comparison retains the original judgments and audit coverage of each source study. No new judgment or audit is claimed for this derived comparison.',limitations:[...new Set([...summary.audit.limitations,...study.audit.limitations,`Source methods: ${summary.slug} (${summary.method.sha256}); ${study.slug} (${study.method.sha256}). Read each source method before interpreting differences.`])]},limitations:[...new Set([...summary.limitations,...study.limitations,'Derived from separate published runs under policy-resolution-v1. Original capture dates and coverage are retained; execution environments may differ.'])]};
    const combinedEvidence={...evidence,sourceMethodAndAudit:[{slug:summary.slug,method:summary.method,audit:summary.audit},{slug:study.slug,method:study.method,audit:study.audit}],repairSelections:original.repairSelections?{...original.repairSelections,candidates:original.repairSelections.candidates.filter((c:Row)=>c.provider===provider.name)}:null,provenance:{kind:'derived-policy-comparison-v1',sources:combined.derivedFrom},conversations,guardrails,policySources:[...evidence.policySources,...(original.policySources||[]).filter((s:Row)=>selected.some((c:Row)=>c.store===s.merchant))],storefrontResults:[...evidence.storefrontResults,...(original.storefrontResults||[]).filter((s:Row)=>s.provider===provider.name)],arithmetic:{sourceStudies:combined.derivedFrom,providers:[evidence.arithmetic.providers[0],original.arithmetic.providers.find((p:Row)=>p.name===provider.name)]}};
    const manifest=publishArtifacts(combined,combinedEvidence,methodText,hash(key),approvedAt);
    db().prepare('INSERT INTO policy_releases (slug,manifest_json,generation_key) VALUES (?,?,?)').run(slug,JSON.stringify(manifest),key);generated.push({slug,title:combined.title});
  }
  return generated;
}
