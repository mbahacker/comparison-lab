// Fetch, pin and verify reference modules. These files remain outside the public repository.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { WorkerError } from './protocol.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const MANIFEST = JSON.parse(await fs.readFile(new URL('../rubric/upstream-manifest.json', import.meta.url), 'utf8'));
export async function loadUpstream(cache = process.env.RUBRIC_CACHE_DIR || new URL('./.cache/upstream', import.meta.url).pathname) {
  const directory = path.resolve(cache, MANIFEST.commit);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (const [name, ref] of Object.entries(MANIFEST.files)) {
    const dest = path.join(directory, name);
    let bytes;
    try { bytes = await fs.readFile(dest); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!bytes) {
      const response = await fetch(ref.url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new WorkerError('rubric_unavailable', `Pinned reference fetch failed (${response.status})`, true);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 1_000_000 || sha256(bytes) !== ref.sha256) throw new WorkerError('rubric_integrity', `Reference hash mismatch: ${name}`);
      await fs.writeFile(dest, bytes, { mode: 0o600, flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
    }
    if (sha256(await fs.readFile(dest)) !== ref.sha256) throw new WorkerError('rubric_integrity', `Cached reference hash mismatch: ${name}`);
  }
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module","private":true}\n', { mode: 0o600 });
  const imported = await Promise.all(['eval-score.js', 'eval-signals.js', 'reply-clean.js', 'message-style.js', 'classify.js'].map(n => import(pathToFileURL(path.join(directory, n)).href)));
  return { ...Object.assign({}, ...imported), rubricText: await fs.readFile(path.join(directory, 'eval-rubric.md'), 'utf8'), manifest: MANIFEST };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadUpstream(); console.log(`Verified pinned reference ${MANIFEST.commit}`);
}
