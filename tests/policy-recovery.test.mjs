import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {runPolicyJob} from '../worker/policy-runner.mjs';
import {CHECKS} from '../worker/policy-quality-spec.mjs';
import {WorkerError} from '../worker/protocol.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
const provider={name:'Offline Fixture',website:'https://fixture.example',customers:[1,2,3,4,5].map(n=>({name:`Store ${n}`,website:`https://store-${n}.example/`}))};
const job={id:'offline-recovery',leaseToken:'offline-lease',fencingToken:1,protocol:{id:'policy-resolution-v1',sha256:'a'.repeat(64)},providers:[provider]};
const upstream={rubricText:'Offline software fixture, no real model calls',normalizeUserMessage:s=>s,stripWidgetChrome:s=>s,convoSignals:()=>({})};
function captureFixture({scenario:s}) {
  const c={id:s.id,vendor:s.provider,store:s.store,mode:s.mode,theme:s.theme,url:s.website,captured_at:new Date().toISOString(),turns:s.questions.map((q,i)=>({turn:i+1,question:q,reply:'This is an offline software fixture response used only to check interrupted-run recovery.',speaker:'ai',submitted:true,assessable:true,response_complete:true,complete_ms:3000,author_verified:true}))};
  c.source_capture_sha256=sha(JSON.stringify(c));return c;
}
async function harness(fn) {
  const rootDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'policy-recovery-'));
  const events=[];
  const defaults={rootDirectory,automaticModelRetries:0,startProxy:async()=>({url:'http://unused.example',close:async()=>{}}),launchBrowser:async()=>({close:async()=>{}}),collectPolicies:async()=>[],loadReference:async()=>upstream};
  try{await fn(defaults,async(route,data)=>events.push({route,data}),events);}finally{await fs.rm(rootDirectory,{recursive:true,force:true});}
}
test('retry retains completed capture and model response; ambiguous audit is not called again',async()=>harness(async(defaults,api)=>{
  let captures=0,calls=0;
  const options={...defaults,capture:async args=>{captures++;return captureFixture(args);},call:async()=>{
    if(++calls===2)throw Error('Simulated lost audit response');
    return {value:{checks:Object.fromEntries(CHECKS.shopping.map(id=>[id,{pass:false,evidence:''}])),resolution_class:'failed',learning:'Offline fixture.'},metadata:{response_id:'offline-primary'}};
  }};
  assert.equal((await runPolicyJob(job,api,options)).status,'failed');
  assert.equal(captures,1);assert.equal(calls,2);
  const second=await runPolicyJob({...job,fencingToken:2},api,options);
  assert.equal(second.code,'model_outcome_unknown');assert.equal(captures,1);assert.equal(calls,2);
}));
test('interrupted capture is retained as unknown and cannot be silently replayed',async()=>harness(async(defaults,api)=>{
  let captures=0;
  const options={...defaults,capture:async()=>{captures++;throw Error('Simulated browser interruption');},call:async()=>{throw Error('Must not call a model');}};
  await runPolicyJob(job,api,options);
  const second=await runPolicyJob({...job,fencingToken:2},api,options);
  assert.equal(second.code,'capture_outcome_unknown');assert.equal(captures,1);
}));
test('authorized retry repeats only the definitively rejected audit and retains the captured conversation and primary',async()=>harness(async(defaults,api)=>{
  let captures=0,calls=0;
  const primary={value:{checks:Object.fromEntries(CHECKS.shopping.map(id=>[id,{pass:false,evidence:''}])),resolution_class:'failed',learning:'Offline fixture.'},metadata:{response_id:'offline-primary'}};
  const options={...defaults,capture:async args=>{captures++;return captureFixture(args);},call:async()=>{
    calls++;
    if(calls===1)return primary;
    if(calls===2)throw Object.assign(new WorkerError('model_request_failed','Private judge returned 422 (invalid_structured_output)'),{judgeDiagnostic:{status:422,code:'invalid_structured_output'}});
    if(calls===3)return {value:{fixture:'audit'},metadata:{response_id:'offline-audit'}};
    throw Error('Stop fixture at the first new PCR call');
  }};
  assert.equal((await runPolicyJob(job,api,options)).code,'model_request_failed');
  const cache=path.join(defaults.rootDirectory,job.id,'validated-call-cache');
  const filenames=await fs.readdir(cache),primaryFile=filenames.find(name=>name.includes('-quality-primary-')&&name.endsWith('-response.json'));
  const primaryBytes=await fs.readFile(path.join(cache,primaryFile),'utf8');
  const failure=JSON.parse(await fs.readFile(path.join(defaults.rootDirectory,job.id,'attempt-1','failure.json'),'utf8'));
  assert.deepEqual(failure.judge,{status:422,code:'invalid_structured_output'});
  await runPolicyJob({...job,fencingToken:2},api,options);
  assert.equal(captures,1);assert.equal(calls,4);
  assert.equal(await fs.readFile(path.join(cache,primaryFile),'utf8'),primaryBytes);
  assert.equal((await fs.readdir(cache)).filter(name=>name.includes('-quality-audit-')&&name.endsWith('-retry-1-request.json')).length,1);
  assert.equal((await fs.readdir(cache)).filter(name=>name.includes('-quality-audit-')&&name.endsWith('-response.json')).length,1);
}));
