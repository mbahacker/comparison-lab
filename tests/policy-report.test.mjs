import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderPolicyReport } from '../benchmark/policy-report.mjs';

test('interactive evidence artifact escapes untrusted text and contains its own offline policy', () => {
  const hostile = '</script><img src=x onerror=alert(1)>';
  const metric = { value: null, explanation: hostile };
  const lane = { composite: metric, policyResolution: metric, quality: metric, speed: metric, coverage: { plannedCheckpoints: 10, attemptedCheckpoints: 0, observedCheckpoints: 0, submittedCheckpoints: 0, assessedCheckpoints: 0, attainedCheckpoints: 0, policyUnverifiedCheckpoints: 0, includedContexts: 0, excludedContexts: 1, repairedCaptures: 0 } };
  const evidence = { conversations: [{ provider: hostile, turns: [{ reply: hostile }] }], policySources: [] };
  const summary = { protocol: 'policy-resolution-v1', providers: [{ name: hostile, shopping: lane, support: lane }], title: hostile, description: hostile, limitations: [hostile], audit: { description: hostile, limitations: [] }, method: { sha256: 'a'.repeat(64) } };
  const html = renderPolicyReport({ summary, evidence, methodText: hostile });
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  const embedded = html.match(/<script type="application\/json" id="study-data">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded), evidence);
  const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(js));
  assert.ok(!js.includes('.innerHTML'));
  assert.match(html, /Not eligible/);
  lane.coverage.plannedCheckpoints = hostile;
  assert.throws(() => renderPolicyReport({ summary, evidence, methodText: '' }), /invalid shopping coverage/);
  lane.coverage.plannedCheckpoints = 10;
  delete lane.coverage.assessedCheckpoints;
  assert.throws(() => renderPolicyReport({ summary, evidence, methodText: '' }), /assessedCheckpoints/);
});

