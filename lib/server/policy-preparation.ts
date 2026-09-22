import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, transaction } from './db.ts';
import { config } from './config.ts';
import { hash, iso, token, safeEqual, providersInput } from './security.ts';
import { enqueueMail } from './mail.ts';
import { ApiError, type Row } from './model.ts';
import { observedProviderUrls, publicHost } from '../../worker/provider-fingerprint.mjs';
const json=(data:unknown)=>Response.json(data,{headers:{'cache-control':'private, no-store'}});
export function queuePolicyPreparation(id:string,providers:Row[],user:Row) {
  const now=iso();
  db().prepare("UPDATE requests SET status='researching',updated_at=? WHERE id=?").run(now,id);
  db().prepare("INSERT INTO preparation_jobs (id,request_id,state,available_at,created_at,updated_at) VALUES (?,?,'queued',?,?,?)").run(randomUUID(),id,Date.now(),now,now);
  enqueueMail(`request:${id}:received`,user.email,`Tool submitted: ${providers.map(p=>p.name).join(' vs. ')}`,`Hi ${user.name},\n\nWe will verify the three submitted storefronts and research two additional deployments before requesting approval for a five-storefront policy-resolution evaluation. We will not run chat tests before approval.\n\nPrivate status:\n${config().appUrl}/requests/${id}\n\nAlhena Research Lab`);
}
function active(input:Row) {
  const row=db().prepare('SELECT * FROM preparation_jobs WHERE id=?').get(typeof input.jobId==='string'?input.jobId:'') as Row|undefined;
  if(!row||row.state!=='running'||row.fencing_token!==input.fencingToken||typeof input.leaseToken!=='string'||!safeEqual(row.lease_token_hash||'',hash(input.leaseToken))||row.lease_expires_at<=Date.now())throw new ApiError(409,'Preparation lease is no longer active.');return row;
}
export function validateDiscoveries(input:Row,original:Row[],startedAt:string) {
  const providers=providersInput(input.providers,original.length as 1 | 2,5),discoveries=input.discoveries;
  if(!Array.isArray(discoveries)||discoveries.length!==original.length*5)throw new ApiError(422,'Five deployment proofs per provider are required.');
  for(const [index,p]of providers.entries()){
    const old=original[index];
    if(p.name!==old.name||p.website!==old.website||old.customers.some((s:Row,i:number)=>p.customers[i].name!==s.name||p.customers[i].website!==s.website))throw new ApiError(422,'Research cannot change submitted storefronts.');
    for(const [i,store]of p.customers.entries()){
      const proofs=discoveries.filter(d=>d.providerWebsite===p.website&&d.storeWebsite===store.website);const proof=proofs[0];
      if(proofs.length!==1||proof.verification!=='live-provider-fingerprint'||!Array.isArray(proof.observedProviderUrls)||!observedProviderUrls(p,proof.observedProviderUrls).length||typeof proof.sourceText!=='string'||proof.sourceText.length>100000||hash(proof.sourceText)!==proof.sourceSha256)throw new ApiError(422,'Missing or unverified deployment evidence.');
      const date=Date.parse(proof.retrievedAt);if(!Number.isFinite(date)||date<Date.parse(startedAt)||date>Date.now())throw new ApiError(422,'Research evidence is not from this preparation.');
      if(i<3){if(publicHost(proof.sourceUrl)!==publicHost(store.website))throw new ApiError(422,'Submitted storefront proof is from another site.');}
      else if(publicHost(proof.sourceUrl)!==publicHost(p.website)||!Array.isArray(proof.sourceLinks)||!proof.sourceLinks.some((url:string)=>{try{return publicHost(url)===publicHost(store.website);}catch{return false;}}))throw new ApiError(422,'Additional storefront must be linked from a published provider customer source.');
    }
  }
  return providers;
}
export async function handlePreparation(request:Request,parts:string[]) {
  const action=parts.at(-1);
  if(action==='claim')return json(transaction(()=>{
    const now=Date.now();
    const exhausted=db().prepare("SELECT * FROM preparation_jobs WHERE state='running' AND lease_expires_at<=? AND attempt>=3").all(now) as Row[];
    for(const job of exhausted){db().prepare("UPDATE preparation_jobs SET state='needs_review',updated_at=? WHERE id=?").run(iso(),job.id);db().prepare("UPDATE requests SET status='needs_review',error='Storefront research was interrupted; operator review is needed.',updated_at=? WHERE id=?").run(iso(),job.request_id);}
    const job=db().prepare("SELECT * FROM preparation_jobs WHERE (state='queued' AND available_at<=?) OR (state='running' AND lease_expires_at<=? AND attempt<3) ORDER BY created_at LIMIT 1").get(now,now) as Row|undefined;
    if(!job)return{job:null};const raw=token(),fence=job.fencing_token+1;
    db().prepare("UPDATE preparation_jobs SET state='running',attempt=attempt+1,fencing_token=?,lease_token_hash=?,lease_expires_at=?,heartbeat_at=?,updated_at=? WHERE id=?").run(fence,hash(raw),now+300000,now,iso(),job.id);
    const row=db().prepare('SELECT providers_json,protocol_json FROM requests WHERE id=?').get(job.request_id) as Row;
    return{job:{id:job.id,requestId:job.request_id,leaseToken:raw,fencingToken:fence,providers:JSON.parse(row.providers_json),protocol:JSON.parse(row.protocol_json),limits:{maxPages:60,maxCandidates:30}}};
  }));
  // Read the stream with a real byte bound, not a trusted Content-Length header.
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'JSON required.');let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new ApiError(413,'Research payload too large.');}chunks.push(value);}
  let input:Row;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'JSON required.');}
  if(action==='complete'){
    const prior=db().prepare('SELECT * FROM preparation_jobs WHERE id=?').get(input.jobId||'') as Row|undefined;
    if(prior?.state==='prepared'&&prior.completion_hash===hash(JSON.stringify({providers:input.providers,discoveries:input.discoveries}))&&prior.fencing_token===input.fencingToken&&safeEqual(prior.completion_token_hash||'',hash(input.leaseToken||'')))return json({ok:true,status:'pending_review'});
  }
  return json(transaction(()=>{
    const job=active(input),row=db().prepare('SELECT * FROM requests WHERE id=?').get(job.request_id) as Row;
    if(action==='heartbeat'){db().prepare('UPDATE preparation_jobs SET lease_expires_at=?,heartbeat_at=? WHERE id=?').run(Date.now()+300000,Date.now(),job.id);return{ok:true};}
    if(action==='fail'){
      const code=['research_incomplete','research_unverified','research_timeout'].includes(input.code)?input.code:'research_failed';
      db().prepare("UPDATE preparation_jobs SET state='needs_review',error=?,lease_token_hash=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?").run(code,iso(),job.id);
      db().prepare("UPDATE requests SET status='needs_review',error='Could not verify five storefront deployments. The operator must complete the research before evaluation.',updated_at=? WHERE id=?").run(iso(),row.id);
      enqueueMail(`preparation:${job.id}:paused:${job.attempt}`,config().adminEmail,`Storefront research needs attention: ${JSON.parse(row.providers_json).map((p:Row)=>p.name).join(' vs. ')}`,`The research stage stopped (${code}) before any chat testing. Inspect the retained research evidence and supply verified deployments before approval.\n\nRequest: ${row.id}\n\nAlhena Research Lab`);return{ok:true,status:'needs_review'};
    }
    if(action!=='complete')throw new ApiError(404,'Preparation endpoint not found.');
    const providers=validateDiscoveries(input,JSON.parse(row.providers_json),job.created_at),raw=token(),now=iso();
    const receipt=Buffer.from(JSON.stringify({providers,discoveries:input.discoveries},null,2));const directory=path.join(config().dataDir,'preparation-evidence');fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const filename=path.join(directory,hash(receipt)+'.json');if(!fs.existsSync(filename))fs.writeFileSync(filename,receipt,{mode:0o600,flag:'wx'});
    db().prepare("UPDATE requests SET providers_json=?,status='pending_review',review_token_hash=?,review_expires_at=?,updated_at=?,error=NULL WHERE id=?").run(JSON.stringify(providers),hash(raw),Date.now()+604800000,now,row.id);
    db().prepare("UPDATE preparation_jobs SET state='prepared',lease_token_hash=NULL,lease_expires_at=NULL,completion_hash=?,completion_token_hash=?,updated_at=? WHERE id=?").run(hash(JSON.stringify({providers:input.providers,discoveries:input.discoveries})),hash(input.leaseToken),now,job.id);
    const user=db().prepare('SELECT name,email FROM users WHERE id=?').get(row.user_id) as Row;
    enqueueMail(`request:${row.id}:review`,config().adminEmail,`Review requested: ${providers.map(p=>p.name).join(' vs. ')}`,`The submitted three storefronts and two researched deployments per tool are ready for your review.\n\nRequester: ${user.name} <${user.email}>\n\n${providers.map(p=>`${p.name}:\n${p.customers.map(s=>`${s.name}: ${s.website}`).join('\n')}`).join('\n\n')}\n\nConfirm all five deployments before approving. Approval authorizes up to ${providers.length*515} chat turns, all ten core themes, blind policy-resolution audit, and automatic publication after server validation.\n\n${config().appUrl}/review/${raw}\n\nOpening the link does not approve the evaluation.\n\nAlhena Research Lab`);
    return{ok:true,status:'pending_review'};
  }));
}
