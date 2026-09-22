import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerOwned,retailStory,customerStory,commerceEvidence,validateRetailProof} from '../worker/retail-discovery.mjs';
const p={website:'https://sierra.ai/'};
test('retail research excludes vendor domains, customer indexes and non-retail case studies',()=>{
 assert.equal(providerOwned(p,'https://trust.sierra.ai/'),true);
 assert.equal(providerOwned(p,'https://sierra.chat/agent/'),true);
 assert.equal(providerOwned(p,'https://sierra.ai.attacker.example/'),false);
 assert.equal(customerStory('https://sierra.ai/customers'),false);
 assert.equal(customerStory('https://sierra.ai/customers/melin'),true);
 assert.equal(retailStory('Industry\nTechnology\nServing retail shops'),false);
 assert.equal(retailStory('Industry\nTelecommunications\nRetail'),false);
 assert.equal(retailStory('Industry\nRetail\nOffline retail fixture'),true);
});
test('live commerce requires product and purchase surfaces, not a support widget alone',()=>{
 assert.equal(commerceEvidence('https://shop.example/',['https://shop.example/products/a','https://shop.example/cart'],''),true);
 assert.equal(commerceEvidence('https://shop.example/',['https://other.example/products/a','https://shop.example/cart'],''),false);
 assert.equal(commerceEvidence('https://shop.example/',['https://shop.example/support'],'Contact us'),false);
});
test('reviewed story identities still require same-domain commerce and source brand evidence',()=>{
 const store={name:'melin',website:'https://melin.com/'};
 const proof={sourceUrl:'https://sierra.ai/customers/melin',sourceTitle:'melin case study',sourceText:'Industry\nRetail\nmelin offline fixture',candidateBasis:'reviewed-customer-story',storefrontUrl:store.website,storefrontTitle:'melin fixture',storefrontText:'Add to cart',storefrontLinks:['https://melin.com/products/a']};
 assert.equal(validateRetailProof(p,store,proof),true);
 assert.equal(validateRetailProof(p,store,{...proof,storefrontUrl:'https://trust.sierra.ai/'}),false);
 assert.equal(validateRetailProof(p,store,{...proof,sourceTitle:'Unrelated case study'}),false);
 assert.equal(validateRetailProof(p,store,{...proof,sourceUrl:'https://sierra.ai/customers/softbank'}),false);
 assert.equal(validateRetailProof(p,store,{...proof,candidateBasis:'customer-content-link',sourceContentLinks:[]}),false);
});

test('an unrelated commerce link on a retail story does not establish customer identity',()=>{
 const proof={sourceUrl:'https://sierra.ai/customers/melin',sourceTitle:'melin case study',sourceText:'Industry\nRetail\nmelin fixture',candidateBasis:'customer-content-link',sourceContentLinks:['https://other-shop.example/'],storefrontUrl:'https://other-shop.example/',storefrontTitle:'Unrelated shop',storefrontText:'Add to cart',storefrontLinks:['https://other-shop.example/products/a']};
 assert.equal(validateRetailProof(p,{name:'Unrelated shop',website:proof.storefrontUrl},proof),false);
});
