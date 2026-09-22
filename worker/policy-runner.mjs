import { prepareStorefront } from './storefront-setup.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertPolicyJob, EVIDENCE_SCHEMA, EXECUTION_PROFILE, QUESTION_MANIFEST, merchantId } from './policy-contract.mjs';
import { createPolicyCapturer } from './policy-capture-cache.mjs';
import { createPolicyInvoker } from './policy-call-cache.mjs';
import { validJudgeDiagnostic } from './judge-errors.mjs';
import { WorkerError } from './protocol.mjs';
import { startPublicProxy, validatePublicUrl } from './network.mjs';
import { launchCaptureBrowser, captureConversation } from './capture.mjs';
import { loadUpstream, sha256 } from './upstream.mjs';
import { providerStructuredResponse } from './model-provider.mjs';
import { qualityPackets, qualityPrimaryRequest, validateQualityPrimary, qualityAuditRequest } from './policy-quality.mjs';
import { makeRequest } from '../benchmark/policy-judge.mjs';
import { pcrPacket, validateAutomatedEvidence } from './policy-evidence.mjs';
import { publicHost } from './provider-fingerprint.mjs';

export async function capturePolicies(browser,store,signal) {
  const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',route=>{try{validatePublicUrl(route.request().url());return route.continue();}catch{return route.abort();}});
  const page=await context.newPage();page.on('popup',p=>p.close());
  const sources=[];
  try{
    await page.goto(store.website,{waitUntil:'domcontentloaded',timeout:45000});
    if(publicHost(store.website)==='gap.com')await prepareStorefront(page,{signal});
    const links=await page.locator('a[href]').evaluateAll(xs=>xs.map(a=>({url:a.href,text:a.innerText})));
    const urls=[...new Set(links.filter(a=>/return|refund|shipping|delivery|warranty|damag|contact|faq|help|support|cancel|order/i.test(a.text+' '+a.url)).map(a=>a.url))].filter(url=>{try{return (publicHost(url)===publicHost(store.website)||publicHost(url).endsWith('.'+publicHost(store.website)));}catch{return false;}}).slice(0,8);
    for(const url of urls){signal?.throwIfAborted();try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      if(!(publicHost(page.url())===publicHost(store.website)||publicHost(page.url()).endsWith('.'+publicHost(store.website))))continue;
      if(sources.some(s=>s.url===page.url()))continue;
      const text=(await page.locator('body').innerText()).slice(0,18000);
      if(text.length<100)continue;
      sources.push({id:`p-${sha256(merchantId(store)+'/'+page.url()).slice(0,24)}`,merchantId:merchantId(store),merchant:store.name,url:page.url(),retrievedAt:new Date().toISOString(),sha256:sha256(text),text,limitations:'Published page retrieved before evaluation. Reference text is bounded to 18,000 characters per page; missing provisions are unverified, not violations.'});
    }catch(error){if(signal?.aborted)throw error;}}
    if(!sources.length)throw new WorkerError('policy_sources_missing','No independent public merchant policies could be captured');
    return sources;
  }finally{await context.close();}
}
export async function runPolicyJob(job,api,{rootDirectory=process.env.WORKER_DATA_DIR||'./data',adapters=[],startProxy=startPublicProxy,launchBrowser=launchCaptureBrowser,capture=captureConversation,collectPolicies=capturePolicies,loadReference=loadUpstream,call=providerStructuredResponse,automaticModelRetries=2}={}){
  const plan=assertPolicyJob(job),lease={jobId:job.id,leaseToken:job.leaseToken,fencingToken:job.fencingToken};
  const directory=path.resolve(rootDirectory,String(job.id).replace(/[^a-zA-Z0-9_-]/g,'_'),`attempt-${job.fencingToken}`);await fs.mkdir(directory,{recursive:true,mode:0o700});
  const control=new AbortController();let beating=false,proxy,browser;
  const heartbeat=setInterval(async()=>{if(beating||control.signal.aborted)return;beating=true;try{await api('heartbeat',lease);}catch(e){control.abort(e);}finally{beating=false;}},20000);
  const timer=setTimeout(()=>control.abort(new WorkerError('job_budget_exceeded','Policy evaluation exceeded 24 hour limit')),86400000);
  const reuse=job.reusedEvidence||{captures:[],sources:[],judgments:[]};
  const evidence={schema:EVIDENCE_SCHEMA,protocol:'policy-resolution-v1',protocolSnapshotSha256:job.protocol.sha256,executionProfile:EXECUTION_PROFILE,questionManifest:QUESTION_MANIFEST,providers:job.providers,captures:[],sources:[],judgments:[]};
  const save=()=>fs.writeFile(path.join(directory,'evidence.private.json'),JSON.stringify(evidence,null,2),{mode:0o600});
  const cacheDirectory=path.resolve(directory,'..','validated-call-cache');await fs.mkdir(cacheDirectory,{recursive:true,mode:0o700});
  const invoke=createPolicyInvoker({cacheDirectory,fencingToken:job.fencingToken,signal:control.signal,call,automaticRetries:automaticModelRetries});
  const collectCapture=createPolicyCapturer({cacheDirectory,directory,fencingToken:job.fencingToken,signal:control.signal,capture,automaticRetries:2});
  try{
    const upstream=await loadReference();proxy=await startProxy();browser=await launchBrowser(proxy.url);
    control.signal.addEventListener('abort',()=>browser.close().catch(()=>{}),{once:true});
    for(const provider of job.providers)for(const store of provider.customers){
      const contexts=plan.filter(c=>c.provider===provider.name&&c.store===store.name);
      const reused=contexts.map(c=>reuse.captures.find(x=>x.id===c.id));
      if(reused.every(Boolean)){
        evidence.captures.push(...reused);evidence.judgments.push(...reuse.judgments.filter(j=>contexts.some(c=>c.id===j.captureId)));
        evidence.sources.push(...reuse.sources.filter(s=>s.merchantId===merchantId(store)));await save();continue;
      }
      const policyFile=path.join(cacheDirectory,merchantId(store)+'-policies.json');let policySources;
      try{policySources=JSON.parse(await fs.readFile(policyFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;policySources=await collectPolicies(browser,store,control.signal);await fs.writeFile(policyFile,JSON.stringify(policySources),{mode:0o600,flag:'wx'});}
      evidence.sources.push(...policySources);await save();
      for(const planned of contexts){
        control.signal.throwIfAborted();
        const captured=await collectCapture({browser,provider,store,mode:planned.mode,adapters,upstream,scenario:planned,policyProfile:true});
        evidence.captures.push(captured);await save();if(planned.guardrail)continue;
        const packet=qualityPackets(captured,upstream); let quality=null,pcrResult=null;
        if(packet.eligible){const primary=await invoke(qualityPrimaryRequest(packet,upstream.rubricText),planned.id+'-quality-primary');const audit=await invoke(qualityAuditRequest(packet,validateQualityPrimary(packet,primary.value),upstream.rubricText),planned.id+'-quality-audit');quality={primary,audit};}
        const pcr=pcrPacket(captured,evidence.sources);
        if(pcr.conversations[0].checkpoints.length){const primary=await invoke(makeRequest(pcr,'primary'),planned.id+'-pcr-primary'),audit=await invoke(makeRequest(pcr,'audit'),planned.id+'-pcr-audit');pcrResult={packet:pcr,primary,audit};}
        evidence.judgments.push({captureId:captured.id,rawSha256:captured.source_capture_sha256,quality,pcr:pcrResult});await save();
      }
    }
    validateAutomatedEvidence(evidence,{providers:job.providers,protocolSnapshotSha256:job.protocol.sha256,authorizedReuse:reuse,approvedAt:job.approvedAt,priorApprovals:job.priorApprovals,upstream});
    await api('complete',{...lease,evidence});return{status:'completed',jobId:job.id};
  }catch(error){const cause=control.signal.reason||error,code=/^[a-z_]+$/.test(cause.code||'')?cause.code:'policy_validation_failed',judge=validJudgeDiagnostic(cause.judgeDiagnostic);await fs.writeFile(path.join(directory,'failure.json'),JSON.stringify({code,message:cause.message,at:new Date().toISOString(),...(judge?{judge}:{})}),{mode:0o600});
    if(code!=='lease_lost')await api('fail',{...lease,code,message:`Evaluation stopped (${code}); private evidence retained.`,retryable:false}).catch(()=>{});return{status:'failed',code,jobId:job.id};
  }finally{clearInterval(heartbeat);clearTimeout(timer);await browser?.close().catch(()=>{});await proxy?.close();}
}
