import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

const mockedOs = vi.hoisted(() => ({ home: '' }));

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>();
  const mocked = { ...actual, homedir: () => mockedOs.home };
  return { ...mocked, default: mocked };
});

let hermesDir = '';
let stateDir = '';
let logsDir = '';
let jobsLogPath = '';
let inflightPath = '';
let whatShippedPath = '';

beforeAll(() => {
  mockedOs.home = mkdtempSync(join('/tmp', 'jovie-shipper-state-test-'));
  hermesDir = join(mockedOs.home, '.hermes');
  stateDir = join(hermesDir, 'state');
  logsDir = join(hermesDir, 'logs');
  jobsLogPath = join(logsDir, 'jobs.jsonl');
  inflightPath = join(stateDir, 'inflight-ship-jobs.json');
  whatShippedPath = join(stateDir, 'what_shipped.json');
});

afterAll(() => {
  rmSync(mockedOs.home, { force: true, recursive: true });
});

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
