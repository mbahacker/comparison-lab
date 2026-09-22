import fs from 'node:fs/promises';
import path from 'node:path';
import { digest } from './policy-contract.mjs';
import { sha256 } from './upstream.mjs';
import { WorkerError } from './protocol.mjs';
import { transientBrowserReason } from './browser-recovery.mjs';
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value),{flag:'wx',mode:0o600});
const unknown=()=>new WorkerError('capture_outcome_unknown','An interrupted capture has no verified no-submission receipt; it cannot be replayed automatically.');
const conflict=()=>new WorkerError('resume_conflict','Retained capture recovery evidence does not match its intent.');
async function verifiedFailure(receipt,intent,jobRoot,id) {
  if(receipt?.schema!=='policy-capture-setup-failure/v1'||receipt.intentSha256!==digest(intent)||receipt.captureId!==id||receipt.submissionAttempts!==0)return false;
  const target=path.resolve(jobRoot,receipt.artifactPath||'');
  if(!target.startsWith(path.resolve(jobRoot)+path.sep))throw conflict();
  const bytes=await fs.readFile(target);if(sha256(bytes)!==receipt.artifactSha256)throw conflict();const artifact=JSON.parse(bytes);
  if(receipt.kind==='submission-journal')return artifact.version===1&&artifact.captureId===id&&artifact.phase==='setup'&&artifact.submissionAttempts===0&&['frame_detached','navigation_context_lost','page_closed'].includes(receipt.reason);
  // Explicit operator reconciliation for old captures made before send journals existed.
  // Null attribution plus a detached-frame setup failure in that collector precedes all sends.
  if(receipt.kind==='operator-confirmed-legacy-setup')return receipt.collectorRevision==='9336fae'&&artifact.id===id&&Array.isArray(artifact.turns)&&artifact.turns.length===0&&artifact.capture_metadata?.provider_attribution===null&&artifact.stop_reason?.code==='capture_error'&&/Frame was detached/i.test(artifact.stop_reason.message||'')&&typeof receipt.reviewedAt==='string';
  return false;
}
export function createPolicyCapturer({cacheDirectory,directory,fencingToken,signal,capture,automaticRetries=2}) {
  if(!Number.isInteger(automaticRetries)||automaticRetries<0||automaticRetries>2)throw Error('Automatic capture retries must be 0, 1 or 2');
  if(!Number.isInteger(fencingToken)||fencingToken<1)throw Error('Invalid capture fencing token');
  const jobRoot=path.dirname(cacheDirectory);
  return async args=>{
    const id=args.scenario.id,base=path.join(cacheDirectory,id+'-capture'),binding=digest({provider:args.provider,store:args.store,scenario:args.scenario});
    const cached=await read(base+'.json');
    if(cached){const raw=structuredClone(cached);delete raw.source_capture_sha256;if(cached.source_capture_sha256!==sha256(JSON.stringify(raw)))throw conflict();return cached;}
    for(let attempt=0;;attempt++) {
      signal?.throwIfAborted();
      const prefix=base+(attempt?`-retry-${attempt}`:''),intentFile=prefix+'-intent.json',failureFile=prefix+'-setup-failure.json';
      let intent=await read(intentFile);
      if(intent){
        if(intent.fencingToken!==undefined&&(!Number.isInteger(intent.fencingToken)||intent.fencingToken<1||intent.fencingToken>fencingToken))throw conflict();
        if(intent.id!==id||intent.contextSha256&&intent.contextSha256!==binding)throw conflict();
        const receipt=await read(failureFile);
        if(!receipt||!await verifiedFailure(receipt,intent,jobRoot,id))throw unknown();
        if(attempt>=automaticRetries)throw new WorkerError('capture_setup_retries_exhausted','Browser setup failed after bounded recovery; no questions were resent.');
        continue;
      }
      const captureDirectory=path.join(directory,'capture-attempts',id,String(attempt));await fs.mkdir(captureDirectory,{recursive:true,mode:0o700});
      intent={id,startedAt:new Date().toISOString(),fencingToken,contextSha256:binding};await write(intentFile,intent);
      try{
        const result=await capture({...args,jobDirectory:captureDirectory,signal});
        await write(base+'.json',result);return result;
      }catch(error){
        const recovery=error.captureRecovery,reason=transientBrowserReason(error);
        if(signal?.aborted||!reason||recovery?.version!==1||!recovery.safeToRetry||recovery.phase!=='setup'||recovery.submissionAttempts!==0||recovery.reason!==reason||recovery.journal!==id+'-submission-journal.json')throw error;
        const journalFile=path.join(captureDirectory,recovery.journal),journalBytes=await fs.readFile(journalFile),journal=JSON.parse(journalBytes);
        if(journal.version!==1||journal.captureId!==id||journal.phase!=='setup'||journal.submissionAttempts!==0)throw conflict();
        const receipt={schema:'policy-capture-setup-failure/v1',kind:'submission-journal',captureId:id,intentSha256:digest(intent),submissionAttempts:0,reason,artifactPath:path.relative(jobRoot,journalFile),artifactSha256:sha256(journalBytes),failedAt:new Date().toISOString()};
        await write(failureFile,receipt);
        if(attempt>=automaticRetries)throw new WorkerError('capture_setup_retries_exhausted','Browser setup failed after bounded recovery; no questions were resent.');
      }
    }
  };
}
