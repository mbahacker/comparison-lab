import fs from 'node:fs/promises';
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

// Read-only pages and loaded provider scripts. No chat questions, email entry or form submissions.
export async function discoverStorefronts(provider, { browser, signal, directory, maxPages = 60 } = {}) {
  if (provider.customers?.length !== 3) throw new WorkerError('research_incomplete', 'Preparation requires three submitted storefronts');
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, locale: 'en-US' });
  await context.route('**/*', route => { try { validatePublicUrl(route.request().url()); return route.continue(); } catch { return route.abort(); } });
  const page = await context.newPage(); page.on('popup', popup => popup.close());
  let readCount = 0;
  async function read(url) {
    signal?.throwIfAborted();
    if (++readCount > maxPages) throw new WorkerError('research_incomplete', 'Bounded research did not verify five storefronts');
    validatePublicUrl(url); await resolvePublic(new URL(url).hostname);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await delay(4000);
    const finalUrl = page.url(); validatePublicUrl(finalUrl);
    const result = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 100000),
      links: [...document.querySelectorAll('a[href]')].map(a => ({ url: a.href, text: a.innerText.trim().slice(0, 200) })),
      scripts: [...document.querySelectorAll('script[src]')].map(s => s.src) }));
    return { ...result, finalUrl, retrievedAt: new Date().toISOString(), sourceSha256: sha(result.text),
      observedProviderUrls: observedProviderUrls(provider, [...result.scripts, ...page.frames().map(f => f.url())]) };
  }
  const stores = structuredClone(provider.customers), proofs = [], seen = new Set(stores.map(s => publicHost(s.website)));
  try {
    for (const store of stores) {
      const observed = await read(store.website);
      if (!sameHost(observed.finalUrl, store.website) || !observed.observedProviderUrls.length) throw new WorkerError('research_unverified', `Submitted storefront deployment could not be verified: ${publicHost(store.website)}`);
      proofs.push({ providerWebsite: provider.website, storeWebsite: store.website, sourceUrl: observed.finalUrl,
        sourceSha256: observed.sourceSha256, sourceText: observed.text, retrievedAt: observed.retrievedAt,
        observedProviderUrls: observed.observedProviderUrls, verification: 'live-provider-fingerprint', submitted: true });
    }
    const homepage = await read(provider.website);
    const queue = homepage.links.filter(l => { try { return sameHost(l.url, provider.website) && casePage(l.url); } catch { return false; } }).map(l => l.url);
    const visited = new Set();
    while (queue.length && stores.length < 5 && readCount < maxPages - 1) {
      signal?.throwIfAborted();
      const url = queue.shift(); if (visited.has(url)) continue; visited.add(url);
      let source;
      try { source = await read(url); } catch (error) { if (signal?.aborted) throw error; continue; }
      if (!sameHost(source.finalUrl, provider.website)) continue;
      for (const link of source.links) {
        let host; try { validatePublicUrl(link.url); host = publicHost(link.url); } catch { continue; }
        if (sameHost(link.url, provider.website)) { if (casePage(link.url) && !visited.has(link.url)) queue.push(link.url); continue; }
        if (seen.has(host) || excluded.test(host)) continue;
        seen.add(host);
        let observed;
        try { observed = await read(link.url); } catch (error) { if (signal?.aborted) throw error; continue; }
        if (!sameHost(observed.finalUrl, link.url) || !observed.observedProviderUrls.length) continue;
        const name = observed.title.split(/[|–—]/)[0].trim().slice(0, 120) || host;
        const store = { name, website: new URL('/', observed.finalUrl).href };
        stores.push(store);
        proofs.push({ providerWebsite: provider.website, storeWebsite: store.website, sourceStoreUrl: link.url,
          sourceUrl: source.finalUrl, sourceSha256: source.sourceSha256, sourceText: source.text,
          sourceLinks: [link.url], retrievedAt: source.retrievedAt,
          observedProviderUrls: observed.observedProviderUrls, verification: 'live-provider-fingerprint', submitted: false });
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
    await api('prepare/fail', { ...lease, code }).catch(() => {});
    return { status: 'needs_review', jobId: job.id, code };
  } finally { clearInterval(heartbeat); clearTimeout(timer); await browser?.close().catch(() => {}); await proxy?.close(); }
}
