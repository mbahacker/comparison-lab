import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { db } from './db.ts';
import { config } from './config.ts';
import { ApiError, type Provider, type Row, type User } from './model.ts';

export const SESSION_COOKIE = 'comparison_lab_session';
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const iso = () => new Date().toISOString();
export const otp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const otpDigest = (code: string, salt: string) => scryptSync(code, salt, 32).toString('hex');
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function text(value: unknown, label: string, min = 1, max = 180): string {
  if (typeof value !== 'string') throw new ApiError(400, `${label} is required.`);
  const result = value.trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new ApiError(400, `${label} must contain ${min}–${max} printable characters.`);
  }
  return result;
}
export function multilineText(value: unknown, label: string, max = 2000): string {
  if (typeof value !== 'string') throw new ApiError(400, `${label} must be text.`);
  const result = value.replace(/\r\n?/g, '\n').trim();
  if (!result || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new ApiError(400, `${label} must contain 1–${max} characters.`);
  return result;
}
const personalDomains = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'mail.com', 'gmx.com', 'yandex.com', 'qq.com', '163.com', '126.com']);
const disposableDomains = new Set(['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com', 'grr.la', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'dispostable.com', 'trashmail.com', 'getnada.com', 'maildrop.cc']);
const domainMatches = (domain: string, domains: Set<string>) => [...domains].some(blocked => domain === blocked || domain.endsWith(`.${blocked}`));
export function reportEmail(value: unknown) {
  const email = text(value, 'Email', 5, 254).toLowerCase();
  const [local, domain, extra] = email.split('@');
  if (!local || !domain || extra !== undefined || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i.test(domain)) throw new ApiError(400, 'Enter a valid email address.');
  if (domainMatches(domain, disposableDomains)) throw new ApiError(400, 'Please use a non-disposable email address.');
  return email;
}
export function workEmail(value: unknown) {
  const email = reportEmail(value);
  if (domainMatches(email.split('@')[1], personalDomains)) throw new ApiError(400, 'Please use your company email, rather than a personal email address.');
  return email;
}
export function workEmailEligible(value: unknown) {
  try { workEmail(value); return true; } catch { return false; }
}

// Workers also resolve DNS and enforce network egress restrictions. API validation alone is not an SSRF boundary.
export function publicWebsite(value: unknown) {
  const input = text(value, 'Website URL', 4, 2048);
  let url: URL;
  try { url = new URL(input.includes('://') ? input : `https://${input}`); } catch { throw new ApiError(400, 'Enter a valid public website URL.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new ApiError(400, 'Use a public HTTP or HTTPS website on a standard port.');
  if (isIP(host) || !host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || host === 'localhost' || host === 'metadata.google.internal') throw new ApiError(400, 'Use a public domain name, not an IP address or local website.');
  if (url.search || url.hash) throw new ApiError(400, 'Use a clean website URL without query parameters or fragments.');
  return url.href;
}

export function providersInput(value: unknown): Provider[] {
  if (!Array.isArray(value) || value.length !== 2) throw new ApiError(400, 'Add exactly two companies to compare.');
  const seenStores = new Set<string>();
  const providers = value.map((p, index) => {
    if (!p || typeof p !== 'object') throw new ApiError(400, 'Each company needs a name and website.');
    const name = text(p.name, `Company ${index + 1} name`, 2, 120);
    const website = publicWebsite(p.website);
    if (!Array.isArray(p.customers) || p.customers.length !== 3) throw new ApiError(400, 'Add exactly three customer storefronts for each company.');
    const customerNames = new Set<string>();
    const customers = p.customers.map((customer: Row) => {
      if (!customer || typeof customer !== 'object') throw new ApiError(400, 'Each customer needs a name and website.');
      const customerName = text(customer.name, 'Customer name', 2, 120);
      const customerWebsite = publicWebsite(customer.website);
      const host = new URL(customerWebsite).hostname.replace(/^www\./, '');
      if (seenStores.has(host) || customerNames.has(customerName.toLowerCase())) throw new ApiError(400, 'Each customer storefront must be unique.');
      seenStores.add(host); customerNames.add(customerName.toLowerCase());
      return { name: customerName, website: customerWebsite };
    });
    return { name, website, customers };
  });
  if (providers[0].name.toLowerCase() === providers[1].name.toLowerCase() || new URL(providers[0].website).hostname === new URL(providers[1].website).hostname) throw new ApiError(400, 'Choose two different companies.');
  return providers;
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  db().prepare('DELETE FROM rate_events WHERE created_at < ?').run(now - 86_400_000);
  const row = db().prepare('SELECT COUNT(*) AS count FROM rate_events WHERE key = ? AND created_at > ?').get(hash(key), now - windowMs) as Row;
  if (row.count >= limit) throw new ApiError(429, 'Too many attempts. Please try again later.');
  db().prepare('INSERT INTO rate_events (key, created_at) VALUES (?, ?)').run(hash(key), now);
}

export function sessionUser(request: Request): User | null {
  const raw = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return null;
  const user = db().prepare('SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(hash(raw), Date.now()) as User | undefined;
  return user || null;
}
export function requireUser(request: Request) {
  const user = sessionUser(request);
  if (!user) throw new ApiError(401, 'Verify your email to continue.');
  return user;
}
export function sessionCookie(raw: string, maxAge = 604800) {
  return `${SESSION_COOKIE}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config().secureCookies ? '; Secure' : ''}`;
}
export function requireOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(config().appUrl).origin;
  if (origin && origin !== expected || !origin && config().production) throw new ApiError(403, 'This request must come from Alhena Research Lab.');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new ApiError(403, 'Cross-site requests are not accepted.');
}
// Protected GETs can enqueue access notifications. Reject cross-origin embedding,
// navigation and prefetching before reading evidence or recording an access.
export function requireReportOrigin(request: Request) {
  const expected = new URL(config().appUrl).origin;
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  const destination = request.headers.get('sec-fetch-dest');
  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`;
  if (origin && origin !== expected || site && !['same-origin', 'none'].includes(site) || destination && !['empty', 'document'].includes(destination) || /prefetch/i.test(purpose)) throw new ApiError(403, 'Open this report from Alhena Research Lab.');
  const referer = request.headers.get('referer');
  if (referer) {
    let refererOrigin: string;
    try { refererOrigin = new URL(referer).origin; } catch { throw new ApiError(403, 'Open this report from Alhena Research Lab.'); }
    if (refererOrigin !== expected) throw new ApiError(403, 'Open this report from Alhena Research Lab.');
  }
}
export function requireWorker(request: Request) {
  const secret = config().workerSecret;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (secret.length < 32 || !safeEqual(hash(supplied), hash(secret))) throw new ApiError(401, 'Worker authentication required.');
}
