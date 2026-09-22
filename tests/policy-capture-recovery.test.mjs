import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createPolicyCapturer} from '../worker/policy-capture-cache.mjs';import {sha256} from '../worker/upstream.mjs';import {digest} from '../worker/policy-contract.mjs';
const args={provider:{name:'Offline fixture',website:'https://tool.example/'},store:{name:'Offline shop',website:'https://shop.example/'},scenario:{id:'fixture-context'}};
async function harness(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'capture-recovery-')),cacheDirectory=path.join(root,'validated-call-cache'),directory=path.join(root,'attempt-1');await fs.mkdir(cacheDirectory);await fs.mkdir(directory);try{await fn({root,cacheDirectory,directory});}finally{await fs.rm(root,{recursive:true,force:true});}}
const value=()=>{const c={id:'fixture-context',turns:[],note:'Offline test only'};return {...c,source_capture_sha256:sha256(JSON.stringify(c))};};
async function failSetup(a,attempts=0){const journal=a.scenario.id+'-submission-journal.json';await fs.writeFile(path.join(a.jobDirectory,journal),JSON.stringify({version:1,captureId:a.scenario.id,phase:attempts?'submission_attempted':'setup',submissionAttempts:attempts}));throw Object.assign(Error('locator.count: Frame was detached'),{captureRecovery:{version:1,safeToRetry:true,phase:'setup',submissionAttempts:0,reason:'frame_detached',journal}});}
test('detached setup retries in a fresh directory and preserves original intent and no-send proof',()=>harness(async h=>{
 let calls=0;const directories=[];const collect=createPolicyCapturer({...h,fencingToken:1,capture:async a=>{directories.push(a.jobDirectory);if(++calls===1)return failSetup(a);return value();}});
 await collect(args);assert.equal(calls,2);assert.notEqual(...directories);const before=await fs.readFile(path.join(h.cacheDirectory,'fixture-context-capture-intent.json'));
 await collect(args);assert.equal(calls,2);assert.deepEqual(await fs.readFile(path.join(h.cacheDirectory,'fixture-context-capture-intent.json')),before);
 assert.ok((await fs.readdir(h.cacheDirectory)).includes('fixture-context-capture-setup-failure.json'));
}));
test('ambiguous interruption or a send-attempt journal never authorizes another capture',()=>harness(async h=>{
 let calls=0;let collect=createPolicyCapturer({...h,fencingToken:1,capture:async a=>{calls++;return failSetup(a,1);}});
 await assert.rejects(()=>collect(args),/does not match/);collect=createPolicyCapturer({...h,fencingToken:2,capture:async()=>{calls++;return value();}});
 await assert.rejects(()=>collect(args),/cannot be replayed/);assert.equal(calls,1);
}));
test('automatic setup retries stay bounded across job restarts',()=>harness(async h=>{
 let calls=0;const options={...h,fencingToken:1,capture:async a=>{calls++;return failSetup(a);}};
 await assert.rejects(()=>createPolicyCapturer(options)(args),/bounded recovery/);assert.equal(calls,3);
 await assert.rejects(()=>createPolicyCapturer({...options,fencingToken:2})(args),/bounded recovery/);assert.equal(calls,3);
}));
test('only a hash-bound explicit reconciliation can resume a legacy known pre-send failure',()=>harness(async h=>{
 const id=args.scenario.id,intent={id,startedAt:new Date().toISOString()},raw={id,turns:[],capture_metadata:{provider_attribution:null},stop_reason:{code:'capture_error',message:'locator.count: Frame was detached'}};
 const artifact=JSON.stringify(raw);await fs.writeFile(path.join(h.directory,id+'.json'),artifact);await fs.writeFile(path.join(h.cacheDirectory,id+'-capture-intent.json'),JSON.stringify(intent));
 let calls=0;const collect=createPolicyCapturer({...h,fencingToken:4,capture:async()=>{calls++;return value();}});await assert.rejects(()=>collect(args),/cannot be replayed/);
 const receipt={schema:'policy-capture-setup-failure/v1',kind:'operator-confirmed-legacy-setup',captureId:id,intentSha256:digest(intent),submissionAttempts:0,artifactPath:'attempt-1/'+id+'.json',artifactSha256:sha256(artifact),collectorRevision:'9336fae',reviewedAt:new Date().toISOString()};
 await fs.writeFile(path.join(h.cacheDirectory,id+'-capture-setup-failure.json'),JSON.stringify(receipt));await collect(args);assert.equal(calls,1);
}));
test('invalid recovery limits and lease fences are rejected before capture',()=>{
 for(const automaticRetries of [-1,3,Infinity,0.5])assert.throws(()=>createPolicyCapturer({cacheDirectory:'/tmp/offline',directory:'/tmp/offline',fencingToken:1,automaticRetries}),/retries/);
 for(const fencingToken of [0,-1,Infinity,0.5])assert.throws(()=>createPolicyCapturer({cacheDirectory:'/tmp/offline',directory:'/tmp/offline',fencingToken}),/fencing/);
});
