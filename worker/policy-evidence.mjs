import { AUTHOR_MARKERS } from './authorship.mjs';
import { EVIDENCE_SCHEMA, EXECUTION_PROFILE, QUESTION_MANIFEST, digest, makePolicyPlan, checkCallMetadata, merchantId } from './policy-contract.mjs';
import { makeRequest, mergeBlindJudgments } from '../benchmark/policy-judge.mjs';
import { qualityPackets, qualityPrimaryRequest, validateQualityPrimary, qualityAuditRequest, mergeQuality } from './policy-quality.mjs';
import { criteriaFor } from './protocol.mjs';
import { sha256 } from './upstream.mjs';
import { observedProviderUrls, publicHost } from './provider-fingerprint.mjs';
const same=(a,b)=>digest(a)===digest(b);
export function pcrPacket(capture,sources) {
  return { conversations:[{ key:capture.id, merchantId:capture.merchantId, mode:capture.mode,theme:capture.theme,
    policySources:sources.filter(s=>s.merchantId===capture.merchantId).map(s=>({id:s.id,merchantId:s.merchantId,text:s.text})),
    checkpoints:capture.turns.filter(t=>t.submitted&&t.assessable).map(t=>({turn:t.turn,question:t.question,response:t.reply,expectedOutcome:`Address the shopper's request: ${t.question}`,attempted:true,assessable:true})) }] };
}
export function validateAutomatedEvidence(evidence,{providers,protocolSnapshotSha256,authorizedReuse={captures:[],sources:[],judgments:[]},approvedAt,now=new Date(),upstream}) {
  if(evidence?.schema!==EVIDENCE_SCHEMA||evidence.protocol!=='policy-resolution-v1'||evidence.protocolSnapshotSha256!==protocolSnapshotSha256||!same(evidence.executionProfile,EXECUTION_PROFILE)||!same(evidence.questionManifest,QUESTION_MANIFEST))throw Error('Unsupported or unfrozen automated evidence');
  if (!same(evidence.providers,providers)) throw Error('Provider metadata differs from approved request');
  const plan=makePolicyPlan(providers), captures=evidence.captures, judgments=evidence.judgments, sources=evidence.sources;
  if(!Array.isArray(captures)||captures.length!==plan.length||!Array.isArray(judgments)||judgments.length!==plan.filter(c=>!c.guardrail).length||!Array.isArray(sources)||!sources.length||sources.length>providers.length*50)throw Error('Incomplete capture or judgment cohort');
  if(new Set(captures.map(c=>c.id)).size!==captures.length||new Set(judgments.map(j=>j.captureId)).size!==judgments.length||new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Duplicate evidence');
  const freshDate=(value,reused)=>{const date=+new Date(value);if(!Number.isFinite(date)||date>+now||date<(reused?+now-30*86400000:+new Date(approvedAt)))throw Error('Evidence outside authorized date range');};
  for(const s of sources){
    const store=providers.flatMap(p=>p.customers).find(st=>merchantId(st)===s.merchantId);
    if(!store||typeof s.text!=='string'||!s.text.trim()||s.text.length>100000||s.sha256!==sha256(s.text)||!(publicHost(s.url)===publicHost(store.website)||publicHost(s.url).endsWith('.'+publicHost(store.website))))throw Error('Invalid independent merchant policy source');
    freshDate(s.retrievedAt,authorizedReuse.sources.some(x=>same(x,s)));
  }
  const records=[],guardrails=[],sessions=new Set();
  for(const expected of plan){
    const c=captures.find(c=>c.id===expected.id),provider=providers.find(p=>p.name===expected.provider);
    if(!c||c.vendor!==expected.provider||c.store!==expected.store||c.url!==new URL(expected.website).href||c.mode!==expected.mode||c.theme!==expected.theme||c.merchantId!==expected.merchantId||c.turns?.length!==expected.planned)throw Error('Capture differs from approved cohort');
    const raw=structuredClone(c);delete raw.source_capture_sha256;
    if(c.source_capture_sha256!==sha256(JSON.stringify(raw)))throw Error('Capture hash mismatch');
    const reused=authorizedReuse.captures.some(x=>same(x,c));freshDate(c.captured_at,reused);
    if(!c.capture_metadata?.provider_attribution?.verified||!observedProviderUrls(provider,c.capture_metadata.provider_attribution.observed_urls||[]).length)throw Error('Unverified provider attribution');
    for(const [i,t]of c.turns.entries()) {
      if(t.turn!==i+1||t.question!==expected.questions[i]||typeof t.reply!=='string'||typeof t.submitted!=='boolean'||typeof t.assessable!=='boolean'||!['submitted','not_submitted','unknown'].includes(t.observationState)||t.observationState==='not_submitted'&&t.submitted||t.observationState==='submitted'&&!t.submitted||t.assessable&&(!t.submitted||t.observationState!=='submitted'))throw Error('Invalid checkpoint observation mask');
      if(t.assessable&&t.reply){
        const author=t.author_evidence;
        if(!t.author_verified||!author||t.speaker!=='ai'||author.provider!==c.vendor||author.adapter_id!==c.capture_metadata.adapter||!Number.isInteger(author.message_count)||author.message_count<1||!author.selector||!Array.isArray(author.markers)||!author.markers.length)throw Error('Unattributed assessed reply');
        if(author.kind==='dom-ai-author'){if(author.markers.some(m=>!AUTHOR_MARKERS[m.attribute]?.includes(m.value)))throw Error('Unknown AI author marker');}
        else if(author.kind==='reviewed-bot-selector'){if(c.capture_metadata.adapter==='generic-visible-chat-v1'||author.markers.some(m=>m.attribute!=='reviewed-selector'||m.value!==author.selector))throw Error('Unreviewed assistant selector');}
        else throw Error('Unknown AI author evidence');
      }
      if(t.assessable&&!t.reply&&(t.speaker!=='none'||c.stop_reason?.code!=='capture_timeout'||!t.submission_confirmed))throw Error('Unconfirmed no-response checkpoint');
      if(t.complete_ms!==null&&(!Number.isFinite(t.complete_ms)||t.complete_ms<0||t.complete_ms>120000||!t.response_complete||!t.author_verified))throw Error('Invalid measured timing');
      if(!t.submitted&&(t.reply||t.complete_ms!==null||t.assessable))throw Error('Unsent checkpoint has evidence');
    }
    if(expected.guardrail){guardrails.push({id:c.id,provider:c.vendor,store:c.store,capturedAt:c.captured_at,rawSha256:c.source_capture_sha256,quality:null,turns:c.turns.map(t=>({turn:t.turn,question:t.question,reply:t.reply,completeMs:t.complete_ms,actor:t.speaker,unsent:!t.submitted,observationState:t.observationState,limitation:t.observationReason}))});continue;}
    const j=judgments.find(j=>j.captureId===c.id);
    if(!j||j.rawSha256!==c.source_capture_sha256)throw Error('Judgment capture binding mismatch');
    const reusedJudge=authorizedReuse.judgments.some(x=>same(x,j));if(reused!==reusedJudge)throw Error('Reuse must preserve original capture and judgments together');
    const q=qualityPackets(c,upstream),packet=pcrPacket(c,sources),calls=[];
    let result=null,merged=null;
    if(q.eligible){
      if(!j.quality)throw Error('Missing eligible quality judgment');
      const qr=qualityPrimaryRequest(q,upstream.rubricText),qa=qualityAuditRequest(q,validateQualityPrimary(q,j.quality.primary.value),upstream.rubricText);
      calls.push([j.quality.primary,qr],[j.quality.audit,qa]);
      result=mergeQuality(q,j.quality.primary.value,j.quality.audit.value,upstream);
    }else if(j.quality!==null)throw Error('Ineligible capture must not receive a quality score');
    if(packet.conversations[0].checkpoints.length){
      if(!j.pcr||!same(packet,j.pcr.packet))throw Error('PCR packet differs from source observations');
      calls.push([j.pcr.primary,makeRequest(packet,'primary')],[j.pcr.audit,makeRequest(packet,'audit')]);
      merged=mergeBlindJudgments(packet,j.pcr.primary.value,j.pcr.audit.value).conversations[0];
    }else if(j.pcr!==null)throw Error('Unassessable capture must not receive PCR judgments');
    for(const [call,request]of calls){checkCallMetadata(call.metadata,request,sessions);freshDate(call.metadata.created_at,reusedJudge);}
    const checks=result?Object.fromEntries(Object.entries(result.checks).map(([id,v])=>[id,{pass:v.pass,evidence:v.evidence}])):null;
    records.push({id:c.id,provider:c.vendor,store:c.store,merchantId:c.merchantId,mode:c.mode,theme:c.theme,planned:10,capturedAt:c.captured_at,rawSha256:c.source_capture_sha256,correctedCapture:false,policyIds:sources.filter(s=>s.merchantId===c.merchantId).map(s=>s.id),quality:result?.total??null,
      qualityEvidence:result?{total:result.total,checks,provenance:'fresh-automated-quality',auditCoverage:'Every criterion; full-transcript adversarial audit',criteria:Object.fromEntries(criteriaFor(c.mode).map(k=>[k.id,{pass:checks[k.id].pass,evidence:checks[k.id].evidence,weight:k.points,signalGate:k.signal_gate||null,signalSatisfied:!k.signal_gate||!!q.signals[k.signal_gate],awardedPoints:checks[k.id].pass&&(!k.signal_gate||q.signals[k.signal_gate])?k.points:0}]))}:null,latencyMs:c.turns.filter(t=>t.complete_ms!==null&&t.author_verified).map(t=>t.complete_ms),
      checkpoints:c.turns.map(t=>({...t,completeMs:t.complete_ms,primary:merged?.checkpoints.find(x=>x.turn===t.turn)?.primary??null,audit:merged?.checkpoints.find(x=>x.turn===t.turn)?.audit??null}))});
  }
  return {records,expectedContexts:plan.filter(c=>!c.guardrail),providers:providers.map(p=>({id:`tool-${sha256(publicHost(p.website)).slice(0,16)}`,name:p.name,website:p.website})),sources,guardrails,executionProfile:EXECUTION_PROFILE};
}
