#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createEvaluationPlan } from './protocol.mjs';

const args = process.argv.slice(2);
if (args.length !== 2) throw Error('Usage: node benchmark/plan.mjs INPUT.json NEW_PRIVATE_OUTPUT_DIRECTORY');
const input = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
const { plan, roster } = createEvaluationPlan(input);
const directory = path.resolve(args[1]);
// Refuse to overwrite a plan that may already have captures or model judgments.
fs.mkdirSync(directory, { mode: 0o700 });
for (const [name, value] of [['study-manifest.json', plan], ['study-roster.json', roster]])
  fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ studyId: plan.studyId, tools: plan.tools.length, storefronts: roster.length,
  coreConversations: plan.expectedCoreConversations, guardrailConversations: plan.expectedGuardrailConversations,
  plannedTurns: plan.plannedCoreTurns + plan.plannedGuardrailTurns, status: plan.status, directory }));