test('review-only report exposes storefronts and lazily renders observation and criterion provenance safely', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const metric = { value: 50, explanation: 'Fixture only' };
  const lane = { composite: metric, policyResolution: metric, quality: metric, speed: metric, coverage: { plannedCheckpoints: 10, submittedCheckpoints: 3, assessedCheckpoints: 3, attainedCheckpoints: 1, policyUnverifiedCheckpoints: 2, includedContexts: 1, excludedContexts: 0, repairedCaptures: 1 } };
  const summary = { protocol: 'policy-resolution-v1', providers: [{ name: 'Fixture', shopping: lane, support: lane, overallComposite: { value: 42.3, explanation: 'Equal lane means' } }], title: 'Software fixture', description: '', limitations: [], audit: { description: '', limitations: [] }, method: { sha256: 'a'.repeat(64) } };
  const quality = { total: 0, provenance: 'fresh-repair-quality', auditCoverage: 'Every criterion audited; full replies', checks: { s_outcome: { pass: true, evidence: hostile } }, criteria: { s_outcome: { weight: 12, signalGate: 'no_deflect', signalSatisfied: false, awardedPoints: 0 } } };
  const evidence = { conversations: [{ provider: 'Fixture', store: 'Store', mode: 'support', theme: 'returns', quality, turns: [{ turn: 1, question: 'Question', reply: '', observationState: 'unknown', observationReason: hostile, completeMs: null }] }], policySources: [],
    storefrontResults: [{ provider: 'Fixture', store: hostile, mode: 'support', resolution: 50, quality: 0, completionSeconds: 5, scoredConversations: 1, plannedConversations: 5, submittedCheckpoints: 3, plannedCheckpoints: 50, assessableCheckpoints: 3, attainedCheckpoints: 1 }],
    guardrails: [{ provider: 'Fixture', store: 'Store', rawSha256: 'b'.repeat(64), provenance: 'Unchanged original capture', quality: { ...quality, provenance: 'original-source-quality', auditCoverage: 'Not sampled in original audit' }, turns: [{ turn: 1, question: 'Fixture guard', reply: '', unsent: true, limitation: hostile }] }],
    repairSelections: { selectionRule: 'Cause-selected fixture', sourceClassificationNote: 'Original detector classification is being corrected.', candidates: [{ provider: 'Fixture', store: 'Store', mode: 'support', theme: 'returns', reason: 'Fixture handover match', originalSubmittedTurns: 1, receiptSha256: 'c'.repeat(64), originalRawSha256: 'a'.repeat(64), newRawSha256: 'b'.repeat(64), originalCapturedAt: '2026-09-21T00:00:00Z', originalFlaggedStop: { turn: 1, question: 'Original question', reply: hostile, sourceActorLabel: 'human', handoverHit: hostile } }] } };
  const html = renderPolicyReport({ summary, evidence, methodText: '' });
  assert.match(html, /Unpublished review copy/); assert.match(html, /Storefront results/); assert.match(html, /Guardrail observations/);
  assert.match(html, /Overall composite/); assert.match(html, /42\.3<small> \/ 100 composite/); assert.match(html, /Equal lane means/);
  assert.match(html, /Why these conversations were rerun/);
  assert.ok(html.includes('&lt;img src=x')); assert.ok(!html.includes('<img src=x'));
  assert.ok(!renderPolicyReport({ summary, evidence, methodText: '', reviewOnly: false }).includes('Unpublished review copy'));
  assert.throws(() => renderPolicyReport({ summary, evidence, methodText: '', reviewOnly: 'false' }), /boolean/);
  class Node {
    constructor(tag='div'){ this.tag=tag; this.children=[]; this.listeners={}; this.value=''; this.text=''; }
    set textContent(v){ this.text=String(v); this.children=[]; }
    get textContent(){ return this.text+this.children.map(n=>n.textContent).join(' '); }
    append(...nodes){ this.children.push(...nodes); }
    replaceChildren(...nodes){ this.children=nodes; }
    addEventListener(name, callback){ this.listeners[name]=callback; }
  }
  const ids=Object.fromEntries(['study-data','provider','lane','search','count','conversations','guardrail-records','repair-records','sources'].map(id=>[id,new Node()]));
  ids['study-data'].textContent=JSON.stringify(evidence);
  const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(js,{document:{getElementById:id=>ids[id],createElement:tag=>new Node(tag)},URL});
  const conversation=ids.conversations.children[0];assert.equal(conversation.children.length,1,'detail content remains lazy');
  conversation.open=true;conversation.listeners.toggle();
  assert.match(conversation.textContent,/Submission or observation is unknown/);assert.ok(!conversation.textContent.includes('No observed answer'));
  assert.match(conversation.textContent,/fresh-repair-quality/);assert.match(conversation.textContent,/full replies/);assert.match(conversation.textContent,/no_deflect: not satisfied/);assert.match(conversation.textContent,/Awarded points/);assert.ok(conversation.textContent.includes(hostile),'hostile input remains text');
  const g=ids['guardrail-records'].children[0];assert.equal(g.children.length,1);g.open=true;g.listeners.toggle();assert.match(g.textContent,/Unchanged original capture/);assert.match(g.textContent,/Not sampled in original audit/);assert.match(g.textContent,/Not submitted; no response outcome inferred/);
  const repair=ids['repair-records'].children[0];assert.equal(repair.children.length,1);repair.open=true;repair.listeners.toggle();assert.match(repair.textContent,/Original captured actor label: human/);assert.match(repair.textContent,/see selection reason for the boundary being corrected/);assert.match(repair.textContent,/Earlier submission attempts excluded from scores: 1/);assert.ok(repair.textContent.includes('Correction receipt SHA-256: '+'c'.repeat(64)));assert.ok(repair.textContent.includes(hostile));
  ids.search.value='no_deflect';ids.search.listeners.input();assert.equal(ids.conversations.children.length,1,'search includes rubric findings');
  ids.search.value='no matching finding';ids.search.listeners.input();assert.equal(ids.conversations.children.length,0);
});
