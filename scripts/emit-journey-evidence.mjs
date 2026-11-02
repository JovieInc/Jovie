#!/usr/bin/env node
// Writes journey-evidence-<journey>.json for the Golden Path lane.
//   node scripts/emit-journey-evidence.mjs --report r.json --out-dir dir \
//     --sha <sha> --run-id <id> --run-url <url> --outcome <step outcome>
// Stripe mode comes from STRIPE_SECRET_KEY's prefix; the key is never printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildJourneyEvidence,
  stripeModeFromKey,
} from './lib/journey-evidence-builder.mjs';

const o = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2)
  o[argv[i].replace(/^--/, '')] = argv[i + 1];
let report = null;
try {
  report = JSON.parse(readFileSync(o.report, 'utf8'));
} catch {
  // Missing or unreadable report => zero tests => conclusion failure.
}
const docs = buildJourneyEvidence({
  report,
  candidateSha: o.sha,
  runId: o['run-id'],
  runUrl: o['run-url'],
  stepOutcome: o.outcome ?? 'unknown',
  stripeMode: stripeModeFromKey(process.env.STRIPE_SECRET_KEY ?? ''),
});
mkdirSync(o['out-dir'], { recursive: true });
for (const doc of docs) {
  writeFileSync(
    join(o['out-dir'], `journey-evidence-${doc.journey}.json`),
    `${JSON.stringify(doc, null, 2)}\n`
  );
  console.log(
    `journey evidence ${doc.journey}: ${doc.conclusion} ${JSON.stringify(doc.tests)}`
  );
}
