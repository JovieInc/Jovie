import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PR_CHEAP_SCAN_COMMANDS,
  SOURCE_GUARDS,
  STRUCTURAL_STATIC_SCAN_EXEMPT,
} from '../../ci-fast-lanes.mjs';

const SCRIPTS = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(join(SCRIPTS, 'ci-fast-lanes.mjs'), 'utf8');
const inventory = JSON.parse(
  readFileSync(join(SCRIPTS, 'ci-structural-inventory.json'), 'utf8')
);

function structuralLiterals() {
  const found = [];
  for (const name of ['operationsParts', 'webParts']) {
    const start = source.indexOf(`  const ${name} = [`);
    const end = source.indexOf('\n  ];', start);
    const body = source.slice(start, end);
    for (const match of body.matchAll(/^ {4}'((?:[^'\\]|\\.)*)',?\s*$/gmu))
      found.push(match[1].replaceAll("\\'", "'"));
  }
  return found;
}

// A bare pnpm script or `node .github/scripts/x validate` is a static scan:
// seconds to run, reads the tree, no test runner. `:test` scripts are suites.
const STATIC_SCAN =
  /^(?:pnpm (?:--filter=\S+ run )?[\w:.-]+|node \.github\/scripts\/\S+ validate)$/u;
const isStaticScan = command =>
  STATIC_SCAN.test(command) && !command.endsWith(':test');

describe('structural lane inventory', () => {
  const literals = structuralLiterals();

  it('finds the structural command literals', () => {
    expect(literals.length).toBeGreaterThan(40);
  });

  it('classifies every structural command with a measured time', () => {
    const keys = new Set(inventory.commands.map(item => item.key));
    for (const command of literals)
      expect(
        keys.has(command.slice(0, 120)),
        `Add "${command.slice(0, 80)}" to scripts/ci-structural-inventory.json (kind: pr-cheap-scan, suite, exempt-static or expensive-merge-group-only, with its measured seconds)`
      ).toBe(true);
  });

  it('runs every cheap static structural scan on the PR too', () => {
    for (const command of literals.filter(isStaticScan))
      expect(
        PR_CHEAP_SCAN_COMMANDS.includes(command) ||
          Object.hasOwn(STRUCTURAL_STATIC_SCAN_EXEMPT, command),
        `"${command}" runs only in merge groups. A cheap scan must also run at PR time: add it to PR_CHEAP_SCAN_COMMANDS, or to STRUCTURAL_STATIC_SCAN_EXEMPT with a reason.`
      ).toBe(true);
  });

  it('keeps the PR-time scan list in step with the structural lane', () => {
    for (const command of PR_CHEAP_SCAN_COMMANDS)
      expect(literals, command).toContain(command);
    for (const command of Object.keys(STRUCTURAL_STATIC_SCAN_EXEMPT))
      expect(literals, command).toContain(command);
  });

  it('only labels commands expensive when they measured over the threshold', () => {
    for (const item of inventory.commands) {
      if (item.kind === 'expensive-merge-group-only')
        expect(item.seconds, item.key).toBeGreaterThanOrEqual(
          inventory.thresholdSeconds
        );
      if (item.kind === 'pr-cheap-scan')
        expect(item.seconds, item.key).toBeLessThan(inventory.thresholdSeconds);
    }
  });

  it('wires the PR scans into the merged-with-base guard', () => {
    const guard = SOURCE_GUARDS.find(
      g => g.id === 'merged-with-base-invariants'
    );
    for (const command of PR_CHEAP_SCAN_COMMANDS)
      expect(guard.command).toContain(command);
    expect(guard.prOnly).toBe(true);
  });
});
