import { criteriaFor } from './protocol.mjs';

const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
export function verdictSchema(mode, auditor = false) {
  const check = auditor ? object({ classification: { type: 'string', enum: ['AGREE', 'FP', 'FN'] }, reason: string, evidence: string }) : object({ pass: { type: 'boolean' }, evidence: string });
  return object({ checks: object(Object.fromEntries(criteriaFor(mode).map(c => [c.id, check]))), resolution_class: { type: 'string', enum: ['resolved', 'partial', 'deflected', 'failed'] }, learning: string });
}
