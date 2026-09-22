import fs from 'node:fs/promises';
import { reviewedRetailCandidates, providerOwned, customerStory, retailStory, commerceEvidence, validateRetailProof } from './retail-discovery.mjs';
import { prepareStorefront } from './storefront-setup.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startPublicProxy, validatePublicUrl, resolvePublic } from './network.mjs';
import { launchCaptureBrowser } from './capture.mjs';
import { WorkerError } from './protocol.mjs';
import { publicHost, observedProviderUrls, sameHost } from './provider-fingerprint.mjs';
const sha = text => createHash('sha256').update(text).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const casePage = url => /\/(?:customers?|case-stud(?:y|ies)|stories|success-stories)(?:\/|$)/i.test(new URL(url).pathname);
const excluded = /(?:facebook|instagram|youtube|linkedin|twitter|tiktok|vimeo|wikipedia|google|apple|microsoft|x)\.com$/i;

// Page inspection with reviewed cookie setup. No chat questions, email entry or purchases.
export async function discoverStorefronts(provider, { browser, signal, directory, maxPages = 60 } = {}) {
  if (provider.customers?.length !== 3) throw new WorkerError('research_incomplete', 'Preparation requires three submitted storefronts');
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, locale: 'en-US' });
  await context.route('**/*', route => { try { validatePublicUrl(route.request().url()); return route.continue(); } catch { return route.abort(); } });
  const page = await context.newPage(); page.on('popup', popup => popup.close());
  let readCount = 0;
  async function read(url, deployment = false) {
    signal?.throwIfAborted();
    if (++readCount > maxPages) throw new WorkerError('research_incomplete', 'Bounded research did not verify five storefronts');
    validatePublicUrl(url); await resolvePublic(new URL(url).hostname);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await delay(4000);
    const setup = deployment ? await prepareStorefront(page, {signal}) : null;
    const finalUrl = page.url(); validatePublicUrl(finalUrl);
    const deadline = Date.now() + (deployment ? 20000 : 0);
    let result, observed;
    do {
      signal?.throwIfAborted();
      result = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 100000),
        contentText: (document.querySelector('main') || document.body).innerText.slice(0, 100000),
        contentLinks: [...document.querySelectorAll('main a[href], article a[href]')].filter(a => !a.closest('header,footer,nav')).map(a => ({url:a.href,text:a.innerText.trim().slice(0,200)})).slice(0,5000),
        links: [...document.querySelectorAll('a[href]')].map(a => ({ url: a.href, text: a.innerText.trim().slice(0, 200) })),
        controls: [...document.querySelectorAll('button[aria-label], [role=button][aria-label]')].map(b=>(b.getAttribute('aria-label') || '').slice(0,1000)).filter(Boolean).slice(0,500),
        scripts: [...document.querySelectorAll('script[src]')].map(s => s.src) }));
      observed = observedProviderUrls(provider, [...result.scripts, ...page.frames().map(f => f.url())]);
      if (observed.length || Date.now() >= deadline) break;
      await delay(1000);
    } while (true);
    const record = { ...result, setup, finalUrl, retrievedAt: new Date().toISOString(), sourceSha256: sha(result.text), observedProviderUrls: observed };
    await fs.writeFile(path.join(directory, `page-${sha(provider.website).slice(0,12)}-${readCount}.json`), JSON.stringify(record), {mode:0o600});
    return record;
  }
  const stores = structuredClone(provider.customers), proofs = [], seen = new Set(stores.map(s => publicHost(s.website)));
  try {
    for (const store of stores) {
      const observed = await read(store.website, true);
      if (!sameHost(observed.finalUrl, store.website) || !observed.observedProviderUrls.length) throw Object.assign(new WorkerError('research_unverified', `Submitted storefront deployment could not be verified: ${publicHost(store.website)}`), {storefrontHost:publicHost(store.website)});
      proofs.push({ providerWebsite: provider.website, storeWebsite: store.website, sourceUrl: observed.finalUrl,
        sourceSha256: observed.sourceSha256, sourceText: observed.text, retrievedAt: observed.retrievedAt,
        observedProviderUrls: observed.observedProviderUrls, setup: observed.setup, verification: 'live-provider-fingerprint', submitted: true });
    }
    const homepage = await read(provider.website);
    const queue = homepage.links.filter(l => { try { return sameHost(l.url, provider.website) && casePage(l.url); } catch { return false; } }).map(l => l.url);
    queue.unshift(...reviewedRetailCandidates.filter(c => sameHost(c.providerWebsite, provider.website)).map(c => c.sourceUrl));
    const visited = new Set();
    while (queue.length && stores.length < 5 && readCount < maxPages - 1) {
      signal?.throwIfAborted();
      const url = queue.shift(); if (visited.has(url)) continue; visited.add(url);
      let source;
      try { source = await read(url); } catch (error) { if (signal?.aborted) throw error; continue; }
      if (!sameHost(source.finalUrl, provider.website)) continue;
      // Queue customer pages, but never treat navigation/footer links as customers.
      for (const link of source.links) { try { if (sameHost(link.url, provider.website) && casePage(link.url) && !visited.has(link.url)) queue.push(link.url); } catch {} }
      if (!customerStory(source.finalUrl) || !retailStory(source.contentText)) continue;
      const candidates = [
        ...reviewedRetailCandidates.filter(c => sameHost(c.providerWebsite, provider.website) && c.sourceUrl === source.finalUrl).map(c => ({url:c.website,name:c.name,basis:'reviewed-customer-story'})),
        ...source.contentLinks.map(l => ({...l,basis:'customer-content-link'})),
      ];
      for (const link of candidates) {
        let host; try { validatePublicUrl(link.url); host = publicHost(link.url); } catch { continue; }
        if (providerOwned(provider, link.url) || seen.has(host) || excluded.test(host)) continue;
        seen.add(host);
        let observed;
        try { observed = await read(link.url, true); } catch (error) { if (signal?.aborted) throw error; continue; }
        if (!sameHost(observed.finalUrl, link.url) || !observed.observedProviderUrls.length || !commerceEvidence(observed.finalUrl, observed.links, observed.text, observed.controls)) continue;
        const name = link.name || (link.text?.trim().length >= 3 && link.text.trim().length <= 120 ? link.text.trim() : null) || observed.title.split(/[|–—]/)[0].trim().slice(0, 120) || host;
        const store = { name, website: observed.finalUrl };
        const proof = { providerWebsite: provider.website, storeWebsite: store.website, sourceStoreUrl: link.url,
          sourceUrl: source.finalUrl, sourceTitle: source.title, sourceSha256: sha(source.contentText), sourceText: source.contentText,
          sourceLinks: source.contentLinks.map(l => l.url), sourceContentLinks: source.contentLinks.map(l => l.url), candidateBasis: link.basis, retrievedAt: source.retrievedAt,
          storefrontUrl: observed.finalUrl, storefrontTitle: observed.title, storefrontText: observed.text, storefrontSha256: observed.sourceSha256,
          storefrontControls: observed.controls, storefrontLinks: observed.links.slice(0,5000).map(l => l.url), storefrontRetrievedAt: observed.retrievedAt,
          observedProviderUrls: observed.observedProviderUrls, setup: observed.setup, verification: 'live-provider-fingerprint', submitted: false };
        if (!validateRetailProof(provider, store, proof)) continue;
        stores.push(store); proofs.push(proof);
        if (stores.length === 5) break;
      }
    }
    await fs.writeFile(path.join(directory, `research-${sha(provider.website).slice(0, 12)}.json`), JSON.stringify({ provider, stores, proofs, readCount }, null, 2), { mode: 0o600 });
    if (stores.length !== 5) throw new WorkerError('research_incomplete', 'Could not verify two additional public deployments from published customer stories; operator research is needed');
    return { provider: { ...provider, customers: stores }, discoveries: proofs };
  } finally { await context.close(); }
}

