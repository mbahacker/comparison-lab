import { WorkerError } from './protocol.mjs';
import { publicHost } from './provider-fingerprint.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Reviewed, user-authorized cookie choice for Sun & Ski. This is a storefront
// prerequisite, independent of the provider being evaluated; it awards no points.
// Never match generic "I agree" buttons or modify cookie storage directly.
export async function prepareStorefront(page, { signal, sleep = pause } = {}) {
  const record = { version: 'storefront-setup-v1', hostname: publicHost(page.url()), actions: [] };
  if (record.hostname === 'gap.com') {
    signal?.throwIfAborted();
    // Gap publishes its chat entry point on Contact Us; the homepage does not
    // reliably mount the launcher. Keep this same-merchant navigation explicit.
    const entry='https://www.gap.com/customer-service/contact-us?cid=81270';
    if (page.url() !== entry) {
      await page.goto(entry,{waitUntil:'domcontentloaded',timeout:45000});
      if(publicHost(page.url())!=='gap.com')throw new WorkerError('capture_blocked','Gap contact page left the approved merchant');
      record.actions.push({action:'open-published-chat-entry',url:page.url(),at:new Date().toISOString()});
    }
    for(let attempt=0;attempt<8;attempt++) {
      signal?.throwIfAborted();
      if(publicHost(page.url())!=='gap.com')throw new WorkerError('capture_blocked','Gap contact page left the approved merchant');
      const close=page.locator('#onetrust-banner-sdk .onetrust-close-btn-handler');
      if(await close.count()===1&&await close.isVisible()) {
        try{await close.click({timeout:3000,noWaitAfter:true});record.actions.push({action:'dismiss-cookie-notice',at:new Date().toISOString()});break;}
        catch(error){if(error?.name!=='TimeoutError')throw error;}
      }
      if(attempt<7)await sleep(1000);
    }
    return record;
  }
  if (['melin.com','chubbiesshorts.com'].includes(record.hostname)) {
    const controls=record.hostname==='melin.com'
      ? [['button[aria-label="close-popup"]:visible','dismiss-promotion']]
      : [['button[data-tid="banner-decline"]:visible','decline-cookies'],['button[aria-label="Close popup"]:visible','dismiss-promotion'],['button[aria-label="Close Cart Button"]:visible','close-cart-panel']];
    for(let attempt=0;attempt<4;attempt++) {
      signal?.throwIfAborted();
      if(publicHost(page.url())!==record.hostname)throw new WorkerError('capture_blocked','Storefront changed during setup');
      for(const [selector,action] of controls) {
        const control=page.locator(selector);
        if(await control.count()===1&&await control.isVisible()) {
          try {await control.click({timeout:3000});record.actions.push({action,selector,at:new Date().toISOString()});}
          catch(error){if(error?.name!=='TimeoutError')throw error;}
        }
      }
      if(attempt<3)await sleep(1000);
    }
    return record;
  }
  if (record.hostname !== 'sunandski.com') return record;
  for (let attempt = 0; attempt < 12; attempt++) {
    signal?.throwIfAborted();
    if (publicHost(page.url()) !== record.hostname) throw new WorkerError('capture_blocked', 'Storefront changed during consent setup');
    try {
    for (const selector of ['#ltkpopup-container button.ltkpopup-close[aria-labelledby="ltkpopup-close-title"]', '.s_popup_close[aria-label="Close"]']) {
    const close = page.locator(selector);
    for (let i = 0, n = Math.min(await close.count(), 3); i < n; i++) {
      const item = close.nth(i);
      if (await item.isVisible()) {
        await item.click({ timeout: 3000 });
        record.actions.push({ action: 'dismiss-promotion', selector, at: new Date().toISOString() });
      }
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
    } catch (error) {
      // A second promotion can appear between discovery and the click. Retry
      // normal dismissal; never force a click through an overlay.
      if (error?.name !== 'TimeoutError') throw error;
    }
    await sleep(1000);
  }
  return record;
}
