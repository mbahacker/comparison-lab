import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanActiveFrames, createSubmissionJournal, transientBrowserReason } from '../worker/browser-recovery.mjs';
import { openChat, captureConversation } from '../worker/capture.mjs';
import { WorkerError } from '../worker/protocol.mjs';

const detached = () => new Error('locator.count: Frame was detached');
const empty = { count: async () => 0 };
const visibleInput = () => { const input = { count: async () => 1, isVisible: async () => true }; input.nth = () => input; return input; };

test('removed analytics frame does not block the sole active composer', async () => {
  let removed = false;
  const analytics = { isDetached: () => removed, getByRole: () => ({ count: async () => { removed = true; throw detached(); } }) };
  const input = visibleInput();
  const main = { isDetached: () => false, getByRole: () => empty, locator: () => input };
  const selected = await openChat({ frames: () => [analytics, main] }, { composer: 'textarea' });
  assert.equal(selected.input, input);
  assert.equal(selected.frame, main);
});

test('navigation during frame discovery rescans and retains ambiguity checks', async () => {
  let calls = 0;
  const first = { isDetached: () => false };
  const second = { isDetached: () => false };
  const result = await scanActiveFrames({ frames: () => [first, second] }, async frame => {
    if (++calls === 1) throw new Error('Execution context was destroyed, most likely because of a navigation');
    return [frame];
  }, { pause: async () => {} });
  assert.deepEqual(result, [first, second]);
  const frame = () => ({ isDetached: () => false, getByRole: () => empty, locator: () => visibleInput() });
  await assert.rejects(openChat({ frames: () => [frame(), frame()] }, { composer: 'textarea' }), error => error.code === 'needs_adapter' && /ambiguous/.test(error.message));
});

test('frame recovery is bounded and never absorbs safety or selector failures', async () => {
  let visits = 0;
  await assert.rejects(scanActiveFrames({ frames: () => [{}] }, async () => { visits++; throw detached(); }, { pause: async () => {} }), /Frame was detached/);
  assert.equal(visits, 3);
  for (const error of [new WorkerError('capture_blocked', 'Unsafe launcher'), new WorkerError('needs_adapter', 'ambiguous'), new Error('Invalid selector')]) {
    assert.equal(transientBrowserReason(error), null);
    await assert.rejects(scanActiveFrames({ frames: () => [{}] }, async () => { throw error; }), e => e === error);
  }
});

test('send journal survives a rejected press and forbids all later replay', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-journal-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const journal = await createSubmissionJournal(dir, 'fixture-context');
  assert.equal(journal.recovery(detached()).safeToRetry, true);
  assert.equal(journal.recovery(detached(), { aborted: true }), null);
  assert.equal(journal.recovery(new WorkerError('provider_unverified', 'No provider')), null);
  await journal.beforeSend(1);
  const stored = JSON.parse(await fs.readFile(path.join(dir, 'fixture-context-submission-journal.json'), 'utf8'));
  assert.equal(stored.phase, 'submission_attempted');
  assert.equal(stored.submissionAttempts, 1);
  assert.equal(journal.recovery(detached()), null);
  await assert.rejects(createSubmissionJournal(dir, 'fixture-context'), { code: 'EEXIST' });
});

// Offline browser stubs: these fixtures never visit or submit to a storefront.
function fakeBrowser({ gotoError, input }) {
  const page = { on() {}, url: () => 'https://1.1.1.1/', goto: async () => { if (gotoError) throw gotoError; },
    frames: () => [frame], mainFrame: () => frame,
    locator: () => ({ evaluateAll: async () => ['https://provider.example/widget.js'] }) };
  const frame = { page: () => page, url: () => 'https://1.1.1.1/', isDetached: () => false,
    getByRole: () => empty, locator: () => input };
  return { newContext: async () => ({ route: async () => {}, newPage: async () => page, close: async () => {} }) };
}
const fixture = { provider: { name: 'Offline fixture', website: 'https://provider.example/' }, store: { name: 'Offline fixture', website: 'https://1.1.1.1/' }, mode: 'shopping',
  scenario: { id: 'offline-capture', theme: 'fixture', questions: ['Offline fixture question'] }, adapters: [{ hostname: '1.1.1.1', composer: 'textarea', id: 'offline-fixture' }] };

test('capture marks only zero-send browser setup failures as recoverable', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-setup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await assert.rejects(captureConversation({ ...fixture, jobDirectory: dir, browser: fakeBrowser({ gotoError: detached() }) }), error => {
    assert.equal(error.captureRecovery?.safeToRetry, true);
    return true;
  });
  const raw = JSON.parse(await fs.readFile(path.join(dir, 'offline-capture.json'), 'utf8'));
  assert.equal(raw.turns.length, 0);
  assert.equal(raw.capture_recovery.submissionAttempts, 0);
});

test('capture persists the attempted-send boundary before press can fail', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-send-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let pressCalls = 0;
  const input = { ...visibleInput(), fill: async () => {}, evaluate: async () => ({ text: 'Welcome to the offline fixture' }),
    press: async () => {
      pressCalls++;
      const journal = JSON.parse(await fs.readFile(path.join(dir, 'offline-capture-submission-journal.json'), 'utf8'));
      assert.equal(journal.submissionAttempts, 1);
      const intent = JSON.parse(await fs.readFile(path.join(dir, 'offline-capture.json'), 'utf8'));
      assert.equal(intent.turns[0].sent_at, null);
      throw detached();
    } };
  input.nth = () => input;
  await assert.rejects(captureConversation({ ...fixture, jobDirectory: dir, browser: fakeBrowser({ input }) }), error => {
    assert.equal(error.captureRecovery, undefined);
    return /Frame was detached/.test(error.message);
  });
  assert.equal(pressCalls, 1);
  const raw = JSON.parse(await fs.readFile(path.join(dir, 'offline-capture.json'), 'utf8'));
  assert.equal(raw.turns.length, 1);
  assert.equal(raw.turns[0].unsent, false);
  assert.ok(Number.isFinite(Date.parse(raw.turns[0].sent_at)));
});
