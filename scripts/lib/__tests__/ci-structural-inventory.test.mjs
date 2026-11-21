import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PR_CHEAP_SCAN_COMMANDS,
  SOURCE_GUARDS,
  STRUCTURAL_STATIC_SCAN_EXEMPT,
} from '../../ci-fast-lanes.mjs';
import {
  replaceInventoryEntry,
  structuralCommands,
  updateInventory,
} from '../../ci-structural-inventory-update.mjs';

const SCRIPTS = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(join(SCRIPTS, 'ci-fast-lanes.mjs'), 'utf8');
const inventory = JSON.parse(
  readFileSync(join(SCRIPTS, 'ci-structural-inventory.json'), 'utf8')
);

// A bare pnpm script or `node .github/scripts/x validate` is a static scan:
// seconds to run, reads the tree, no test runner. `:test` scripts are suites.
const STATIC_SCAN =
  /^(?:pnpm (?:--filter=\S+ run )?[\w:.-]+|node \.github\/scripts\/\S+ validate)$/u;
const isStaticScan = command =>
  STATIC_SCAN.test(command) && !command.endsWith(':test');

describe('structural lane inventory', () => {
  const literals = structuralCommands(source).map(row => row.command);

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

describe('measured inventory updates', () => {
  it('preserves unrelated inventory formatting', () => {
    const input =
      '{\n    {\n      "key": "old",\n      "seconds": 1.0\n    },\n    {"seconds": 5.0}\n}';
    const result = replaceInventoryEntry(input, 'old', {
      key: 'new',
      seconds: 2,
    });
    expect(result).toContain('"key": "new",\n      "seconds": 2');
    expect(result).toContain('{"seconds": 5.0}');
  });
  const commands = structuralCommands(
    "  const operationsParts = [\n    'node --test old.test.mjs new.test.mjs',\n  ];\n  const webParts = [\n    'node --test web.test.mjs',\n  ];"
  );
  const makeInventory = () => ({
    thresholdSeconds: 60,
    commands: [
      {
        key: 'node --test old.test.mjs',
        part: 'operationsParts',
        kind: 'suite',
        seconds: 1,
      },
    ],
  });

  it('updates the selected entry from a successful measurement and is repeatable', () => {
    const data = makeInventory();
    updateInventory(
      data,
      commands,
      data.commands[0].key,
      'old.test.mjs',
      () => 2.5
    );
    expect(data.commands[0]).toEqual({
      key: 'node --test old.test.mjs new.test.mjs',
      part: 'operationsParts',
      kind: 'suite',
      seconds: 2.5,
    });
    updateInventory(
      data,
      commands,
      data.commands[0].key,
      'old.test.mjs',
      () => 2.5
    );
    expect(data.commands).toHaveLength(1);
  });

  it('leaves the entry intact for ambiguous matches and failed measurements', () => {
    const data = makeInventory();
    expect(() =>
      updateInventory(
        data,
        commands,
        data.commands[0].key,
        'node --test',
        () => 1
      )
    ).toThrow();
    expect(() =>
      updateInventory(
        data,
        commands,
        data.commands[0].key,
        'old.test.mjs',
        () => {
          throw new Error('failed');
        }
      )
    ).toThrow();
    expect(data).toEqual(makeInventory());
  });

  it('rejects collisions, wrong parts, and timing that contradicts classification', () => {
    const data = makeInventory();
    data.commands[0].kind = 'pr-cheap-scan';
    expect(() =>
      updateInventory(
        data,
        commands,
        data.commands[0].key,
        'old.test.mjs',
        () => 60
      )
    ).toThrow();
    expect(() =>
      updateInventory(
        data,
        commands,
        data.commands[0].key,
        'web.test.mjs',
        () => 1
      )
    ).toThrow();
    data.commands.push({
      ...data.commands[0],
      key: 'node --test old.test.mjs new.test.mjs',
    });
    expect(() =>
      updateInventory(
        data,
        commands,
        data.commands[0].key,
        'old.test.mjs',
        () => 1
      )
    ).toThrow();
  });
});
