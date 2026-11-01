#!/usr/bin/env node
// Fail-closed "ready to send" gate for an investor deck (company-wide: every
// investor deck, Jovie or LYB, passes this before it leaves the building).
// Open only when, for the SAME deck sha:
//   1. the generator + consistency build has no issues (build.json);
//   2. calibration holds: every known-bad holdout is `pass`, the positive
//      anchor is `invest` for a majority of personas;
//   3. at least THRESHOLD simulated personas say `invest`;
//   4. the eval is fresher than MAX_AGE_DAYS.
// The open gate means "ask Tim to send", never "send".
//
//   node scripts/investor-deck/gate.mjs --deck <build dir> [--threshold 4]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export const DEFAULT_THRESHOLD = 4; // of 6 personas
export const MAX_AGE_DAYS = 3;

export function gateDecision({
  build,
  evalReport,
  threshold = DEFAULT_THRESHOLD,
  now = Date.now(),
}) {
  const reasons = [];
  if (!build) reasons.push('no build receipt');
  else if (build.issues?.length)
    reasons.push(`build has ${build.issues.length} issue(s)`);
  if (!evalReport) reasons.push('no invest eval');
  else {
    if (build && evalReport.deckSha256 !== build.deckSha256)
      reasons.push('eval is for a different deck sha');
    if (!evalReport.calibration) reasons.push('calibration was skipped');
    else if (!evalReport.calibration.ok)
      reasons.push(
        `calibration failed (holdout yes: ${evalReport.calibration.holdoutYes.join(', ') || 'none'}; anchor ${evalReport.calibration.anchorYes}/${evalReport.calibration.anchorTotal})`
      );
    const abstain = evalReport.personas.filter(
      p => p.verdict === 'abstain'
    ).length;
    if (abstain) reasons.push(`${abstain} persona(s) abstained`);
    if (evalReport.yes < threshold)
      reasons.push(
        `${evalReport.yes} of ${evalReport.personas.length} personas say invest; need ${threshold}`
      );
    const ageDays = (now - Date.parse(evalReport.at)) / 86_400_000;
    if (!(ageDays <= MAX_AGE_DAYS))
      reasons.push(`eval is ${ageDays.toFixed(1)} days old`);
  }
  return { open: reasons.length === 0, reasons };
}

async function main() {
  const { values } = parseArgs({
    options: { deck: { type: 'string' }, threshold: { type: 'string' } },
  });
  if (!values.deck) throw new Error('--deck <build dir> is required');
  const read = name => {
    try {
      return JSON.parse(readFileSync(join(values.deck, name), 'utf8'));
    } catch {
      return null;
    }
  };
  const decision = gateDecision({
    build: read('build.json'),
    evalReport: read('invest-eval.json'),
    threshold: values.threshold ? Number(values.threshold) : DEFAULT_THRESHOLD,
  });
  process.stdout.write(
    `${decision.open ? 'OPEN' : 'CLOSED'}\n${decision.reasons.map(r => `  - ${r}`).join('\n')}\n`
  );
  process.exitCode = decision.open ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
