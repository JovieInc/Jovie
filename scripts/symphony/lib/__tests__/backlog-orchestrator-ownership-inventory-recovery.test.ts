import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUNBOOK_PATH = resolve(
  process.cwd(),
  'scripts/symphony/runbooks/backlog-orchestrator-ownership-inventory-recovery.md'
);

const README_PATH = resolve(
  process.cwd(),
  'scripts/symphony/launchd/README.md'
);

const REQUIRED_SECTIONS = [
  'Safe stop',
  'Inspect current state',
  'Quarantine',
  'Replay or resume',
  'Reconcile',
  'Restore',
  'Verify recovery',
  'Communicate',
  'Audit trail',
  'Runbook freshness',
];

describe('backlog orchestrator / ownership inventory recovery runbook', () => {
  it('exists and contains the required recovery sections', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    for (const section of REQUIRED_SECTIONS) {
      expect(runbook).toContain(section);
    }
  });

  it('references only repo-relative paths that exist', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');
    const matches = [
      ...runbook.matchAll(
        /(?:^|[\s`\`'"(])(?:scripts\/symphony\/|scripts\/backlog-orchestrator\/|scripts\/lib\/|\.github\/|docs\/|apps\/web\/)[\w./-]+(?:\.\w+)?/gm
      ),
    ];

    expect(matches.length).toBeGreaterThan(0);

    for (const match of matches) {
      const referencedPath = match[0].trim();
      const trimmedPath = referencedPath.replace(/^[\s`\`'"(]+/, '');
      const absolutePath = resolve(process.cwd(), trimmedPath);
      expect
        .soft(absolutePath, `runbook references missing path: ${trimmedPath}`)
        .toBeTruthy();
      if (trimmedPath.includes('.')) {
        expect
          .soft(
            require('node:fs').existsSync(absolutePath),
            `runbook references missing file: ${trimmedPath}`
          )
          .toBe(true);
      }
    }
  });

  it('is linked from the launchd README', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    expect(readme).toContain(
      'backlog-orchestrator-ownership-inventory-recovery.md'
    );
  });

  it('proves the ownership inventory loads deterministically with a valid schema', async () => {
    const { loadOwnershipInventory } = await import(
      '../../../backlog-orchestrator/ownership-inventory.mjs'
    );
    const first = loadOwnershipInventory();
    const second = loadOwnershipInventory();
    expect(first).toEqual(second);
    expect(first.schema).toBe('jovie-ownership-inventory/v1');
    const ids = first.systems.map(system => system.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
