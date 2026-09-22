#!/usr/bin/env node
// Reusable company-neutral offline aggregation. Never opens browsers, calls models, or changes source captures/scores.
// Scores use verbatim pinned gen.js function blocks in a disposable input snapshot.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateCohort } from './protocol.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const COMMIT='19b1420d2520d48baa52be81ac33fc4b9bd0ff8b';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('missing value for '+key);return args[i+1];};
const required=key=>{const value=option(key,null);if(!value)throw Error('Required option: '+key);return value;};
const workspace=path.resolve(required('--workspace'));
const sourceDirectory=path.resolve(required('--source'));
const scoresPath=path.resolve(option('--scores',path.join(workspace,'eval-scores.json')));
const label=option('--label','as-published');
if(!/^[a-z0-9-]{1,60}$/.test(label))throw Error('invalid label');
const output=path.resolve(option('--out',path.join(workspace,'aggregation',label)));
const partial=args.includes('--allow-partial');
const planPath=path.join(workspace,'study-manifest.json');
const planBytes=fs.readFileSync(planPath),plan=JSON.parse(planBytes);
const rosterBytes=fs.readFileSync(path.join(workspace,'study-roster.json')),roster=JSON.parse(rosterBytes);
validateCohort(plan,roster);
if(plan.upstreamCommit!==COMMIT||!/^\d{4}-\d{2}-\d{2}$/.test(plan.runDate))throw Error('study manifest incompatible with pinned source');
if(!Array.isArray(plan.contexts)||plan.contexts.some(x=>!(/^[a-z0-9][a-z0-9-]{0,250}$/.test(x.id||''))||!(/^[a-z0-9][a-z0-9-]{0,200}$/.test(x.storeKey||''))||!['shopping','support'].includes(x.mode)))throw Error('Invalid context identity');
const ids=new Set(plan.contexts.map(x=>x.id));
if(ids.size!==plan.contexts.length)throw Error('duplicate planned context');
const completionPath=path.join(workspace,'study-completion.json');
const rawManifestPath=path.join(workspace,'raw-manifest.json');
let completion=null,rawManifest=null;
if(!partial){
 completion=readJson(completionPath);const rawBytes=fs.readFileSync(rawManifestPath);rawManifest=JSON.parse(rawBytes);
 if(completion.rawManifestSha256!==sha(rawBytes)||rawManifest.studyManifestSha256!==sha(planBytes))throw Error('completed capture manifest hash mismatch');
 if(completion.studyId!==plan.studyId||completion.coreAttemptsFinished!==plan.expectedCoreConversations||completion.guardrailAttemptsFinished!==plan.expectedGuardrailConversations)throw Error('capture study is not complete');
}
const scoresBytes=fs.readFileSync(scoresPath),scores=JSON.parse(scoresBytes);
for(const [id,e]of Object.entries(scores)){
 if(!id.startsWith(plan.runDate+'/')||!ids.has(id.slice(11).replace(/\.json$/,'')))throw Error('foreign score outside study: '+id);
 if(typeof e.total!=='number'||!Number.isFinite(e.total)||e.total<0||e.total>100)throw Error('invalid score total: '+id);
}
const sourceManifestFile=readJson(path.join(HERE,'upstream-manifest.json'));
if(sourceManifestFile.commit!==COMMIT)throw Error('Pinned source manifest commit mismatch');
const manifest=sourceManifestFile.files;
const sourceManifest=[];
const readSource=name=>{
 const relative='runner/'+name;const bytes=fs.readFileSync(path.join(sourceDirectory,relative));
 const item=manifest.find(x=>x.path===relative);if(!item||item.sha256!==sha(bytes))throw Error('pinned upstream source hash mismatch: '+relative);
 sourceManifest.push({path:relative,sha256:sha(bytes)});return bytes;
};
const gen=readSource('gen.js').toString('utf8');
function block(start,end){const a=gen.indexOf(start),b=gen.indexOf(end,a);if(a<0||b<0)throw Error('pinned source extraction marker missing');return gen.slice(a,b);}
const prefix=gen.slice(0,gen.indexOf('// SPLIT PAYLOAD for load speed:'));
if(!prefix.includes('const SUPPORT = await buildMode("support");'))throw Error('aggregation prefix incomplete');
const laneBlock=block('const speedScoreG = speedScore;','const D_OBJ = {};');
const rankBlock=block('const laneRank = (scores, w) =>','// A rank is shared on a tie');
const exportBlock=`\nexport { STORES, SUPPORT, shopS, supS, rShop, rSupp, rOverall, OVERALL, DATES, RANK_CUTOFF, LATEST, MIN_RANK_CONVS };\n`;
const extracted=prefix+'\n'+laneBlock+'\n'+rankBlock+exportBlock;
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'full-benchmark-aggregate-'));
const inputManifest=[],records=[],missing=[];
try{
 fs.writeFileSync(path.join(scratch,'package.json'),'{"type":"module"}\n');
 fs.writeFileSync(path.join(scratch,'vendors.js'),'export const STORES = '+JSON.stringify(roster)+';\n');
 fs.writeFileSync(path.join(scratch,'eval-scores.json'),scoresBytes);
 fs.writeFileSync(path.join(scratch,'gen-extract.mjs'),extracted);
 const deps=['pools.js','classify.js','reply-clean.js','turn-quality.js','conversation-quarantine.js','conversation-quarantine.json','product-recommendation-bars.js','message-style.js','ranking-window.js','lane-weights.js','composite-ci.js','conversation-outcome.js'];
 for(const name of deps)fs.writeFileSync(path.join(scratch,name),readSource(name));
 const rawDir=path.join(scratch,'results',plan.runDate,'conv');fs.mkdirSync(rawDir,{recursive:true});
 const seenRaw=new Set();
 for(const context of plan.contexts){
  const relative=`results/${plan.runDate}/conv/${context.id}.json`,source=path.join(workspace,relative);
  if(!fs.existsSync(source)){missing.push(context.id);continue;}
  const bytes=fs.readFileSync(source),record=JSON.parse(bytes);
  if(record.key!==context.storeKey||record.vendor!==context.provider||record.mode!==context.mode||record.theme!==context.theme||record.date!==plan.runDate||!Array.isArray(record.turns))throw Error('record identity mismatch: '+context.id);
  const hash=sha(bytes),pinned=rawManifest?.files.find(x=>x.id===context.id);
  if(!partial&&(!pinned||pinned.sha256!==hash))throw Error('raw capture changed after completion: '+context.id);
  fs.writeFileSync(path.join(rawDir,context.id+'.json'),bytes);
  records.push({context,record});seenRaw.add(context.id);
  inputManifest.push({path:relative,sha256:hash});
 }
 if(!partial&&missing.length)throw Error('missing planned captures: '+missing.join(','));
 for(const name of fs.readdirSync(path.join(workspace,'results',plan.runDate,'conv'))){
  if(name.endsWith('.json')&&!ids.has(name.slice(0,-5)))throw Error('unexpected capture outside frozen plan: '+name);
 }
 // Subprocess executes pinned aggregation only; no report write section, browser imports or model code.
 const boot=`import fs from 'node:fs';import * as g from './gen-extract.mjs';fs.writeFileSync('./aggregation.json',JSON.stringify(g));`;
 fs.writeFileSync(path.join(scratch,'extract-result.mjs'),boot);
 const child=spawnSync(process.execPath,[path.join(scratch,'extract-result.mjs')],{cwd:scratch,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,env:{PATH:process.env.PATH||''}});
 if(child.status!==0)throw Error('upstream aggregation failed: '+(child.stderr||child.stdout).slice(-2000));
 const result=readJson(path.join(scratch,'aggregation.json'));
 const {deriveOutcome}=await import(pathToFileURL(path.join(scratch,'conversation-outcome.js')).href);
 const {convoValidity,connectivityFail,guardrailLeak}=await import(pathToFileURL(path.join(scratch,'classify.js')).href);
 const {isQuarantinedConversation}=await import(pathToFileURL(path.join(scratch,'conversation-quarantine.js')).href);
 const ledger=records.map(({context,record})=>{
  const id=plan.runDate+'/'+context.id+'.json';let exclusion=null;
  if(isQuarantinedConversation(id))exclusion='quarantined';else if(context.guardrail)exclusion='guardrail';else if(connectivityFail(record.turns))exclusion='connectivity_failure';else if(record.gate_blocked)exclusion='login_gate';else if(record.provider_mismatch)exclusion='provider_mismatch';
  const derived=structuredClone(record);const outcome=exclusion?null:deriveOutcome(derived).outcome;
  const timing=convoValidity(derived.turns);
  return {id,provider:context.provider,store:context.store,mode:context.mode,theme:context.theme,guardrail:context.guardrail,capturedAt:record.capturedAt||null,exclusion,outcome,latencyEligible:!exclusion&&record.valid!==false&&timing.valid,timedTurns:timing.timed,recordedTurns:record.turns.length,unsentTurns:record.turns.filter(t=>t.unsent).length,judged:scores[id]?.total!=null,quality:scores[id]?.total??null,officialCoverageEligible:record.valid!==false&&record.turns.length>0,...(context.guardrail?{guardrailFinding:guardrailLeak(record.turns)}:{})};
 });
 const coverageRows=ledger.filter(x=>x.officialCoverageEligible),coreCoverageRows=coverageRows.filter(x=>!x.guardrail);
 const coverage=a=>({eligible:a.length,judged:a.filter(x=>x.judged).length,percent:a.length?Math.round(100*a.filter(x=>x.judged).length/a.length):0});
 const officialCoverage=coverage(coverageRows),coreCoverage=coverage(coreCoverageRows);
 const component=(name,sc,laneRows,ranking)=>({provider:name,...(sc||{}),rankable:!!sc,composite:ranking.find(x=>x.v===name)?.comp??null,outcomes:laneRows.reduce((a,r)=>{if(r.outcome)a[r.outcome]=(a[r.outcome]||0)+1;return a;},{automated:0,handover:0,deflected:0,no_answer:0}),capturedAttempts:laneRows.length,excludedAttempts:laneRows.filter(r=>r.exclusion).length,latencyValidConversations:laneRows.filter(r=>r.latencyEligible).length,judgeScored:laneRows.filter(r=>r.judged).length});
 const providers=Array.from(new Set(roster.map(x=>x.vendor))).map(name=>({name,shopping:component(name,result.shopS[name],ledger.filter(x=>x.provider===name&&x.mode==='shopping'&&!x.guardrail),result.rShop),support:component(name,result.supS[name],ledger.filter(x=>x.provider===name&&x.mode==='support'),result.rSupp),overall:result.OVERALL[name]||null}));
 const aggregate={schema:'full-benchmark-study-aggregation/v1',studyId:plan.studyId,generatedAt:new Date().toISOString(),label,sourceCommit:COMMIT,primaryPath:'Pinned gen.js loadAgg → buildMode → laneScores → laneRank → OVERALL, exact extracted source blocks',scope:'Fresh selected-storefront study; not historical leaderboard replication',partial:partial||missing.length>0,missing,rankingWindow:{days:90,latest:result.LATEST,cutoff:result.RANK_CUTOFF},coverage:{officialAllValid:officialCoverage,coreOnly:coreCoverage,officialCoverageGatePassed:officialCoverage.eligible===0||officialCoverage.percent>=90},providers,ledger,guardrails:ledger.filter(x=>x.guardrail),bakedRows:{shopping:result.STORES,support:result.SUPPORT},provenance:{scoresPath,scoresSha256:sha(scoresBytes),studyManifestSha256:sha(planBytes),rosterSha256:sha(rosterBytes),rawManifestSha256:completion?.rawManifestSha256||null,extractedAggregationSha256:sha(extracted),sourceFiles:sourceManifest,inputs:inputManifest}};
 fs.mkdirSync(output,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(output,'aggregation.json'),JSON.stringify(aggregate,null,2)+'\n',{mode:0o600});
 fs.writeFileSync(path.join(output,'gen-extract.mjs'),extracted,{mode:0o600});
 const lines=['# Private full-benchmark study aggregation','',`Study: ${plan.studyId}. Variant: ${label}. Generated: ${aggregate.generatedAt}.`,`Primary: pinned ${COMMIT} gen.js homepage arithmetic.`,`Capture completion: ${partial?'PARTIAL DIAGNOSTIC ONLY': 'all registered attempts present and hashes verified'}. Official score coverage: ${officialCoverage.judged}/${officialCoverage.eligible} (${officialCoverage.percent}%).`,'','| Provider | Lane | Valid conversations | Automation | Quality | Full answer seconds | Composite | CI ± |','|---|---|---:|---:|---:|---:|---:|---:|'];
 for(const p of providers)for(const lane of ['shopping','support']){const x=p[lane];lines.push(`| ${p.name} | ${lane} | ${x.latencyValidConversations} | ${x.a??'—'} | ${x.q??'—'} | ${x.l??'—'} | ${x.composite??'unranked'} | ${x.ci??'—'} |`);}
 lines.push('','Overall: '+providers.map(p=>p.name+' '+(p.overall?.score??'unranked')).join('; ')+'.','','Guardrails are separate and do not contribute to automation, quality, speed or composites. Unranked means pinned gen.js eligibility was not met. All excluded/no-answer/unsent evidence is retained in aggregation.json. This is not independent validation of the historical public leaderboard.');
 fs.writeFileSync(path.join(output,'summary.md'),lines.join('\n')+'\n',{mode:0o600});
 console.log(JSON.stringify({output,partial:aggregate.partial,providers:providers.map(p=>({name:p.name,shopping:p.shopping.composite,support:p.support.composite,overall:p.overall?.score??null})),coverage:aggregate.coverage},null,2));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
