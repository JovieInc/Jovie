#!/usr/bin/env node
// CLI for the pre-promotion auth/billing journey gate (JOV-5937).
//   gate:     --range range.json --evidence a.json [--evidence b.json ...] [--override receipt.json]
//   override: override --candidate <sha> --approver <name> --reason <text> [--issue JOV-n] --out receipt.json
// Exit 0 = pass or audited manual override; exit 1 = blocked.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createRecoveryOverride,
  evaluatePromotion,
} from './lib/promotion-journey-evidence.mjs';

const argv = process.argv.slice(2);
const sub = argv[0] === 'override' ? argv.shift() : 'gate';
const opts = { evidence: [] };
for (let i = 0; i < argv.length; i += 2) {
  const key = argv[i].replace(/^--/, '');
  if (key === 'evidence') opts.evidence.push(argv[i + 1]);
  else opts[key] = argv[i + 1];
}
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const now = opts.now ? new Date(opts.now) : new Date();

if (sub === 'override') {
  const receipt = createRecoveryOverride({
    candidateSha: opts.candidate,
    approver: opts.approver,
    reason: opts.reason,
    issueRef: opts.issue,
    now,
  });
  writeFileSync(opts.out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`recovery override receipt written: ${opts.out}`);
} else {
  const result = evaluatePromotion({
    range: readJson(opts.range),
    evidence: opts.evidence.map(readJson),
    override: opts.override ? readJson(opts.override) : null,
    now,
  });
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.decision === 'blocked' ? 1 : 0);
}
