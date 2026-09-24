// Evidence arithmetic only. Does not collect evidence or authorize publication.
import { createHash } from 'node:crypto';
import { websiteIdentity } from './protocol.mjs';
import protocol from '../rubric/shopping-journey-v2.json' with { type: 'json' };
const freeze = value => { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(value); };
export const SHOPPING_PROTOCOL = freeze(protocol);
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const SHOPPING_PROTOCOL_HASH = digest(protocol);
const check = (condition, message) => { if (!condition) throw Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = value => Math.round(value * 10) / 10;
const host = websiteIdentity;
const cellKeys = [...protocol.outcomes.map(t => `task:${t.id}`), ...protocol.interfaces.map(s => `surface:${s.id}`)];
export function validateShoppingPlan(plan) {
  check(plan?.protocol === protocol.id && plan.protocolHash === SHOPPING_PROTOCOL_HASH, 'Incompatible shopping protocol');
  check(plan.executionProfile === protocol.executionProfile && text(plan.provider), 'Invalid execution profile or provider');
  check(Number.isFinite(time(plan.registeredAt)), 'Registration timestamp required');
  check(Array.isArray(plan.stores) && plan.stores.length === protocol.storesPerProvider, 'Five registered storefronts required');
  const ids = new Set(), hosts = new Set();
  for (const store of plan.stores) {
    check(text(store.id) && !ids.has(store.id) && !hosts.has(host(store.url)), 'Distinct storefront ids and domains required');
    ids.add(store.id); hosts.add(host(store.url));
    check(Array.isArray(store.tasks) && store.tasks.length === protocol.outcomes.length, 'All six task scenarios required');
    const taskIds = new Set();
    for (const task of store.tasks) {
      check(protocol.outcomes.some(t => t.id === task.id) && !taskIds.has(task.id), 'Unknown or duplicate task');
      taskIds.add(task.id);
      check(text(task.scenario) && text(task.constraints) && text(task.expectedEvidence) && protocol.interfaces.some(s => s.id === task.primaryInterface), 'Pre-register scenario, constraints, evidence and primary interface');
      check(host(task.url) === host(store.url), 'Task URL must belong to its storefront');
    }
  }
  return plan;
}
export function scoreShoppingJourney(bundle) {
  const plan = validateShoppingPlan(bundle?.plan);
  check(bundle.planHash === digest(plan), 'Plan hash mismatch');
  const evaluatedAt = time(bundle.evaluatedAt);
  check(Number.isFinite(evaluatedAt) && evaluatedAt >= time(plan.registeredAt), 'Invalid evaluation date');
  check(Array.isArray(bundle.artifacts) && Array.isArray(bundle.cells), 'Artifact manifest and cells required');
  const storeMap = new Map(plan.stores.map(s => [s.id, s])), artifacts = new Map();
  for (const artifact of bundle.artifacts) {
    const capturedAt = time(artifact.capturedAt), store = storeMap.get(artifact.store);
    check(text(artifact.id) && !artifacts.has(artifact.id) && store, 'Duplicate artifact or unregistered storefront');
    check(text(artifact.content) && artifact.sha256 === digest(artifact.content), 'Artifact content hash mismatch');
    check(capturedAt >= time(plan.registeredAt) && capturedAt <= evaluatedAt, 'Evidence predates registration or is from the future');
    check(evaluatedAt - capturedAt <= protocol.reuseDays * 86400000, 'Evidence exceeds 30 days');
    check(host(artifact.url) === host(store.url) && cellKeys.includes(artifact.cell) && text(artifact.role), 'Unbound evidence artifact');
    artifacts.set(artifact.id, artifact);
  }
  const cells = new Map();
  for (const cell of bundle.cells) {
    check(storeMap.has(cell.store) && cellKeys.includes(cell.key), 'Unregistered evidence cell');
    const key = `${cell.store}/${cell.key}`;
    check(!cells.has(key) && text(cell.reason), 'Duplicate cell or missing explanation');
    const surface = cell.key.startsWith('surface:');
    const allowed = surface ? ['usable', 'present-untested', 'not-observed', 'blocked'] : ['observed', 'blocked', 'unknown'];
    check(allowed.includes(cell.status), 'Invalid observation status');
    const resolved = surface ? ['usable', 'not-observed'].includes(cell.status) : cell.status === 'observed';
    let credited = false, disagreement = false, status = cell.status;
    if (resolved) {
      check(text(cell.primary?.reviewer) && text(cell.audit?.reviewer) && cell.primary.reviewer !== cell.audit.reviewer && cell.audit.blind === true, 'Independent blind review required');
      const decisions = [cell.primary, cell.audit];
      const decisionArtifacts = decisions.map(decision => {
        check(['pass', 'fail'].includes(decision.verdict) && text(decision.reason) && Array.isArray(decision.evidenceRefs) && decision.evidenceRefs.length, 'Decision and cited evidence required');
        return decision.evidenceRefs.map(id => {
          const artifact = artifacts.get(id);
          check(artifact && artifact.store === cell.store && artifact.cell === cell.key, 'Foreign or missing evidence reference');
          return artifact;
        });
      });
      disagreement = cell.primary.verdict !== cell.audit.verdict;
      const bothPass = decisions.every(d => d.verdict === 'pass');
      if (surface) {
        if (bothPass) for (const evidence of decisionArtifacts) {
          const roles = new Set(evidence.map(a => a.role));
          const required = cell.status === 'usable' ? ['attribution', 'interaction', 'placement'] : ['discovery-path'];
          check(required.every(role => roles.has(role)), 'Interface observation lacks attribution, usable interaction, placement or discovery path');
        }
        credited = cell.status === 'usable' && bothPass;
        if (!bothPass) status = 'blocked';
      } else {
        const task = protocol.outcomes.find(t => `task:${t.id}` === cell.key);
        check(cell.interface === storeMap.get(cell.store).tasks.find(t => t.id === task.id).primaryInterface, 'Task route differs from registered primary interface');
        for (const evidence of decisionArtifacts) {
          check(evidence.some(a => a.role === 'interaction'), 'Observed task requires an interaction record');
          check(evidence.some(a => a.role === 'attribution'), 'Observed task requires provider attribution');
        }
        decisions.forEach((decision, i) => {
          if (decision.verdict !== 'pass') return;
          const evidence = decisionArtifacts[i], roles = new Set(evidence.map(a => a.role));
          check(task.evidenceRoles.every(role => roles.has(role)), 'Task success lacks required outcome evidence');
          for (const prefix of ['cart', 'transition']) if (roles.has(`${prefix}-before`)) {
            const before = evidence.filter(a => a.role === `${prefix}-before`), after = evidence.filter(a => a.role === `${prefix}-after`);
            check(after.length && Math.max(...before.map(a => time(a.capturedAt))) < Math.min(...after.map(a => time(a.capturedAt))), 'Before/after evidence must be chronologically ordered');
          }
        });
        credited = bothPass;
      }
    }
    cells.set(key, { store: cell.store, key: cell.key, status, credited, disagreement, reason: cell.reason });
  }
  const rows = plan.stores.map(store => {
    const row = cellKeys.map(key => cells.get(`${store.id}/${key}`) || { store: store.id, key, status: 'unknown', credited: false, disagreement: false, reason: 'Evidence not captured' });
    const tasks = row.filter(c => c.key.startsWith('task:')), surfaces = row.filter(c => c.key.startsWith('surface:'));
    return { store: store.id, tasks, surfaces,
      outcome: tasks.every(c => c.status === 'observed') ? 100 * mean(tasks.map(c => Number(c.credited))) : null,
      reach: surfaces.every(c => ['usable', 'not-observed'].includes(c.status)) ? 100 * mean(surfaces.map(c => Number(c.credited))) : null,
      verifiedOutcomeLowerBound: 100 * mean(tasks.map(c => Number(c.credited))),
      verifiedReachLowerBound: 100 * mean(surfaces.map(c => Number(c.credited))) };
  });
  const capturedTimes = [...artifacts.values()].map(a => time(a.capturedAt));
  return { protocol: protocol.id, protocolHash: SHOPPING_PROTOCOL_HASH, planHash: bundle.planHash,
    sourceEvidenceSha256: digest(bundle),
    provider: plan.provider, executionProfile: plan.executionProfile, evaluatedAt: bundle.evaluatedAt,
    captureStartAt: capturedTimes.length ? new Date(Math.min(...capturedTimes)).toISOString() : null,
    captureEndAt: capturedTimes.length ? new Date(Math.max(...capturedTimes)).toISOString() : null,
    publicationStatus: 'requires-evidence-review',
    outcomeScore: rows.every(r => r.outcome !== null) ? round(mean(rows.map(r => r.outcome))) : null,
    reachScore: rows.every(r => r.reach !== null) ? round(mean(rows.map(r => r.reach))) : null,
    verifiedOutcomeLowerBound: round(mean(rows.map(r => r.verifiedOutcomeLowerBound))),
    verifiedReachLowerBound: round(mean(rows.map(r => r.verifiedReachLowerBound))),
    observedTasks: [...cells.values()].filter(c => c.key.startsWith('task:') && c.status === 'observed').length,
    plannedTasks: 30, plannedInterfaces: 25,
    disagreements: [...cells.values()].filter(c => c.disagreement).length,
    stores: rows, supportChanged: false, combinedScore: null };
}
// Arithmetic compatibility only, never permission to publish unreviewed evidence.
export function isShoppingMetricCompatible(a, b, now = new Date(), metric = 'outcomeScore') {
  if (!['outcomeScore', 'reachScore'].includes(metric)) return false;
  const at = +new Date(now);
  return [a, b].every(r => r?.protocol === protocol.id && r.protocolHash === SHOPPING_PROTOCOL_HASH
    && r.executionProfile === protocol.executionProfile && Number.isFinite(r[metric]) && r[metric] >= 0 && r[metric] <= 100
    && Number.isFinite(time(r.captureStartAt)) && time(r.captureStartAt) <= time(r.captureEndAt)
    && time(r.captureEndAt) <= at && at - time(r.captureStartAt) <= protocol.reuseDays * 86400000);
}
