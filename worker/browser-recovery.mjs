import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Only browser lifecycle failures qualify. Selector, attribution, safety, access
// gate and ambiguity failures must keep their original meaning.
export function transientBrowserReason(error) {
  if (error?.code) return null;
  const message = String(error?.message || '');
  if (/frame (?:was|has been) detached|frame has been detached|detached frame/i.test(message)) return 'frame_detached';
  if (/execution context was destroyed|cannot find context with specified id|most likely because of a navigation/i.test(message)) return 'navigation_context_lost';
  if (/target page, context or browser has been closed|page has been closed/i.test(message)) return 'page_closed';
  return null;
}

/** A frame disappearing must not hide a second composer or abort discovery. */
export async function scanActiveFrames(page, inspect, { attempts = 3, pause = () => new Promise(resolve => setTimeout(resolve, 100)) } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const results = [];
    let changed = false;
    for (const frame of page.frames()) {
      if (frame.isDetached?.()) continue;
      try { results.push({ frame, values: await inspect(frame) }); }
      catch (error) {
        if (!transientBrowserReason(error)) throw error;
        // Analytics frames commonly remove themselves during count(). An absent
        // frame cannot contain a visible composer; continue scanning the others.
        if (frame.isDetached?.()) continue;
        lastError = error; changed = true;
      }
    }
    if (!changed) return results.filter(({ frame }) => !frame.isDetached?.()).flatMap(({ values }) => values);
    if (attempt + 1 < attempts) await pause();
  }
  throw lastError;
}

/** Durable evidence of the send boundary, independent of transcript extraction. */
export async function createSubmissionJournal(directory, captureId) {
  const file = path.join(directory, `${captureId}-submission-journal.json`);
  let state = { version: 1, captureId, phase: 'setup', submissionAttempts: 0, updatedAt: new Date().toISOString() };
  await fs.writeFile(file, JSON.stringify(state), { mode: 0o600, flag: 'wx', flush: true });
  return {
    async beforeSend(turn) {
      // Increment in memory first: a failed journal write is also unsafe to retry.
      state = { ...state, phase: 'submission_attempted', submissionAttempts: state.submissionAttempts + 1, turn, updatedAt: new Date().toISOString() };
      const temporary = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx', flush: true });
      await fs.rename(temporary, file);
    },
    recovery(error, signal) {
      const reason = transientBrowserReason(error);
      return reason && !signal?.aborted && state.submissionAttempts === 0
        ? { version: 1, safeToRetry: true, phase: 'setup', submissionAttempts: 0, reason, journal: path.basename(file) }
        : null;
    },
  };
}
