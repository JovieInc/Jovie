#!/usr/bin/env node
// Fail-closed "ready to send" gate for an investor deck (company-wide: every
// investor deck, Jovie or LYB, passes this before it leaves the building).
// Open only when, for the SAME deck sha:
//   1. the generator + consistency build has no issues (build.json);
//   2. calibration holds: for at least 5 of 6 personas every known-bad
//      holdout scores below the YC-funded anchor deck;
//   3. at least THRESHOLD simulated personas score this deck at or above
//      their own score for the funded anchor;
//   4. the eval is fresher than MAX_AGE_DAYS.
// The open gate means "ask Tim to send", never "send".
//
//   node scripts/investor-deck/gate.mjs --deck <build dir> [--threshold 4]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readBuiltDeck } from './build.mjs';
import { calibrationHolds, relativeVerdicts } from './eval.mjs';
import { PERSONAS } from './personas.mjs';

export const DEFAULT_THRESHOLD = 4; // of 6 personas
export const MAX_AGE_DAYS = 3;

export function gateDecision({
  build,
  evalReport,
  threshold = DEFAULT_THRESHOLD,
  now = Date.now(),
}) {
  const reasons = [];
  if (
    !Number.isInteger(threshold) ||
    threshold < 1 ||
    threshold > PERSONAS.length
  )
    reasons.push(`threshold must be an integer from 1 to ${PERSONAS.length}`);
  if (!build) reasons.push('no build receipt');
  else {
    if (typeof build.deckSha256 !== 'string' || !build.deckSha256.trim())
      reasons.push('build has no deck sha');
    if (!Array.isArray(build.issues)) reasons.push('build has no issue list');
    else if (build.issues.length)
      reasons.push(`build has ${build.issues.length} issue(s)`);
  }
  if (!evalReport) reasons.push('no invest eval');
  else {
    if (!build || evalReport.deckSha256 !== build.deckSha256)
      reasons.push('eval is for a different deck sha');
    if (
      typeof build?.deckTextSha256 !== 'string' ||
      !build.deckTextSha256 ||
      evalReport.deckTextSha256 !== build.deckTextSha256
    )
      reasons.push('eval is for different or unbound deck text');
    const calibration = calibrationHolds(evalReport.calibrationRows);
    if (evalReport.calibration?.ok !== true || !calibration.ok)
      reasons.push(
        `calibration failed or incomplete: ${calibration.unseparated.join(', ')}`
      );
    const personas = evalReport.personas;
    const validPersonas =
      Array.isArray(personas) &&
      personas.length === PERSONAS.length &&
      new Set(personas.map(p => p?.persona)).size === PERSONAS.length &&
      personas.every(
        p =>
          p &&
          PERSONAS.some(expected => expected.id === p.persona) &&
          ['invest', 'pass', 'abstain'].includes(p.verdict) &&
          (p.verdict === 'abstain'
            ? p.p === null
            : Number.isFinite(p.p) && p.p >= 0 && p.p <= 1)
      );
    if (!validPersonas) reasons.push('missing or invalid persona results');
    else {
      const abstain = personas.filter(p => p.verdict === 'abstain').length;
      if (abstain) reasons.push(`${abstain} persona(s) abstained`);
      const scored = relativeVerdicts(personas, calibration);
      const yes = scored.filter(p => p.relative === 'invest').length;
      if (personas.some((p, i) => p.relative !== scored[i].relative))
        reasons.push('persona votes disagree with calibration');
      if (evalReport.yes !== yes)
        reasons.push('vote count disagrees with persona results');
    }
    if (
      !Number.isInteger(evalReport.yes) ||
      evalReport.yes < 0 ||
      evalReport.yes > PERSONAS.length
    )
      reasons.push('missing or invalid vote count');
    else if (evalReport.yes < threshold)
      reasons.push(
        `${evalReport.yes} of ${PERSONAS.length} personas say invest; need ${threshold}`
      );
    const ageDays = (now - Date.parse(evalReport.at)) / 86_400_000;
    if (!(ageDays >= 0 && ageDays <= MAX_AGE_DAYS))
      reasons.push(`eval age is invalid or exceeds ${MAX_AGE_DAYS} days`);
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
  let build;
  try {
    ({ build } = readBuiltDeck(values.deck));
  } catch (error) {
    process.stdout.write(`CLOSED\n  - ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const decision = gateDecision({
    build,
    evalReport: read('invest-eval.json'),
    threshold: values.threshold ? Number(values.threshold) : DEFAULT_THRESHOLD,
  });
  process.stdout.write(
    `${decision.open ? 'OPEN' : 'CLOSED'}\n${decision.reasons.map(r => `  - ${r}`).join('\n')}\n`
  );
  process.exitCode = decision.open ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