export async function runPreparation(job, api, { rootDirectory = process.env.WORKER_DATA_DIR || './data', startProxy = startPublicProxy, launchBrowser = launchCaptureBrowser, discover = discoverStorefronts } = {}) {
  const lease = { jobId: job.id, leaseToken: job.leaseToken, fencingToken: job.fencingToken };
  const directory = path.resolve(rootDirectory, 'preparations', String(job.id).replace(/[^a-zA-Z0-9_-]/g, '_'), `attempt-${job.fencingToken}`);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const control = new AbortController(); let proxy, browser, beating = false;
  const timer = setTimeout(() => control.abort(new WorkerError('research_timeout', 'Research exceeded its one-hour limit')), 3600000);
  const heartbeat = setInterval(async () => { if (beating || control.signal.aborted) return; beating = true; try { await api('prepare/heartbeat', lease); } catch (error) { control.abort(error); } finally { beating = false; } }, 20000);
  try {
    proxy = await startProxy(); browser = await launchBrowser(proxy.url);
    control.signal.addEventListener('abort', () => browser.close().catch(() => {}), { once: true });
    const providers = [], discoveries = [];
    for (const provider of job.providers) {
      const result = await discover(provider, { browser, signal: control.signal, directory, maxPages: 60 });
      providers.push(result.provider); discoveries.push(...result.discoveries);
    }
    await api('prepare/complete', { ...lease, providers, discoveries });
    return { status: 'prepared', jobId: job.id };
  } catch (error) {
    const code = /^[a-z_]+$/.test(error?.code || '') ? error.code : 'research_failed';
    await fs.writeFile(path.join(directory, 'failure.json'), JSON.stringify({ code, message: error.message, at: new Date().toISOString() }), { mode: 0o600 });
    await api('prepare/fail', { ...lease, code, ...(error.storefrontHost ? {storefrontHost:error.storefrontHost}: {}) }).catch(() => {});
    return { status: 'needs_review', jobId: job.id, code };
  } finally { clearInterval(heartbeat); clearTimeout(timer); await browser?.close().catch(() => {}); await proxy?.close(); }
}
