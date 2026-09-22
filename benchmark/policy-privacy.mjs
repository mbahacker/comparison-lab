// Display-only privacy projection, applied after frozen judgments and arithmetic.
// Raw captures, judgment inputs and source hashes are never changed.
const credentialKeys = new Set([
  'key', 'token', 'accesstoken', 'refreshtoken', 'session', 'sessionid',
  'auth', 'authorization', 'signature', 'secret', 'customeraccesstoken',
  'ordertoken', 'checkouttoken', 'carttoken', 'orderid', 'customerid', 'ticketid', 'email',
  'password', 'passwd', 'apikey', 'privatekey', 'sig', 'sessiontoken', 'authtoken',
  'customer', 'ordernumber', 'accountid', 'trackingnumber', 'authcode', 'authorizationcode', 'otp',
]);
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
const normalizeKey = value => decode(value).toLowerCase().replace(/[^a-z0-9]/g, '');
export const PRIVATE_LINK_MARKER = '[private cart or session link redacted]';

function privateLinkReason(candidate) {
  let url;
  try { url = new URL(candidate.replace(/&amp;/gi, '&')); } catch { return null; }
  if (url.username || url.password) return 'embedded_credentials';
  const pathname = decode(url.pathname);
  const privateRoute = /\/(?:account|login|auth|authenticate|authentication|oauth|callback|checkouts?)(?:\/|$)/i;
  const privateContext = privateRoute.test(pathname) || privateRoute.test(decode(url.hash.slice(1).split('?')[0]))
    || /^(?:auth|login|accounts)\./i.test(url.hostname);
  const sensitiveKey = key => credentialKeys.has(normalizeKey(key)) || privateContext && ['order', 'code', 'state'].includes(normalizeKey(key));
  for (const key of url.searchParams.keys()) if (sensitiveKey(key)) return 'credential_or_customer_query';
  const hash = url.hash.slice(1);
  const fragment = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
  for (const key of fragment.keys()) if (sensitiveKey(key)) return 'credential_or_customer_fragment';
  // Shopify-style cart/checkout capability paths and private account/ticket routes.
  if (/\/(?:cart\/c|checkouts?)\/[^/]+/i.test(pathname)) return 'cart_or_checkout_capability_path';
  if (/\/(?:tickets?|account\/orders?)\/[^/]+/i.test(pathname)) return 'private_account_or_ticket_path';
  if (/\/requests\/(?!new(?:\/|$))[^/]+/i.test(pathname)) return 'private_account_or_ticket_path';
  return null;
}

export function redactPrivateLinks(value) {
  const redactions = [];
  function visit(item, location) {
    if (typeof item === 'string') return item.replace(/https?:\/\/[^\s<>"'`]+/gi, candidate => {
      const reason = privateLinkReason(candidate);
      if (!reason) return candidate;
      redactions.push({ path: location, kind: 'private_link', reason });
      // Keep ordinary closing prose/Markdown punctuation, but never the link itself.
      return PRIVATE_LINK_MARKER + (candidate.match(/[).,;\]}]+$/)?.[0] || '');
    });
    if (Array.isArray(item)) return item.map((child, i) => visit(child, `${location}[${i}]`));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child, `${location}.${key}`)]));
    return item;
  }
  return { value: visit(value, '$'), redactions };
}
