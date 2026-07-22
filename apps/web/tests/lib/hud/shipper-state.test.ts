import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Isolate from the real ~/.hermes before any path is computed: shipper-state.ts
// reads the machine-local pause sentinel ($HOME/.hermes/shipping-paused) and
// these tests write fixture state — neither may touch the real home dir.
// os.homedir() honors $HOME on POSIX, and the lib computes its paths at import.
process.env.HOME = mkdtempSync(join(tmpdir(), 'hud-shipper-test-home-'));

const hermesDir = join(homedir(), '.hermes');
const stateDir = join(hermesDir, 'state');
const logsDir = join(hermesDir, 'logs');
const jobsLogPath = join(logsDir, 'jobs.jsonl');
const inflightPath = join(stateDir, 'inflight-ship-jobs.json');
const whatShippedPath = join(stateDir, 'what_shipped.json');

function writeJsonl(path: string, rows: readonly object[]): void {
  writeFileSync(path, rows.map(row => JSON.stringify(row)).join('\n'));
}

describe('getHudShipperStatus', () => {
  beforeEach(() => {
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });
  });

  it('reports idle from hermetic state without the operator pause sentinel', async () => {
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
    const payload = getHudShipperStatus();

    expect(payload.availability).toBe('available');
    expect(payload.dispatchableCount).toBe(4);
    expect(payload.inFlightCount).toBe(1);
    expect(payload.inFlightJobs[0]?.issue).toBe(12903);
    expect(payload.state).toBe('idle');
  });
});

describe('getHudWhatShipped', () => {
  beforeEach(() => {
    mkdirSync(stateDir, { recursive: true });
  });

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
    const payload = getHudWhatShipped();

    expect(payload.availability).toBe('available');
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({
      title: 'feat(ops): HUD dashboard',
      prNumber: 12950,
      issueNumber: 12903,
    });
  });
});
