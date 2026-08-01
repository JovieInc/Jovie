import { describe, expect, it } from 'vitest';
import {
  resolveScreenshotEvidence,
  resolveScreenshotSourceGitSha,
} from '../../../tests/product-screenshots/source-provenance';

const ENV_SHA = 'A'.repeat(40);
const LOCAL_SHA = 'b'.repeat(40);

describe('resolveScreenshotSourceGitSha', () => {
  it('uses a valid CI source SHA without consulting local git state', () => {
    const calls: string[][] = [];
    const result = resolveScreenshotSourceGitSha({
      environmentSha: ENV_SHA,
      runGit: args => {
        calls.push([...args]);
        return '';
      },
    });

    expect(result).toBe(ENV_SHA.toLowerCase());
    expect(calls).toEqual([]);
  });

  it('resolves HEAD only from a clean local worktree', () => {
    const result = resolveScreenshotSourceGitSha({
      environmentSha: undefined,
      runGit: args =>
        args[0] === 'status' && args[1] === '--porcelain' ? '' : LOCAL_SHA,
    });

    expect(result).toBe(LOCAL_SHA);
  });

  it('fails closed when the environment SHA is invalid or local state is dirty', () => {
    expect(
      resolveScreenshotSourceGitSha({
        environmentSha: 'not-a-source-sha',
        runGit: () => LOCAL_SHA,
      })
    ).toBeNull();

    expect(
      resolveScreenshotSourceGitSha({
        environmentSha: undefined,
        runGit: args => (args[0] === 'status' ? ' M app/page.tsx' : LOCAL_SHA),
      })
    ).toBeNull();
  });
});

describe('resolveScreenshotEvidence', () => {
  it('backfills missing provenance only after an exact clean recapture', () => {
    expect(
      resolveScreenshotEvidence({
        capturedAt: '2026-08-01T18:00:00.000Z',
        imageChanged: false,
        previousCapturedAt: '2026-08-01T13:17:35.434Z',
        previousGitSha: null,
        sourceGitSha: LOCAL_SHA,
      })
    ).toEqual({
      capturedAt: '2026-08-01T18:00:00.000Z',
      gitSha: LOCAL_SHA,
    });
  });

  it('preserves prior proven evidence when identical pixels are recaptured', () => {
    expect(
      resolveScreenshotEvidence({
        capturedAt: '2026-08-01T18:00:00.000Z',
        imageChanged: false,
        previousCapturedAt: '2026-07-31T12:00:00.000Z',
        previousGitSha: ENV_SHA,
        sourceGitSha: LOCAL_SHA,
      })
    ).toEqual({
      capturedAt: '2026-07-31T12:00:00.000Z',
      gitSha: ENV_SHA.toLowerCase(),
    });
  });

  it('never assigns a source SHA to changed pixels without valid provenance', () => {
    expect(
      resolveScreenshotEvidence({
        capturedAt: '2026-08-01T18:00:00.000Z',
        imageChanged: true,
        previousCapturedAt: '2026-07-31T12:00:00.000Z',
        previousGitSha: ENV_SHA,
        sourceGitSha: null,
      })
    ).toEqual({
      capturedAt: '2026-08-01T18:00:00.000Z',
      gitSha: null,
    });
  });
});
