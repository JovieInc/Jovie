import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

// Hermetic fixtures: the readers default to the live ~/.hermes ops state, so
// every fixture path the test controls is pointed at a private temp dir via
// HudShipperStatePaths overrides. Nothing here touches the real shipper state.
let fixtureDir: string;
let logsDir: string;
let jobsLogPath: string;
let inflightPath: string;
let whatShippedPath: string;
let pauseSentinelPath: string;
let errLogPath: string;

function writeJsonl(path: string, rows: readonly object[]): void {
  writeFileSync(path, rows.map(row => JSON.stringify(row)).join('\n'));
}

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'shipper-state-test-'));
  logsDir = join(fixtureDir, 'logs');
  mkdirSync(logsDir, { recursive: true });
  jobsLogPath = join(logsDir, 'jobs.jsonl');
  inflightPath = join(fixtureDir, 'inflight-ship-jobs.json');
  whatShippedPath = join(fixtureDir, 'what_shipped.json');
  // Deliberately absent unless a test creates it.
  pauseSentinelPath = join(fixtureDir, 'shipping-paused');
  errLogPath = join(logsDir, 'shipper.err.log');
});

describe('getHudShipperStatus', () => {
  it('parses in-flight jobs and recent shipper events', async () => {
    writeJsonl(jobsLogPath, [
      {
        job: 'codex-issue-shipper',
        event: 'start',
        ts: '2026-07-03T12:00:00.000Z',
      },
      {
        job: 'codex-issue-shipper',
        event: 'scanned',
        ts: '2026-07-03T12:00:01.000Z',
        dispatchableCount: 4,
      },
      {
        job: 'codex-issue-shipper',
        event: 'finish',
        ts: '2026-07-03T12:05:00.000Z',
      },
    ]);
    writeFileSync(
      inflightPath,
      JSON.stringify([
        {
          job: 'codex-issue-shipper',
          repo: 'JovieInc/Jovie',
          issue: 12903,
          branch: 'codex/gh-12903',
          worktree: '/tmp/worktree',
          pid: 4242,
          startedAt: '2026-07-03T12:01:00.000Z',
        },
      ])
    );

    const { getHudShipperStatus } = await import('@/lib/hud/shipper-state');
    const payload = getHudShipperStatus({
      hermesDir: fixtureDir,
      jobsLogPath,
      pauseSentinelPath,
      inflightJournalPath: inflightPath,
      errLogPath,
    });

    expect(payload.availability).toBe('available');
    expect(payload.dispatchableCount).toBe(4);
    expect(payload.inFlightCount).toBe(1);
    expect(payload.inFlightJobs[0]?.issue).toBe(12903);
    expect(payload.state).toBe('idle');
  });
});

describe('getHudWhatShipped', () => {
  it('normalizes what_shipped entries', async () => {
    writeFileSync(
      whatShippedPath,
      JSON.stringify([
        {
          title: 'feat(ops): HUD dashboard',
          mergedAt: '2026-07-03T10:00:00.000Z',
          prNumber: 12950,
          issueNumber: 12903,
          url: 'https://github.com/JovieInc/Jovie/pull/12950',
        },
      ])
    );

    const { getHudWhatShipped } = await import('@/lib/hud/shipper-state');
    const payload = getHudWhatShipped({ whatShippedPath });

    expect(payload.availability).toBe('available');
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({
      title: 'feat(ops): HUD dashboard',
      prNumber: 12950,
      issueNumber: 12903,
    });
  });
});
