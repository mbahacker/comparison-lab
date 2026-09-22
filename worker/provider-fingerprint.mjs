// Exact hostname boundaries, not vendor-name substrings. Unknown providers use their declared domain.
export function publicHost(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Public HTTP website required');
  return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}
export function providerHosts(provider) {
  const host = publicHost(provider.website);
  const aliases = host === 'sierra.ai' ? ['sierra.chat'] : host === 'alhena.ai' ? ['gleen.ai'] : ['gorgias.com', 'gorgias.io', 'gorgias.chat'].includes(host) ? ['gorgias.com', 'gorgias.io', 'gorgias.chat'] : [];
  return [...new Set([host, ...aliases])];
}
export function observedProviderUrls(provider, urls) {
  return [...new Set(urls)].filter(value => { try {
    const host = publicHost(value);
    return providerHosts(provider).some(root => host === root || host.endsWith('.' + root));
  } catch { return false; } }).slice(0, 20);
}
export function sameHost(a, b) { return publicHost(a) === publicHost(b); }
