import {test,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {db,closeDb} from '../lib/server/db.ts';import {hash} from '../lib/server/security.ts';import {handleApi} from '../lib/server/api.ts';import {adminCommand} from '../lib/server/admin.ts';import {policyProtocol} from '../lib/server/policy-automation.ts';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-mail-'));Object.assign(process.env,{DATA_DIR:directory,NODE_ENV:'test',MAIL_TRANSPORT:'file',APP_URL:'http://localhost:3000',WORKER_SECRET:'offline-worker-secret-at-least-32-characters'});after(()=>{closeDb();fs.rmSync(directory,{recursive:true,force:true});});
test('a later stop sends a new alert even when the administrative retry resets attempt count',async()=>{
 const now=new Date().toISOString(),protocol=JSON.stringify(policyProtocol()),providers=[{name:'Offline Tool',website:'https://tool.example/',customers:[1,2,3,4,5].map(n=>({name:`Offline Store ${n}`,website:`https://store${n}.example/`}))}];
 db().prepare("INSERT INTO users(id,email,name,created_at) VALUES('u','offline@business.example','Offline owner',?)").run(now);
 db().prepare("INSERT INTO requests(id,user_id,providers_json,status,created_at,updated_at,review_token_hash,review_expires_at,review_decision,reviewed_at,attribution_confirmed_at,protocol_json) VALUES('r','u',?,'running',?,?,'offline-review',?,'approve',?,?,?)").run(JSON.stringify(providers),now,now,Date.now()+60000,now,now,protocol);
 db().prepare("INSERT INTO jobs(id,request_id,state,protocol_json,attempt,fencing_token,lease_token_hash,lease_expires_at,available_at,created_at,updated_at) VALUES('j','r','running',?,1,1,?,?,0,?,?)").run(protocol,hash('offline-lease'),Date.now()+60000,now,now);
 async function fail(fence:number){return handleApi(new Request(process.env.APP_URL+'/api/worker/fail',{method:'POST',headers:{authorization:'Bearer '+process.env.WORKER_SECRET,'content-type':'application/json'},body:JSON.stringify({jobId:'j',leaseToken:'offline-lease',fencingToken:fence,code:'capture_outcome_unknown',message:'Offline fixture stopped',retryable:false})}));}
 assert.equal((await fail(1)).status,200);assert.equal((await fail(1)).status,409);
 await adminCommand('retry','r');
 db().prepare("UPDATE jobs SET state='running',attempt=1,fencing_token=2,lease_token_hash=?,lease_expires_at=? WHERE id='j'").run(hash('offline-lease'),Date.now()+60000);db().prepare("UPDATE requests SET status='running' WHERE id='r'").run();
 assert.equal((await fail(2)).status,200);
 const alerts=db().prepare("SELECT event_key FROM outbox WHERE event_key LIKE 'job:j:needs-review:%'").all();assert.equal(alerts.length,2);
 assert.equal(db().prepare("SELECT event_key FROM outbox WHERE event_key LIKE 'request:r:paused:%'").all().length,2);
});
