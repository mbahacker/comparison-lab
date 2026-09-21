// Independently authored arithmetic from the published declarative criterion table.
// Capture worker additionally compares this result with the hash-pinned upstream function.
import { criteriaFor, WorkerError } from './protocol.mjs';

export function deriveCheckedScore(mode, checks, signals) {
  const criteria = criteriaFor(mode);
  if (!criteria.length || Object.keys(checks || {}).length !== criteria.length) throw new WorkerError('invalid_verdict', 'Wrong check count');
  const rubric = {}; const gated = []; let total = 0;
  for (const c of criteria) {
    const verdict = checks[c.id];
    if (!verdict || typeof verdict.pass !== 'boolean' || typeof verdict.evidence !== 'string') throw new WorkerError('invalid_verdict', `Invalid ${c.id}`);
    if (c.signal_gate && typeof signals[c.signal_gate] !== 'boolean') throw new WorkerError('invalid_signals', `Missing ${c.signal_gate}`);
    let pass = verdict.pass && verdict.evidence.trim().length >= 3;
    if (pass && c.signal_gate && !signals[c.signal_gate]) { pass = false; gated.push(c.id); }
    rubric[c.dimension] = (rubric[c.dimension] || 0) + (pass ? c.points : 0);
    if (pass) total += c.points;
  }
  return { rubric, total, gated };
}
const normalize = s => String(s).replace(/\s+/g, ' ').trim();
export function checkQuotes(checks, turns) {
  for (const [id, check] of Object.entries(checks)) {
    if (check.pass && (normalize(check.evidence).length < 3 || !turns.some(t => normalize(t.reply).includes(normalize(check.evidence))))) throw new WorkerError('invalid_evidence_quote', `Passing ${id} has no verbatim quote in the judged transcript`);
  }
}
export function mergeAudit(mode, primary, audit, turns) {
  const final = structuredClone(primary.checks);
  const criteria = criteriaFor(mode);
  if (Object.keys(audit.checks || {}).length !== criteria.length) throw new WorkerError('invalid_audit', 'Missing or extra audit criteria');
  for (const c of criteria) {
    const a = audit.checks[c.id];
    if (!a || !['AGREE', 'FP', 'FN'].includes(a.classification) || typeof a.reason !== 'string' || !a.reason.trim() || typeof a.evidence !== 'string') throw new WorkerError('invalid_audit', `Invalid audit of ${c.id}`);
    if (a.classification === 'FP') {
      if (!final[c.id].pass) throw new WorkerError('invalid_audit', `FP for already-failing ${c.id}`);
      final[c.id] = { pass: false, evidence: a.evidence };
    } else if (a.classification === 'FN') {
      if (final[c.id].pass) throw new WorkerError('invalid_audit', `FN for already-passing ${c.id}`);
      final[c.id] = { pass: true, evidence: a.evidence };
    }
  }
  checkQuotes(final, turns);
  return final;
}
