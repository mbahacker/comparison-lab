// Operator-only filesystem installer. Never creates approval, modifies artifact bytes, or sends requests.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readPolicyCatalog, readPolicyRelease } from './policy-studies.ts';

type Pin = { path: string; sha256: string };
type Options = { source: string; manifest: string; sha256: string; dataDir: string; install?: boolean };
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const exists = (p: string) => { try { fs.lstatSync(p); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } };

function relativeParts(value: string) {
  const parts = value.split('/');
  if (path.isAbsolute(value) || value.includes('\\') || parts.some(p => !p || p === '.' || p === '..')) throw Error('Invalid relative artifact path');
  return parts;
}
function safePath(root: string, relative: string) {
  const parts = relativeParts(relative); let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (exists(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw Error('Symlink is not allowed in installation paths');
      if (i < parts.length - 1 && !stat.isDirectory()) throw Error('Artifact parent is not a directory');
    }
  }
  return current;
}
function mkdir(root: string, relative: string) {
  let current = root;
  for (const part of relativeParts(relative)) {
    current = safePath(current, part);
    if (!exists(current)) { fs.mkdirSync(current, { mode: 0o700 }); syncDir(current); syncDir(path.dirname(current)); }
    if (!fs.lstatSync(current).isDirectory()) throw Error('Installation path is not a directory');
  }
  return current;
}
function writeNew(filename: string, bytes: Buffer) {
  const fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDir(path.dirname(filename));
}
function syncDir(directory: string) { const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');

function boundedSource(source: string, manifest: Pin) {
  const p = safePath(source, manifest.path), stat = fs.lstatSync(p);
  if (!stat.isFile() || stat.size > 1024 ** 2) throw Error('Manifest is not a bounded regular file');
  const bytes = fs.readFileSync(p);
  if (sha(bytes) !== manifest.sha256) throw Error('Manifest hash mismatch');
  const raw = JSON.parse(bytes.toString('utf8')); let total = bytes.length;
  for (const key of ['summary', 'evidence', 'method', 'validation', 'html', 'bundle']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key]?.path !== 'string') throw Error('Invalid artifact pin');
    const stat = fs.lstatSync(safePath(source, raw[key].path));
    if (!stat.isFile() || stat.size > 64 * 1024 ** 2) throw Error('Artifact is not a bounded regular file');
    total += stat.size;
  }
  if (total > 128 * 1024 ** 2) throw Error('Release exceeds installation size limit');
}

function validateDestination(root: string) {
  safePath(root, 'catalog.json');
  if (!exists(root)) return readPolicyCatalog(root);
  const loaded = readPolicyCatalog(root);
  for (const item of loaded.catalog.studies) {
    safePath(root, item.path);
    const release = readPolicyRelease(root, item);
    for (const key of ['summary', 'evidence', 'method', 'validation', 'html', 'bundle'] as const) if (release.manifest[key]) safePath(root, release.manifest[key].path);
  }
  return loaded;
}
function exactDirectoryFiles(root: string): string[] {
  const found: string[] = [];
  function walk(directory: string, prefix: string) {
    for (const name of fs.readdirSync(directory)) {
      const p = safePath(directory, name), stat = fs.lstatSync(p), relative = prefix + name;
      if (stat.isDirectory()) walk(p, relative + '/');
      else if (stat.isFile()) found.push(relative);
      else throw Error('Non-regular release artifact');
    }
  }
  walk(root, ''); return found.sort();
}

