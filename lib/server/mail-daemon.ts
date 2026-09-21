import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { flushOutbox } from './mail.ts';
import { closeDb } from './db.ts';

/** Run as a separate process against the same mounted DATA_DIR as the web app. */
export async function runMailDaemon() {
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  try {
    while (!stop.signal.aborted) {
      try {
        // One bounded delivery per loop keeps shutdown within the 15-second HTTP timeout.
        const results = await flushOutbox(1);
        if (results.length) console.log(JSON.stringify({ event: 'mail_delivery', sent: results[0].sent }));
      } catch { console.error(JSON.stringify({ event: 'mail_outbox_error', message: 'Could not process the durable mail outbox.' })); }
      await setTimeout(1000, undefined, { signal: stop.signal }).catch(() => {});
    }
  } finally {
    process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown);
    closeDb();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await runMailDaemon();
