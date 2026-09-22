import { prepareStorefront } from './storefront-setup.mjs';
import { scanActiveFrames, createSubmissionJournal } from './browser-recovery.mjs';
import reviewedAdapters from './adapters.json' with { type: 'json' };
import { observedProviderUrls, publicHost } from './provider-fingerprint.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { QUESTIONS, WorkerError } from './protocol.mjs';
import { validatePublicUrl, resolvePublic } from './network.mjs';
import { sha256 } from './upstream.mjs';
import { AUTHOR_MARKERS, verifyAssistantReply } from './authorship.mjs';

const delay = ms => new Promise(r => setTimeout(r, ms));
const CHAT = /chat|messag|question|ask|assistant|help/i;
const LAUNCHER = /^(open (?:the )?chat|chat(?: with us)?|start (?:a )?chat|let'?s chat|ask (?:us|a question|paige)|ask ai|virtual assistant|need help\??|message us|talk to us|open (?:messenger|support))$/i;
const HUMAN = /(?:a (?:human|live) (?:agent|representative) (?:has )?joined|\b\w+(?: \w+)? (?:has )?joined (?:the |this )?(?:chat|conversation)|(?:connecting|transferring) you to (?:a |an |our )?(?:human|live agent|representative)|you(?:'re| are) (?:now )?chatting with (?:a human|a live agent))/i;
const BLOCKED = /(?:verify you are human|complete the captcha|access denied|unusual traffic|please (?:log|sign) in to continue|enter your email to (?:start|continue))/i;
const STALL = /^(?:thinking|typing|searching|loading|one moment|let me check|just a moment)[.!…\s]*$/i;

export function extractTurn(snapshot, question, allowShort = false) {
  const occurrences = snapshot.text.split(question);
  if (occurrences.length !== 2) return null;
  let reply = occurrences[1].trim();
  // UI controls are removed only as whole terminal lines; never erase substantive prose.
  reply = reply.replace(/(?:\n(?:send|type (?:a |your )?message|message|powered by .+|thumbs up|thumbs down|upvote|downvote|new chat|close|\d{1,2}:\d{2}(?:\s*[ap]m)?))+$|^\s*(?:You|Sent)\s*\n/gi, '').trim();
  if (!reply || (!allowShort && (STALL.test(reply) || reply.length < 25 || reply.split(/\s+/).length < 4))) return null;
  return reply;
}
export function captureStopReason(text) {
  if (HUMAN.test(text)) return 'human_handover';
  if (BLOCKED.test(text)) return 'capture_blocked';
  return null;
}
async function visible(locator) {
  const result = [];
  for (let i = 0, n = Math.min(await locator.count(), 80); i < n; i++) if (await locator.nth(i).isVisible()) result.push(locator.nth(i));
  return result;
}
async function candidates(page) {
  return scanActiveFrames(page, async frame => {
    const found = [];
    for (const input of await visible(frame.locator('textarea, input[type="text"], [contenteditable="true"][role="textbox"], [contenteditable="true"][data-placeholder]'))) {
      const meta = await input.evaluate(el => ({ hint: [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('data-placeholder'), el.id, el.getAttribute('name')].join(' '), tag: el.tagName, type: el.getAttribute('type') }));
      const frameChat = /chat|gleen|alhena|gorgias|messenger|assistant/i.test(frame.url());
      if (CHAT.test(meta.hint) && !/search|newsletter|subscribe|phone|email|order number/i.test(meta.hint) || (frameChat && meta.tag === 'TEXTAREA')) found.push({ frame, input, frameChat });
    }
    return found;
  });
}
export async function openChat(page, adapter) {
  // Only known benign dismissal choices; never subscribe or consent to marketing.
  await scanActiveFrames(page, async frame => {
    for (const name of [/^reject all$/i, /^no thanks$/i, /^decline$/i, /^dismiss popup$/i, /^maybe later$/i]) {
      const choices = await visible(frame.getByRole('button', { name }));
      if (choices.length === 1) await choices[0].click({ timeout: 1500 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
    }
    return [];
  });
  if (adapter?.composer) {
    if (adapter.launcher) {
      const launch = page.locator(adapter.launcher);
      await launch.first().waitFor({ state: 'visible', timeout: 20000 });
      if (await launch.count() !== 1 || !await launch.isVisible()) throw new WorkerError('needs_adapter', 'Configured launcher is not uniquely visible');
      const text = await launch.evaluate(el => `${el.textContent} ${el.getAttribute('aria-label') || ''}`);
      if (/checkout|purchase|place order|subscribe|refund|cancel order/i.test(text)) throw new WorkerError('capture_blocked', 'Unsafe launcher');
      await launch.click({ timeout: 5000 });
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const found = await scanActiveFrames(page, async frame => {
        if (adapter.frameUrlContains && !frame.url().includes(adapter.frameUrlContains)) return [];
        return (await visible(frame.locator(adapter.composer))).map(input => ({ frame, input, frameChat: true }));
      });
      if (found.length === 1) return found[0];
      if (found.length > 1) throw new WorkerError('needs_adapter', 'Configured composer is ambiguous');
      await delay(1000);
    }
    throw new WorkerError('needs_adapter', 'Configured composer was not visible');
  }
  if (adapter?.launcher) {
    const loc = page.locator(adapter.launcher);
    if ((await visible(loc)).length !== 1) throw new WorkerError('needs_adapter', 'Configured launcher is not uniquely visible');
    const text = await loc.evaluate(el => `${el.textContent} ${el.getAttribute('aria-label') || ''}`);
    if (/checkout|purchase|place order|subscribe|refund|cancel order/i.test(text)) throw new WorkerError('capture_blocked', 'Unsafe launcher');
    await loc.click();
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const inputs = await candidates(page);
    if (inputs.length === 1) return inputs[0];
    if (inputs.length > 1) throw new WorkerError('needs_adapter', 'More than one possible chat composer');
    let launchers = await scanActiveFrames(page, async frame => {
      const found = await visible(frame.getByRole('button', { name: LAUNCHER }));
      if (!found.length) found.push(...await visible(frame.locator('#gorgias-chat-messenger-button, #gleen-chat-button, [data-testid="chat-launcher"], button[aria-label="Open chat"]')));
      return found;
    });
    launchers = [...new Set(launchers)];
    if (launchers.length === 1) await launchers[0].click({ timeout: 2000 }).catch(error => { if (error.name !== 'TimeoutError') throw error; });
    else if (launchers.length > 1) throw new WorkerError('needs_adapter', 'More than one possible chat launcher');
    await delay(1500);
  }
  throw new WorkerError('needs_adapter', 'No unambiguous visible chat composer found');
}
async function readSurface(surface, adapter, question = null) {
  const options = { question, assistantSelector: adapter?.assistantMessages || null, authorMarkers: AUTHOR_MARKERS,
    isFrame: surface.frame !== surface.frame.page().mainFrame(), directRoot: !!adapter?.transcript };
  if (adapter?.transcript) {
    const root = surface.frame.locator(adapter.transcript);
    if (await root.count() !== 1 || !await root.isVisible()) throw new WorkerError('needs_adapter', 'Configured transcript is not unique');
    return root.evaluate(readSurfaceDOM, options);
  }
  return surface.input.evaluate(readSurfaceDOM, options);
}
function readSurfaceDOM(el, { isFrame, directRoot, question, assistantSelector, authorMarkers }) {
    let root;
    if (directRoot) root = el;
    else if (isFrame) root = el.ownerDocument.body;
    else {
      for (let p = el.parentElement; p && p !== el.ownerDocument.body; p = p.parentElement || p.getRootNode()?.host) {
        if (p.getAttribute('role') === 'dialog' || /chat|conversation|messenger|gleen|alhena|gorgias/i.test(`${p.id} ${p.className}`)) root = p;
      }
    }
    if (!root) return null;
    const shown = node => node.getClientRects().length > 0;
    const snapshot = { text: root.innerText, links: [...root.querySelectorAll('a[href]')].filter(shown).map(a => ({ text: a.innerText, href: a.href })),
      busy: !!root.querySelector('[aria-busy="true"], [data-testid="typing-indicator"]'), question_anchor_found: false, author_messages: [], unknown_author_messages: 0 };
    if (!question) return snapshot;
    const elements = [...root.querySelectorAll('*')].filter(shown);
    const anchors = elements.filter(n => !n.matches('textarea,input,[contenteditable="true"]') && n.innerText?.trim() === question);
    const anchor = anchors.find(n => !anchors.some(other => other !== n && other.contains(n)));
    if (!anchor) return snapshot;
    snapshot.question_anchor_found = true;
    const after = node => !node.contains(anchor) && !!(anchor.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    const marked = elements.filter(node => after(node) && Object.keys(authorMarkers).some(attribute => {
      const value = node.getAttribute(attribute);
      return value && (attribute !== 'data-testid' || /message|bubble/i.test(value));
    }));
    const explicit = node => Object.entries(authorMarkers).flatMap(([attribute, values]) => {
      const value = node.getAttribute(attribute)?.trim().toLowerCase();
      return values.includes(value) ? [{ attribute, value }] : [];
    });
    const conflicting = node => Object.keys(authorMarkers).some(attribute => {
      const value = node.getAttribute(attribute)?.trim().toLowerCase();
      return attribute !== 'data-testid' && value && !authorMarkers[attribute].includes(value);
    });
    let selected = assistantSelector ? elements.filter(node => after(node) && node.matches(assistantSelector)) : marked.filter(node => explicit(node).length && !conflicting(node));
    // Keep outer attributed bubbles once, preserving products/links inside a bubble.
    selected = selected.filter(node => !selected.some(other => other !== node && other.contains(node)));
    snapshot.author_messages = selected.map(node => ({ text: node.innerText, markers: explicit(node),
      links: [...node.querySelectorAll('a[href]')].filter(shown).map(a => ({ text: a.innerText, href: a.href })) }));
    snapshot.unknown_author_messages = marked.filter(node => {
      // A generic message wrapper around a positively attributed child is not an
      // extra author; explicit conflicting author metadata always is.
      if (conflicting(node)) return true;
      return !selected.some(ai => ai === node || ai.contains(node) || node.contains(ai));
    }).length;
    return snapshot;
}
async function attribution(page, provider, surface) {
  const providerUrls = observedProviderUrls(provider, [...await page.locator('script[src]').evaluateAll(els => els.map(e => e.src)), ...page.frames().map(f => f.url())]);
  if (providerUrls.length) return { method: 'declared provider domain plus live script/frame fingerprint', verified: true, observed_urls: providerUrls };
  const scripts = await page.locator('script[src]').evaluateAll(els => els.map(e => e.src));
  const observed = [...scripts, ...page.frames().map(f => f.url())];
  const signatures = { Alhena: /(?:^|\/\/|\.)(?:[^/]*\.)?(?:gleen\.ai|alhena\.ai)(?:[:/]|$)/i, Gorgias: /gorgias\.(?:chat|io|com)/i };
  const known = Object.entries(signatures).find(([name]) => name.toLowerCase() === provider.name.toLowerCase());
  const hits = known ? observed.filter(url => known[1].test(url)) : [];
  if (known && !hits.length) throw new WorkerError('provider_unverified', 'Declared provider fingerprint was not observed');
  const matchingProviders = Object.entries(signatures).filter(([, regex]) => observed.some(url => regex.test(url))).map(([name]) => name);
  if (known && matchingProviders.length > 1 && !known[1].test(surface.frame.url())) throw new WorkerError('provider_unverified', 'Multiple provider fingerprints; answering widget attribution is ambiguous');
  return { method: known ? 'declared provider plus live script/frame fingerprint' : 'operator-approved submission; automated provider attribution unavailable', verified: !!known, observed_urls: hits.slice(0, 10) };
}
export async function launchCaptureBrowser(proxyUrl) {
  return chromium.launch({ headless: true, chromiumSandbox: process.env.CHROMIUM_SANDBOX !== 'false',
    proxy: { server: proxyUrl, bypass: '<-loopback>' },
    args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-background-networking'],
    // Browser subprocesses inherit no API or application credentials.
    env: Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DISPLAY', 'PLAYWRIGHT_BROWSERS_PATH'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
}
export async function captureConversation({ browser, provider, store, mode, jobDirectory, adapters = [], upstream, signal, scenario: planned, policyProfile = false }) {
  const url = validatePublicUrl(store.website); await resolvePublic(url.hostname);
  const adapter = [...adapters, ...reviewedAdapters].find(a => (a.hostname && publicHost('https://' + a.hostname) === publicHost(url.href) && (!a.vendor || a.vendor.toLowerCase() === provider.name.toLowerCase())) || (!a.hostname && a.providerDomain === publicHost(provider.website)));
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false });
  await context.route('**/*', route => {
    try { validatePublicUrl(route.request().url()); return route.continue(); } catch { return route.abort('blockedbyclient'); }
  });
  const page = await context.newPage();
  page.on('popup', popup => popup.close());
  const id = planned?.id || randomUUID();
  const file = path.join(jobDirectory, `${id}.json`);
  const capture = { id, kind: 'live', vendor: provider.name, store: store.name, mode, theme: planned?.theme || QUESTIONS[mode].key, date: new Date().toISOString().slice(0, 10), captured_at: new Date().toISOString(), url: url.href,
    capture_metadata: { sessionIsolation: 'Fresh nonpersistent browser context for this conversation; logged out; no shared storage', extraction: 'Visible widget transcript after exact shopper-message echo; links preserved', provider_attribution: null, timing_note: 'Observed send-to-final-text-change; five seconds stability required. Quality-only protocol; no latency composite.', adapter: adapter?.id || 'generic-visible-chat-v1' }, turns: [] };
  const abort = () => context.close().catch(() => {}); signal?.addEventListener('abort', abort, { once: true });
  let submissionJournal;
  try {
    submissionJournal = await createSubmissionJournal(jobDirectory, id);
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await delay(4000);
    capture.capture_metadata.storefront_setup = await prepareStorefront(page, {signal});
    const surface = await openChat(page, adapter);
    capture.capture_metadata.provider_attribution = await attribution(page, provider, surface);
    if (policyProfile && !capture.capture_metadata.provider_attribution.verified) throw new WorkerError('provider_unverified', 'Policy studies require observed provider attribution');
    const opening = await readSurface(surface, adapter);
    if (!opening) throw new WorkerError('needs_adapter', 'Cannot identify the visible chat transcript container');
    const beforeStop = captureStopReason(opening.text);
    if (beforeStop) throw new WorkerError(beforeStop, 'Chat requires a person or access gate before testing');
    for (const [i, question] of (planned?.questions || QUESTIONS[mode].turns).entries()) {
      signal?.throwIfAborted();
      const before = await readSurface(surface, adapter);
      if (policyProfile) {
        let lastQuiet = before?.text, quietSince = Date.now(), quietStart = Date.now();
        while (Date.now() - quietSince < 6000) {
          signal?.throwIfAborted();
          if (Date.now() - quietStart > 30000) throw new WorkerError('capture_unstable', 'Widget did not settle before sending');
          await delay(250); const next = await readSurface(surface, adapter);
          if (next?.text !== lastQuiet || next?.busy) { quietSince = Date.now(); lastQuiet = next?.text; }
        }
      }
      await surface.input.fill(question);
      await submissionJournal.beforeSend(i + 1);
      capture.turns.push({ turn: i + 1, question, reply: '', speaker: 'unknown', response_complete: false,
        complete_ms: null, handover: false, unsent: false, sent_at: null, completed_at: null, links: [], author_verified: false, author_evidence: null });
      await fs.writeFile(file, JSON.stringify(capture, null, 2), { mode: 0o600 });
      const sentAt = Date.now();
      capture.turns[i].sent_at = new Date(sentAt).toISOString();
      await surface.input.press('Enter');
      let last = '', lastChange = sentAt, reply = null, after = null;
      const timeout = policyProfile ? 120000 : Math.min(180000, Math.max(10000, Number(process.env.TURN_TIMEOUT_MS) || 120000));
      while (Date.now() - sentAt < timeout) {
        signal?.throwIfAborted(); await delay(policyProfile ? 250 : 500);
        after = await readSurface(surface, adapter, question);
        if (!after) throw new WorkerError('needs_adapter', 'Transcript disappeared during the conversation');
        if (policyProfile && after.question_anchor_found) { capture.turns[i].submission_confirmed = true; capture.turns[i].observed_reply_text = extractTurn(after, question, true) || ''; capture.turns[i].observed_reply_ambiguous = after.unknown_author_messages > 0 || after.text.split(question).length !== 2; }
        if (policyProfile && after.question_anchor_found && after.author_messages?.length) {
          const observedReply = after.author_messages.map(m => m.text).join('\n').trim();
          if (observedReply) {
            const author = verifyAssistantReply(after, observedReply, { provider: provider.name, adapterId: capture.capture_metadata.adapter, assistantSelector: adapter?.assistantMessages });
            Object.assign(capture.turns[i], { reply: observedReply, speaker: 'ai', author_verified: true, author_evidence: author });
          }
        }
        const stop = captureStopReason(after.text.slice(-4000));
        if (stop) {
          capture.turns[i].handover = stop === 'human_handover';
          throw new WorkerError(stop, 'Conversation stopped at human handover or access gate');
        }
        const current = extractTurn(after, question);
        if (current !== last) { last = current; lastChange = Date.now(); }
        const cleaned = current && upstream ? upstream.stripWidgetChrome(current, question) : current;
        const stillGenerating = upstream && current && (upstream.isGen(current) || (current.length < 240 && upstream.isAck(current)));
        if (current && cleaned?.length >= (policyProfile ? 80 : 25) && !stillGenerating && !after.busy && Date.now() - lastChange >= 5000) { reply = current; break; }
      }
      if (!reply) {
        if (policyProfile && last && after) {
          const authorEvidence = verifyAssistantReply(after, last, { provider: provider.name, adapterId: capture.capture_metadata.adapter, assistantSelector: adapter?.assistantMessages });
          Object.assign(capture.turns[i], { reply: last, speaker: 'ai', author_verified: true, author_evidence: authorEvidence });
        }
        throw new WorkerError('capture_timeout', 'No measured complete assistant response; visible evidence retained');
      }
      const authorEvidence = verifyAssistantReply(after, reply, { provider: provider.name, adapterId: capture.capture_metadata.adapter, assistantSelector: adapter?.assistantMessages });
      const observedLinks = after.author_messages.flatMap(message => message.links || []);
      const links = [...new Map(observedLinks.map(a => [a.href + a.text, a])).values()].filter(a => { try { validatePublicUrl(a.href); return true; } catch { return false; } });
      // Append only observed rendered links. Never follow an action/checkout link.
      const fullReply = reply + links.filter(a => !reply.includes(a.href)).map(a => `\n${a.text} (${a.href})`).join('');
      capture.turns[i] = { turn: i + 1, question, reply: fullReply, speaker: 'ai', response_complete: true,
        complete_ms: lastChange - sentAt, handover: false, unsent: false, sent_at: new Date(sentAt).toISOString(), completed_at: new Date(lastChange).toISOString(), links,
        author_verified: true, author_evidence: authorEvidence };
      await fs.writeFile(file, JSON.stringify(capture, null, 2), { mode: 0o600 });
    }
    if (policyProfile) finalizePolicyCapture(capture, planned);
    capture.source_capture_sha256 = sha256(JSON.stringify(capture));
    await fs.writeFile(file, JSON.stringify(capture, null, 2), { mode: 0o600 });
    return capture;
  } catch (error) {
    const recovery = submissionJournal?.recovery(error, signal);
    if (recovery) error.captureRecovery = recovery;
    if (policyProfile && ['capture_timeout', 'human_handover', 'capture_blocked'].includes(error.code)) {
      finalizePolicyCapture(capture, planned, error.code);
      capture.source_capture_sha256 = sha256(JSON.stringify(capture));
      await fs.writeFile(file, JSON.stringify(capture, null, 2), { mode: 0o600 });
      return capture;
    }
    await fs.writeFile(file, JSON.stringify({ ...capture, stop_reason: { code: error.code || 'capture_error', message: error.message }, ...(recovery ? { capture_recovery: recovery } : {}) }, null, 2), { mode: 0o600 });
    throw error;
  } finally { signal?.removeEventListener('abort', abort); await context.close().catch(() => {}); }
}

/** @param {any} capture @param {any} planned @param {string|null} stop */
export function finalizePolicyCapture(capture, planned, stop = null) {
  capture.merchantId = planned.merchantId;
  capture.stop_reason = stop ? { code: stop } : null;
  capture.capture_metadata.timing_note = 'Full-answer completion; 250 ms polling, 5 s stability, 6 s pre-send quiet period, 120 s timeout. Stability confirmation wait is excluded. This collector profile differs from earlier studies.';
  for (const turn of capture.turns) {
    const knownSubmission = turn.response_complete || turn.submission_confirmed === true;
    if (!turn.reply && turn.observed_reply_text) { turn.reply = turn.observed_reply_text; turn.speaker = 'unknown'; }
    const noAnswer = stop === 'capture_timeout' && knownSubmission && !turn.reply && !turn.observed_reply_text && !turn.observed_reply_ambiguous;
    Object.assign(turn, { submitted: true, assessable: knownSubmission && (turn.author_verified || noAnswer), observationState: knownSubmission ? 'submitted' : 'unknown', observationReason: noAnswer ? 'Confirmed question echo; no response observed by the fixed timeout.' : turn.author_verified ? 'Visible AI-attributed response.' : 'Unknown actor or submission state.' });
    if (noAnswer) turn.speaker = 'none';
  }
  for (let i = capture.turns.length; i < planned.questions.length; i++) capture.turns.push({ turn:i+1,question:planned.questions[i],reply:'',speaker:'unknown',response_complete:false,complete_ms:null,handover:false,unsent:true,submitted:false,assessable:false,observationState:'not_submitted',observationReason:'Conversation stopped before this question.',author_verified:false,author_evidence:null,links:[] });
  return capture;
}
