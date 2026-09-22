#!/usr/bin/env node
// Download reference source only into a private ignored cache. Never executes it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from './upstream-manifest.json' with { type: 'json' };
import { sha256, FULL_PROTOCOL } from './protocol.mjs';

export async function prepareReference({ directory, fromDirectory } = {}) {
  if (manifest.commit !== FULL_PROTOCOL.sourceCommit) throw Error('Source commit mismatch');
  const root = path.resolve(directory || `./data/benchmark-reference/${manifest.commit}`);
  for (const ref of manifest.files) {
    if (!/^runner\/[a-z0-9/_.-]+$/i.test(ref.path) || ref.path.split('/').includes('..')) throw Error('Unsafe source path');
    const expectedUrl = `https://raw.githubusercontent.com/gorgias/ai-agent-benchmark/${manifest.commit}/${ref.path}`;
    if (ref.url !== expectedUrl || !/^[a-f0-9]{64}$/.test(ref.sha256)) throw Error('Invalid source reference');
    const destination = path.join(root, ref.path);
    let bytes;
    try { bytes = await fs.readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!bytes) {
      if (fromDirectory) bytes = await fs.readFile(path.join(path.resolve(fromDirectory), ref.path));
      else {
        const response = await fetch(ref.url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error(`Reference fetch failed: ${ref.path} (${response.status})`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      if (bytes.length > 2_000_000 || sha256(bytes) !== ref.sha256) throw Error(`Reference integrity failure: ${ref.path}`);
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.writeFile(destination, bytes, { mode: 0o600, flag: 'wx' });
    }
    if (sha256(bytes) !== ref.sha256) throw Error(`Cached reference integrity failure: ${ref.path}`);
  }
  return { directory: root, commit: manifest.commit, files: manifest.files.length, executed: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = flag => { const i = args.indexOf(flag); if (i < 0) return undefined; if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value: ${flag}`); return args[i + 1]; };
  console.log(JSON.stringify(await prepareReference({ directory: option('--cache'), fromDirectory: option('--from') })));
}
