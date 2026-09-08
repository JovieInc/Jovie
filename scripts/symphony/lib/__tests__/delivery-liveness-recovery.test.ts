import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  beginAwaitingVerification,
  buildTriageLivenessReceipt,
  type DeliveryLease,
  linearActiveIssueDecision,
  recordReceipt,
  watchdogDecision,
} from '../delivery-liveness';

const RUNBOOK_PATH = resolve(
  process.cwd(),
  'scripts/symphony/runbooks/delivery-liveness-recovery.md'
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

const NOW = '2026-09-06T02:00:00.000Z';

function makeLease(): DeliveryLease {
  return beginAwaitingVerification({
    repo: 'JovieInc/Jovie',
    issue: 6062,
    issueText: 'Recover delivery liveness runbook',
    pr: 17405,
    prUrl: 'https://github.com/JovieInc/Jovie/pull/17405',
    sourceSubject: 'a'.repeat(40),
    now: NOW,
  });
}

describe('delivery-liveness recovery runbook', () => {
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

  it('proves the triage liveness receipt is idempotent across repeated runs', () => {
    const now = new Date('2026-09-06T18:00:00.000Z');
    const issues = [
      { identifier: 'JOV-6062', updatedAt: '2026-09-06T17:58:00.000Z' },
    ];
    const first = buildTriageLivenessReceipt(issues, now);
    const second = buildTriageLivenessReceipt(issues, now);
    expect(first).toEqual(second);
    expect(first.status).toBe('healthy');
  });

  it('proves a stale lease consistently authorizes retry or reassignment', () => {
    const lease = makeLease();
    expect(watchdogDecision(lease, '2026-09-06T02:05:01.000Z')).toEqual({
      action: 'retry_or_reassign',
      lease,
      reason: 'stale_receipt',
    });
  });

  it('proves watchdogDecision is deterministic for the same inputs', () => {
    const lease = makeLease();
    const first = watchdogDecision(lease, '2026-09-06T02:05:01.000Z');
    const second = watchdogDecision(lease, '2026-09-06T02:05:01.000Z');
    expect(first).toEqual(second);
    expect(first.action).toBe('retry_or_reassign');
  });

  it('proves an unchanged receipt does not look fresh on every watchdog tick', () => {
    const lease = makeLease();
    const first = recordReceipt(lease, {
      tier: 'ci',
      observedAt: '2026-09-06T02:01:00.000Z',
      subject: 'a'.repeat(40),
      evidence: 'https://example.test/checks',
    });
    const replay = recordReceipt(first, {
      tier: 'ci',
      observedAt: '2026-09-06T02:04:00.000Z',
      subject: 'a'.repeat(40),
      evidence: 'https://example.test/checks',
    });
    expect(replay.lastReceiptAt).toBe('2026-09-06T02:01:00.000Z');
  });

  it('proves a Linear In Progress issue without a machine receipt is reclaimed', () => {
    const decision = linearActiveIssueDecision({
      id: 'issue-id',
      identifier: 'JOV-6062',
      assignee: { id: 'owner-id', name: 'Codex' },
      delegate: null,
      comments: [],
    });
    expect(decision).toEqual({ action: 'reclaim', reason: 'missing_receipt' });
  });
});
