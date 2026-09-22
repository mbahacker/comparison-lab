import test from 'node:test';
import assert from 'node:assert/strict';
import adapters from '../worker/adapters.json' with {type:'json'};
import {publicHost} from '../worker/provider-fingerprint.mjs';
// Offline configuration safety check; live zero-question preflight receipts are retained privately.
test('reviewed retail adapters cannot match another provider or a lookalike domain',()=>{
 for(const host of ['melin.com','www.chubbiesshorts.com']) {
  const adapter=adapters.find(a=>a.hostname===host);
  assert.ok(adapter);assert.equal(adapter.vendor,'Sierra');assert.equal(adapter.providerDomain,undefined);
  assert.equal(publicHost('https://'+adapter.hostname),publicHost('https://'+host));
  assert.notEqual(publicHost('https://'+adapter.hostname),publicHost('https://'+host+'.attacker.example'));
  assert.ok(adapter.launcher.endsWith(':visible'),'Hidden mobile duplicate must not make the launcher ambiguous');
  assert.ok(adapter.assistantMessages,'AI replies require a reviewed assistant-only selector');
 }
});
