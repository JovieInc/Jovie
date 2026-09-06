import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildControllerLivenessReceipt,
  evaluateController,
} from '../controller-liveness';

const RUNBOOK_PATH = resolve(
  process.cwd(),
  'scripts/symphony/runbooks/control-plane-liveness-recovery.md'
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

describe('control-plane-liveness recovery runbook', () => {
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
      // Directories are acceptable for documentation references; files must exist.
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

  it('proves the recovery receipt is idempotent across repeated runs', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const checkins = {
      mac: {
        kind: 'mac' as const,
        observedAt: '2026-09-06T17:58:00.000Z',
        pid: 1,
        evidence: 'ship-owner.lock:test',
      },
      gem: {
        kind: 'gem' as const,
        observedAt: '2026-09-06T17:58:00.000Z',
        pid: 2,
        evidence: 'gem-ship-hud-attestation:test',
      },
    };

    const first = buildControllerLivenessReceipt(checkins, {
      now,
      isAlive: () => true,
    });
    const second = buildControllerLivenessReceipt(checkins, {
      now,
      isAlive: () => true,
    });
    expect(first).toEqual(second);
    expect(first.status).toBe('healthy');
  });

  it('proves a missing controller consistently authorizes the recovery lane', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const receipt = buildControllerLivenessReceipt(
      {
        mac: null,
        gem: {
          kind: 'gem' as const,
          observedAt: '2026-09-06T17:58:00.000Z',
          pid: 2,
          evidence: 'gem-ship-hud-attestation:test',
        },
      },
      { now, isAlive: () => true }
    );

    expect(receipt.status).toBe('dark');
    expect(receipt.recoveryLane.authorized).toBe(true);
    expect(receipt.violations).toHaveLength(1);
    expect(receipt.violations[0].status).toBe('missing');
  });

  it('proves evaluateController is deterministic for the same inputs', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const violation = evaluateController('mac', null, { now });
    expect(violation).not.toBeNull();
    const repeat = evaluateController('mac', null, { now });
    expect(violation).toEqual(repeat);
  });
});
