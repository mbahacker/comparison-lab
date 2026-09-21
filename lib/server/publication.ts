import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { db } from './db.ts';
import { hash } from './security.ts';
import type { Row } from './model.ts';

/** Write immutable bytes before the caller's database publication transaction commits.
 * Failed transactions can leave unreferenced files, never a partly published report.
 */
export function persistReport(slug: string, evidence: Row, summary: Row, jobId: string | null, generationKey: string | null = null) {
  const bytes = JSON.stringify(evidence, null, 2);
  const digest = hash(bytes);
  const directory = path.join(config().dataDir, 'reports');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = `${slug}-${digest}.json`;
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, path.join(directory, filename));
    const folder = fs.openSync(directory, 'r');
    try { fs.fsyncSync(folder); } finally { fs.closeSync(folder); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  db().prepare('INSERT INTO reports (slug,job_id,title,summary_json,evidence_path,evidence_sha256,published_at,generation_key) VALUES (?,?,?,?,?,?,?,?)').run(slug, jobId, summary.title, JSON.stringify(summary), filename, digest, summary.publishedAt, generationKey);
}
