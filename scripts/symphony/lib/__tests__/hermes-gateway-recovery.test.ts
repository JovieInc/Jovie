import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUNBOOK_PATH = resolve(
  process.cwd(),
  'scripts/symphony/runbooks/hermes-gateway-recovery.md'
);

const WATCHDOG_PLIST_TEMPLATE = resolve(
  process.cwd(),
  'scripts/symphony/launchd/co.jovie.hermes.watchdog.plist.template'
);

const BOOTSTRAP_AIR_SCRIPT = resolve(
  process.cwd(),
  'scripts/symphony/bootstrap-air.sh'
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

describe('Hermes gateway recovery runbook', () => {
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
        /(?:^|[\s`'"(])scripts\/symphony\/[\w./-]+(?:\.\w+)?/gm
      ),
    ];

    expect(matches.length).toBeGreaterThan(0);

    for (const match of matches) {
      const referencedPath = match[0].trim();
      const trimmedPath = referencedPath.replace(/^[\s`'"(]+/, '');
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

  it('proves the watchdog plist template monitors and restarts the gateway', () => {
    const template = readFileSync(WATCHDOG_PLIST_TEMPLATE, 'utf8');
    expect(template).toContain('{{HERMES_BIN}} gateway status');
    expect(template).toContain('{{HERMES_BIN}} gateway start --all');
    expect(template).toContain('co.jovie.hermes.watchdog');
    expect(template).toContain('StartInterval');
  });

  it('proves bootstrap-air can stop and restart the gateway idempotently', () => {
    const script = readFileSync(BOOTSTRAP_AIR_SCRIPT, 'utf8');
    expect(script).toContain('gateway stop --all');
    expect(script).toContain('gateway start --all');
    expect(script).toContain('gateway status');
    expect(script).toContain('--resume-after-cost-kill');
  });
});
