import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStorefront} from '../worker/storefront-setup.mjs';
function fixture({host='www.sunandski.com',count=1,label='I agree',late=0,interceptOnce=false}={}) {
  const actions=[];let dismissed=false,accepted=false,polls=0,newsletter=false,interrupted=false;
  const page={url:()=>`https://${host}/`,locator:selector=>{
    if(selector.startsWith('#ltkpopup-container')) return {count:async()=>1,nth:()=>({isVisible:async()=>newsletter,click:async()=>{newsletter=false;actions.push('newsletter-dismiss');}})};
    if(selector==='.s_popup_close[aria-label="Close"]')return {count:async()=>1,nth:()=>({isVisible:async()=>!dismissed,click:async()=>{dismissed=true;actions.push('dismiss');}})};
    assert.equal(selector,'#website_cookies_bar #cookies-consent-all');
    return {count:async()=>++polls>late?count:0,isVisible:async()=>!accepted,innerText:async()=>label,click:async()=>{assert.ok(dismissed);if(interceptOnce&&!interrupted){interrupted=true;newsletter=true;const error=new Error('Overlay intercepted pointer');error.name='TimeoutError';throw error;}accepted=true;actions.push('accept');}};
  }};
  return {page,actions};
}
test('reviewed consent dismisses blocking promotion and records acceptance after banner appears',async()=>{
  const f=fixture({late:2});const result=await prepareStorefront(f.page,{sleep:async()=>{}});
  assert.deepEqual(f.actions,['dismiss','accept']);assert.equal(result.hostname,'sunandski.com');
  assert.equal(result.actions[1].action,'accept-cookies');assert.equal(result.actions[1].choice,'all');
});
test('lookalike or unrelated hosts do not receive cookie acceptance',async()=>{
  for(const host of ['sunandski.com.example','other.example']){const f=fixture({host});assert.equal((await prepareStorefront(f.page)).actions.length,0);assert.deepEqual(f.actions,[]);}
});
test('ambiguous or changed consent controls stop without accepting',async()=>{
  for(const config of [{count:2},{label:'Subscribe'}]){const f=fixture(config);await assert.rejects(()=>prepareStorefront(f.page),/ambiguous|label changed/);assert.deepEqual(f.actions,['dismiss']);}
});
test('missing banner is bounded and abort is respected',async()=>{
  const f=fixture({count:0});let polls=0,newsletter=false,interrupted=false;await prepareStorefront(f.page,{sleep:async()=>{polls++;}});assert.equal(polls,12);assert.deepEqual(f.actions,['dismiss']);
  const control=new AbortController();control.abort(Error('Stopped'));await assert.rejects(()=>prepareStorefront(f.page,{signal:control.signal}),/Stopped/);
});

test('late newsletter overlay is dismissed before retrying consent without forced clicks',async()=>{
  const f=fixture({interceptOnce:true});const result=await prepareStorefront(f.page,{sleep:async()=>{}});
  assert.deepEqual(f.actions,['dismiss','newsletter-dismiss','accept']);assert.equal(result.actions.at(-1).action,'accept-cookies');
});

test('reviewed retail setup closes only known benign overlays without accepting marketing',async()=>{
 for(const host of ['melin.com','www.chubbiesshorts.com']) {
  const clicked=[],seen=new Set();
  const page={url:()=>`https://${host}/`,locator:selector=>({count:async()=>seen.has(selector)?0:1,isVisible:async()=>true,click:async()=>{seen.add(selector);clicked.push(selector);}})};
  const record=await prepareStorefront(page,{sleep:async()=>{}});
  assert.ok(record.actions.length>0);assert.ok(!record.actions.some(a=>a.action==='accept-cookies'));
  assert.ok(clicked.every(s=>/close-popup|Close popup|Close Cart Button|banner-decline/.test(s)));
 }
});

test('Gap uses its verified same-merchant contact entry without cookie acceptance',async()=>{
 let url='https://www.gap.com/';const visits=[];
 const page={url:()=>url,goto:async next=>{visits.push(next);url=next;},locator:()=>({count:async()=>0})};
 const record=await prepareStorefront(page,{sleep:async()=>{}});
 assert.deepEqual(visits,['https://www.gap.com/customer-service/contact-us?cid=81270']);
 assert.equal(record.actions[0].action,'open-published-chat-entry');
 const foreign={...page,url:()=>url,goto:async()=>{url='https://elsewhere.example/';}};url='https://www.gap.com/';
 await assert.rejects(()=>prepareStorefront(foreign),/left the approved merchant/);
});