export function installPolicyStudy(options: Options) {
  const source = fs.realpathSync(options.source), data = fs.realpathSync(options.dataDir);
  if (!fs.statSync(source).isDirectory() || !fs.statSync(data).isDirectory()) throw Error('Existing source and data directories required');
  const manifestPin: Pin = { path: options.manifest, sha256: options.sha256 };
  boundedSource(source, manifestPin);
  const release = readPolicyRelease(source, manifestPin);
  const parts = relativeParts(manifestPin.path);
  if (parts.length !== 4 || parts[0] !== 'releases' || parts[1] !== release.manifest.slug || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(parts[2]) || parts[3] !== 'manifest.json') throw Error('Manifest must use releases/<slug>/<release-id>/manifest.json');
  const prefix = parts.slice(0, 3).join('/');
  const pins: Pin[] = [manifestPin, ...(['summary', 'evidence', 'method', 'validation', 'html', 'bundle'] as const).flatMap(key => release.manifest[key] ? [release.manifest[key]!] : [])];
  if (new Set(pins.map(p => p.path)).size !== pins.length) throw Error('Release artifact paths must be unique');
  let total = 0;
  const files = pins.map(pin => {
    if (!pin.path.startsWith(prefix + '/')) throw Error('Every artifact must stay in the immutable release prefix');
    const p = safePath(source, pin.path), stat = fs.lstatSync(p);
    if (!stat.isFile() || stat.size > 64 * 1024 ** 2) throw Error('Artifact is not a bounded regular file');
    const bytes = fs.readFileSync(p); total += bytes.length;
    if (sha(bytes) !== pin.sha256) throw Error('Artifact changed after validation');
    return { ...pin, bytes };
  });
  if (total > 128 * 1024 ** 2) throw Error('Release exceeds installation size limit');
  const root = safePath(data, 'published-studies');
  function inspect() {
    const old = validateDestination(root);
    const duplicate = old.releases.findIndex(r => r.manifest.slug === release.manifest.slug);
    if (duplicate >= 0 && (old.catalog.studies[duplicate].path !== manifestPin.path || old.catalog.studies[duplicate].sha256 !== manifestPin.sha256)) throw Error('Conflicting already-published slug');
    const destination = safePath(root, prefix);
    if (exists(destination)) {
      if (!fs.lstatSync(destination).isDirectory()) throw Error('Release destination is not a directory');
      const expected = files.map(f => f.path.slice(prefix.length + 1)).sort();
      if (JSON.stringify(exactDirectoryFiles(destination)) !== JSON.stringify(expected)) throw Error('Conflicting existing release files');
      for (const f of files) if (sha(fs.readFileSync(safePath(root, f.path))) !== f.sha256) throw Error('Conflicting existing release bytes');
    }
    return { old, destination, alreadyInstalled: duplicate >= 0 };
  }
  const initial = inspect();
  const result = { slug: release.manifest.slug, manifest: manifestPin, artifacts: files.map(({ path, sha256, bytes }) => ({ path, sha256, size: bytes.length })), root, status: initial.alreadyInstalled ? 'already-installed' : 'validated-dry-run' };
  if (!options.install) return result;
  mkdir(data, 'published-studies');
  const lock = safePath(root, '.install.lock');
  const lockFd = fs.openSync(lock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let transaction: string | undefined;
  try {
    fs.writeFileSync(lockFd, jsonBytes({ pid: process.pid, startedAt: new Date().toISOString(), manifest: manifestPin })); fs.fsyncSync(lockFd);
    const current = inspect();
    if (current.alreadyInstalled) return { ...result, status: 'already-installed' };
    const catalogPath = safePath(root, 'catalog.json');
    const previous = exists(catalogPath) ? fs.readFileSync(catalogPath) : null;
    transaction = mkdir(root, `.installations/${randomUUID()}`);
    writeNew(path.join(transaction, 'before.json'), jsonBytes({ catalogWasAbsent: previous === null, previousCatalogSha256: previous && sha(previous), manifest: manifestPin }));
    if (previous) writeNew(path.join(transaction, 'catalog.previous.json'), previous);
    for (const f of files) {
      mkdir(transaction, path.posix.dirname(f.path));
      writeNew(safePath(transaction, f.path), f.bytes);
    }
    // Reuse the production reader on the actual byte snapshot, including external approval and all hash bindings.
    readPolicyRelease(transaction, manifestPin);
    if (!exists(current.destination)) {
      mkdir(root, parts.slice(0, 2).join('/'));
      safePath(root, prefix);
      fs.renameSync(safePath(transaction, prefix), current.destination);
      syncDir(path.dirname(current.destination));
    }
    readPolicyRelease(root, manifestPin);
    const next = jsonBytes({ ...current.old.catalog, studies: [...current.old.catalog.studies, manifestPin] });
    writeNew(path.join(transaction, 'catalog.next.json'), next);
    const now = exists(catalogPath) ? fs.readFileSync(catalogPath) : null;
    if ((previous === null) !== (now === null) || previous && now && !previous.equals(now)) throw Error('Catalog changed concurrently');
    safePath(root, 'catalog.json');
    const temporaryCatalog = safePath(root, `.catalog-${randomUUID()}.tmp`);
    writeNew(temporaryCatalog, next);
    fs.renameSync(temporaryCatalog, catalogPath); // Sole public activation, after all immutable files validate.
    syncDir(root);
    writeNew(path.join(transaction, 'installed.json'), jsonBytes({ ...result, status: 'installed', installedAt: new Date().toISOString(), catalogSha256: sha(next) }));
    return { ...result, status: 'installed', catalogSha256: sha(next), transaction };
  } catch (error) {
    if (transaction) writeNew(path.join(transaction, 'failure.json'), jsonBytes({ failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Installation failed', note: 'Retain transaction and any unpublished immutable release files. Check live catalog before retry; no automatic rollback or destructive cleanup.' }));
    throw error;
  } finally { fs.closeSync(lockFd); fs.unlinkSync(lock); }
}

function main() {
  const args = process.argv.slice(2); const values: Record<string, string> = {}; let install = false;
  while (args.length) {
    const key = args.shift()!;
    if (key === '--install') { if (install) throw Error('Duplicate --install'); install = true; continue; }
    if (!['--source', '--manifest', '--sha256', '--data-dir'].includes(key) || key in values || !args[0] || args[0].startsWith('--')) throw Error('Usage: install-policy-study.ts --source DIR --manifest releases/SLUG/RELEASE/manifest.json --sha256 SHA [--data-dir DIR] [--install]');
    values[key] = args.shift()!;
  }
  if (!values['--source'] || !values['--manifest'] || !values['--sha256']) throw Error('Source, manifest and expected SHA256 are required');
  console.log(JSON.stringify(installPolicyStudy({ source: values['--source'], manifest: values['--manifest'], sha256: values['--sha256'], dataDir: values['--data-dir'] || process.env.DATA_DIR || './data', install }), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Installation failed'); process.exitCode = 1; }
}
