import { providerHosts, publicHost, sameHost } from './provider-fingerprint.mjs';
// Published customer stories sometimes omit an outbound merchant link. These reviewed
// pairs identify candidates only: every run still verifies the source and live store.
export const reviewedRetailCandidates = Object.freeze([
  { providerWebsite: 'https://sierra.ai/', sourceUrl: 'https://sierra.ai/customers/melin', name: 'melin', website: 'https://melin.com/' },
  { providerWebsite: 'https://sierra.ai/', sourceUrl: 'https://sierra.ai/customers/chubbies', name: 'Chubbies', website: 'https://www.chubbiesshorts.com/' },
]);
export function providerOwned(provider, value) {
  const host = publicHost(value);
  return providerHosts(provider).some(root => host === root || host.endsWith('.' + root));
}
export function customerStory(value) {
  return /\/(?:customers?|case-stud(?:y|ies)|stories|success-stories)\/[^/]+/i.test(new URL(value).pathname);
}
export function retailStory(text) {
  const industry = /\bIndustry\s*\n+\s*([^\n]+)/i.exec(text || '')?.[1]?.trim();
  if (industry) return /^(?:retail|e-?commerce|consumer goods|apparel|beauty)(?:\s|$)/i.test(industry);
  return /\b(?:retailer|e-?commerce|consumer goods|footwear brand|apparel brand)\b/i.test(text || '');
}
export function commerceEvidence(storeUrl, links, text, controls = []) {
  const own = (links || []).filter(l => {try{return sameHost(typeof l === 'string' ? l : l.url, storeUrl);}catch{return false;}});
  return own.some(l => /\/(?:products?|collections?|shop|p)(?:\/|\?|$)/i.test(new URL(typeof l === 'string' ? l : l.url).pathname)) &&
    (/\b(?:quick[- ]add|add to (?:cart|bag)|shopping (?:cart|bag)|view (?:cart|bag)|your (?:cart|bag)|checkout)\b/i.test([text || '', ...controls].join('\n')) || controls.some(c=>/^(?:open |view |toggle )?(?:cart|bag)(?: toggle)?$/i.test(c.trim())) || own.some(l => /\/(?:cart|bag|checkout)(?:\/|$)/i.test(new URL(typeof l === 'string' ? l : l.url).pathname)));
}
export function reviewedPair(provider, sourceUrl, storeUrl) {
  return reviewedRetailCandidates.find(c => sameHost(c.providerWebsite, provider.website) && c.sourceUrl === sourceUrl && sameHost(c.website, storeUrl));
}
export function validateRetailProof(provider, store, proof) {
  if (providerOwned(provider, store.website) || !customerStory(proof.sourceUrl) || !retailStory(proof.sourceText)) return false;
  if (proof.storefrontControls !== undefined && (!Array.isArray(proof.storefrontControls) || proof.storefrontControls.length > 500 || proof.storefrontControls.some(x=>typeof x !== 'string' || x.length > 1000))) return false;
  if (typeof proof.storefrontText !== 'string' || proof.storefrontText.length > 100000 || !Array.isArray(proof.storefrontLinks) || proof.storefrontLinks.length > 5000 || !sameHost(proof.storefrontUrl, store.website) || !commerceEvidence(store.website, proof.storefrontLinks, proof.storefrontText, proof.storefrontControls || [])) return false;
  const pair = reviewedPair(provider, proof.sourceUrl, store.website);
  if (proof.candidateBasis === 'reviewed-customer-story') {
    if (!pair || store.name !== pair.name) return false;
    const name = pair.name.toLowerCase();
    return String(proof.sourceTitle).toLowerCase().includes(name) && String(proof.storefrontTitle).toLowerCase().includes(name) && proof.sourceText.toLowerCase().includes(name);
  }
  const identity = store.name?.trim().toLowerCase();
  if (!identity || identity.length < 3 || /^(?:here|website|learn more|visit|click here|shop now)$/.test(identity) || !String(proof.sourceTitle).toLowerCase().includes(identity) || !String(proof.storefrontTitle).toLowerCase().includes(identity)) return false;
  return proof.candidateBasis === 'customer-content-link' && Array.isArray(proof.sourceContentLinks) && proof.sourceContentLinks.some(url => {try{return sameHost(url, store.website);}catch{return false;}});
}
