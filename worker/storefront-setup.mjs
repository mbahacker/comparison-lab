import { WorkerError } from './protocol.mjs';
import { publicHost } from './provider-fingerprint.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Reviewed, user-authorized cookie choice for Sun & Ski. This is a storefront
// prerequisite, independent of the provider being evaluated; it awards no points.
// Never match generic "I agree" buttons or modify cookie storage directly.
export async function prepareStorefront(page, { signal, sleep = pause } = {}) {
  const record = { version: 'storefront-setup-v1', hostname: publicHost(page.url()), actions: [] };
  if (record.hostname !== 'sunandski.com') return record;
  for (let attempt = 0; attempt < 12; attempt++) {
    signal?.throwIfAborted();
    if (publicHost(page.url()) !== record.hostname) throw new WorkerError('capture_blocked', 'Storefront changed during consent setup');
    const close = page.locator('.s_popup_close[aria-label="Close"]');
    for (let i = 0, n = Math.min(await close.count(), 3); i < n; i++) {
      const item = close.nth(i);
      if (await item.isVisible()) {
        await item.click({ timeout: 3000 });
        record.actions.push({ action: 'dismiss-promotion', selector: '.s_popup_close[aria-label="Close"]', at: new Date().toISOString() });
      }
    }
    const consent = page.locator('#website_cookies_bar #cookies-consent-all');
    const count = await consent.count();
    if (count > 1) throw new WorkerError('needs_adapter', 'Cookie consent control is ambiguous');
    if (count === 1 && await consent.isVisible()) {
      if ((await consent.innerText()).trim() !== 'I agree') throw new WorkerError('needs_adapter', 'Reviewed cookie consent label changed');
      await consent.click({ timeout: 5000 });
      record.actions.push({ action: 'accept-cookies', choice: 'all', label: 'I agree', selector: '#website_cookies_bar #cookies-consent-all', at: new Date().toISOString() });
      return record;
    }
    await sleep(1000);
  }
  return record;
}
