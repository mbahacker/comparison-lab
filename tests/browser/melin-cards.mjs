// Offline DOM fixture. No storefront is visited and no questions are submitted.
import assert from 'node:assert/strict';
import {chromium} from '../../worker/node_modules/playwright/index.mjs';
import adapters from '../../worker/adapters.json' with {type:'json'};
import {readSurfaceDOM,extractTurn} from '../../worker/capture.mjs';
import {verifyAssistantReply,AUTHOR_MARKERS} from '../../worker/authorship.mjs';
const adapter=adapters.find(a=>a.hostname==='melin.com');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.route('**/*',r=>r.abort());
 const product='<li class="empty:hidden"><div><button type="button"><img src="https://cdn.shopify.com/offline.png"><div>Offline hat</div><div>$79</div></button></div></li>';
 const lead='<li class="role-assistant">Earlier answer</li><li>Offline question?</li><li class="role-assistant">Here are the hats.</li>';
 async function snapshot(html){await page.setContent('<section aria-label="Chat messages"><ol>'+html+'</ol></section>');return page.locator('[aria-label="Chat messages"]').evaluate(readSurfaceDOM,{directRoot:true,isFrame:false,question:'Offline question?',assistantSelector:adapter.assistantMessages,authorMarkers:AUTHOR_MARKERS});}
 const options={provider:'Sierra',adapterId:adapter.id,assistantSelector:adapter.assistantMessages};
 let s=await snapshot(lead+product);let r=extractTurn(s,'Offline question?',true);
 assert.equal(s.author_messages.length,2);assert.match(r,/Offline hat/);assert.match(r,/\$79/);assert.equal(verifyAssistantReply(s,r,options).message_count,2);assert.deepEqual(s.author_messages.flatMap(x=>x.links),[]);
 for(const altered of [product.replace('class="empty:hidden"','class="role-human"'),'<li>Unidentified message</li>'+product,product.replace('cdn.shopify.com/','unreviewed.example/'),product.replace('<div><button','<div data-role="human"><button')]){
  s=await snapshot(lead+altered);r=extractTurn(s,'Offline question?',true);assert.throws(()=>verifyAssistantReply(s,r,options));
 }
 console.log('PASS: product text/prices retained; no invented URLs; human, detached, unknown and foreign-image blocks rejected');
}finally{await browser.close();}
