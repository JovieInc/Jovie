import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeVisualQaDiffArtifacts,
  pruneCompletedVisualQaRuns,
} from '@/lib/agent-os/visual-qa/diff-artifacts';
import {
  getVisualQaRootDirectory,
  resolveVisualQaDiffSummaryPath,
  resolveVisualQaManifestPath,
} from '@/lib/agent-os/visual-qa/paths';

async function createSolidPng(color: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): Promise<Buffer> {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe('computeVisualQaDiffArtifacts', () => {
  const runId = 'unit-diff-demo';

  afterEach(async () => {
    const runDirectory = path.join(getVisualQaRootDirectory(), runId);
    await rm(runDirectory, { recursive: true, force: true });
  });

  it('writes overlay and summary artifacts for captured surfaces', async () => {
    const runDirectory = path.join(getVisualQaRootDirectory(), runId);
    const surfaceDirectory = path.join(runDirectory, 'shell-desktop-idle');
    await mkdir(surfaceDirectory, { recursive: true });

    const baseline = await createSolidPng({ r: 10, g: 20, b: 30 });
    const after = await createSolidPng({ r: 10, g: 20, b: 30 });

    await Promise.all([
      writeFile(path.join(surfaceDirectory, 'baseline.png'), baseline),
      writeFile(path.join(surfaceDirectory, 'after.png'), after),
      writeFile(
        resolveVisualQaManifestPath(runId),
        `${JSON.stringify(
          {
            runId,
            createdAt: '2026-06-08T00:00:00.000Z',
            updatedAt: '2026-06-08T00:00:00.000Z',
            gitSha: null,
            surfaces: [
              {
                surfaceId: 'shell-desktop-idle',
                title: 'Shell — desktop idle',
                baselinePath: 'shell-desktop-idle/baseline.png',
                afterPath: 'shell-desktop-idle/after.png',
                baselineCapturedAt: '2026-06-08T00:00:00.000Z',
                afterCapturedAt: '2026-06-08T00:00:00.000Z',
                viewport: { width: 1440, height: 900 },
              },
            ],
          },
          null,
          2
        )}\n`
      ),
    ]);

    const summary = await computeVisualQaDiffArtifacts(runId, {
      pruneCompletedRuns: false,
    });

    expect(summary.passed).toBe(true);
    expect(summary.surfaces[0]).toMatchObject({
      surfaceId: 'shell-desktop-idle',
      status: 'no_significant_change',
      overlayPath: 'unit-diff-demo/shell-desktop-idle/diff-overlay.png',
    });

    const persistedSummary = JSON.parse(
      await readFile(resolveVisualQaDiffSummaryPath(runId), 'utf8')
    );

    expect(persistedSummary.passed).toBe(true);
  });
});

async function writeDiffSummary(
  rootDirectory: string,
  runId: string,
  options: { readonly computedAt: string; readonly passed: boolean }
) {
  const runDirectory = path.join(rootDirectory, runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    path.join(runDirectory, 'diff-summary.json'),
    `${JSON.stringify({ runId, surfaces: [], ...options })}\n`,
    'utf8'
  );
}

async function createRetentionDirectory(prefix: string): Promise<string> {
  return realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
}

describe('pruneCompletedVisualQaRuns', () => {
  let rootDirectory: string | undefined;
  let outsideDirectory: string | undefined;

  afterEach(async () => {
    await Promise.all(
      [rootDirectory, outsideDirectory]
        .filter((directory): directory is string => Boolean(directory))
        .map(directory => rm(directory, { recursive: true, force: true }))
    );
    rootDirectory = undefined;
    outsideDirectory = undefined;
  });

  it('bounds passed and failed history while preserving current and young incomplete runs', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'completed-recent', {
        computedAt: '2026-06-02T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'current-run', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'failed-run', {
        computedAt: '2026-06-02T12:00:00.000Z',
        passed: false,
      }),
      writeDiffSummary(rootDirectory, 'failed-old', {
        computedAt: '2026-06-01T12:00:00.000Z',
        passed: false,
      }),
      mkdir(path.join(rootDirectory, 'in-progress-run'), { recursive: true }),
    ]);

    const removed = await pruneCompletedVisualQaRuns('current-run', {
      retainedCompletedRuns: 2,
      retainedFailedRuns: 1,
      rootDirectory,
    });

    expect(removed).toEqual(['completed-old', 'failed-old']);
    await expect(
      readFile(path.join(rootDirectory, 'completed-old', 'diff-summary.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(
        path.join(rootDirectory, 'completed-recent', 'diff-summary.json'),
        'utf8'
      )
    ).resolves.toContain('completed-recent');
    await expect(
      readFile(path.join(rootDirectory, 'current-run', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      readFile(path.join(rootDirectory, 'failed-run', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      readFile(path.join(rootDirectory, 'in-progress-run', 'diff-summary.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('prunes after a failed current summary while retaining the newest three failed runs by default', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'failed-oldest', {
        computedAt: '2026-06-01T12:00:00.000Z',
        passed: false,
      }),
      writeDiffSummary(rootDirectory, 'failed-middle', {
        computedAt: '2026-06-02T00:00:00.000Z',
        passed: false,
      }),
      writeDiffSummary(rootDirectory, 'failed-recent', {
        computedAt: '2026-06-02T12:00:00.000Z',
        passed: false,
      }),
      writeDiffSummary(rootDirectory, 'current-failed', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: false,
      }),
    ]);

    const removed = await pruneCompletedVisualQaRuns('current-failed', {
      retainedCompletedRuns: 1,
      rootDirectory,
    });

    expect(removed).toEqual(['failed-oldest']);
    await expect(
      readFile(path.join(rootDirectory, 'completed-old', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      readFile(path.join(rootDirectory, 'current-failed', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('removes stale incomplete and malformed runs but preserves young nested evidence, invalid names, and symlinks', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    outsideDirectory = await createRetentionDirectory(
      'jovie-visual-qa-outside-'
    );
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await Promise.all([
      writeDiffSummary(rootDirectory, 'current-run', {
        computedAt: new Date().toISOString(),
        passed: true,
      }),
      mkdir(path.join(rootDirectory, 'stale-incomplete'), { recursive: true }),
      mkdir(path.join(rootDirectory, 'young-in-progress'), { recursive: true }),
      mkdir(path.join(rootDirectory, 'old-run-young-nested', 'capture'), {
        recursive: true,
      }),
      mkdir(path.join(rootDirectory, 'old-run-nested-link'), {
        recursive: true,
      }),
      mkdir(path.join(rootDirectory, 'invalid run name'), { recursive: true }),
      mkdir(path.join(rootDirectory, 'stale-malformed'), { recursive: true }),
      writeFile(path.join(outsideDirectory, 'evidence.txt'), 'preserve me'),
    ]);
    await writeFile(
      path.join(rootDirectory, 'stale-malformed', 'diff-summary.json'),
      '{not json',
      'utf8'
    );
    await writeFile(
      path.join(rootDirectory, 'old-run-young-nested', 'capture', 'after.png'),
      'active evidence',
      'utf8'
    );
    await Promise.all([
      utimes(
        path.join(rootDirectory, 'stale-incomplete'),
        staleDate,
        staleDate
      ),
      utimes(path.join(rootDirectory, 'stale-malformed'), staleDate, staleDate),
      utimes(
        path.join(rootDirectory, 'stale-malformed', 'diff-summary.json'),
        staleDate,
        staleDate
      ),
      utimes(
        path.join(rootDirectory, 'old-run-young-nested'),
        staleDate,
        staleDate
      ),
      symlink(outsideDirectory, path.join(rootDirectory, 'linked-run')),
      symlink(
        outsideDirectory,
        path.join(rootDirectory, 'old-run-nested-link', 'capture-link')
      ),
    ]);
    await utimes(
      path.join(rootDirectory, 'old-run-nested-link'),
      staleDate,
      staleDate
    );

    const removed = await pruneCompletedVisualQaRuns('current-run', {
      rootDirectory,
    });

    expect(removed).toEqual(['stale-incomplete', 'stale-malformed']);
    await expect(
      lstat(path.join(rootDirectory, 'stale-incomplete'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      lstat(path.join(rootDirectory, 'stale-malformed'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      lstat(path.join(rootDirectory, 'young-in-progress'))
    ).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await expect(
      readFile(
        path.join(
          rootDirectory,
          'old-run-young-nested',
          'capture',
          'after.png'
        ),
        'utf8'
      )
    ).resolves.toBe('active evidence');
    await expect(
      lstat(path.join(rootDirectory, 'old-run-nested-link', 'capture-link'))
    ).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) });
    await expect(
      lstat(path.join(rootDirectory, 'invalid run name'))
    ).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await expect(
      lstat(path.join(rootDirectory, 'linked-run'))
    ).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) });
    await expect(
      readFile(path.join(outsideDirectory, 'evidence.txt'), 'utf8')
    ).resolves.toBe('preserve me');
  });

  it('does not prune without a valid persisted summary for the current run', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      mkdir(path.join(rootDirectory, 'current-incomplete'), {
        recursive: true,
      }),
    ]);
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(
      path.join(rootDirectory, 'current-incomplete'),
      staleDate,
      staleDate
    );

    const removed = await pruneCompletedVisualQaRuns('current-incomplete', {
      rootDirectory,
    });

    expect(removed).toEqual([]);
    await expect(
      lstat(path.join(rootDirectory, 'current-incomplete'))
    ).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await expect(
      readFile(path.join(rootDirectory, 'completed-old', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('does not prune when the current run contains a symlink', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    outsideDirectory = await createRetentionDirectory(
      'jovie-visual-qa-outside-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'current-run', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: true,
      }),
    ]);
    await symlink(
      outsideDirectory,
      path.join(rootDirectory, 'current-run', 'linked-evidence')
    );

    const removed = await pruneCompletedVisualQaRuns('current-run', {
      rootDirectory,
    });

    expect(removed).toEqual([]);
    await expect(
      readFile(path.join(rootDirectory, 'completed-old', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      lstat(path.join(rootDirectory, 'current-run', 'linked-evidence'))
    ).resolves.toMatchObject({ isSymbolicLink: expect.any(Function) });
  });

  it('preserves all runs for live or dangling root and ancestor symlinks', async () => {
    outsideDirectory = await createRetentionDirectory(
      'jovie-visual-qa-owned-root-'
    );
    const targetRoot = path.join(outsideDirectory, 'target', 'runs');
    await Promise.all([
      writeDiffSummary(targetRoot, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(targetRoot, 'current-run', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: true,
      }),
    ]);

    const rootLink = path.join(outsideDirectory, 'root-link');
    await symlink(targetRoot, rootLink);
    expect(
      await pruneCompletedVisualQaRuns('current-run', {
        rootDirectory: rootLink,
      })
    ).toEqual([]);

    const ancestorLink = path.join(outsideDirectory, 'ancestor-link');
    await symlink(path.join(outsideDirectory, 'target'), ancestorLink);
    expect(
      await pruneCompletedVisualQaRuns('current-run', {
        rootDirectory: path.join(ancestorLink, 'runs'),
      })
    ).toEqual([]);

    const danglingRoot = path.join(outsideDirectory, 'dangling-root');
    const danglingAncestor = path.join(outsideDirectory, 'dangling-ancestor');
    await Promise.all([
      symlink(path.join(outsideDirectory, 'missing-root'), danglingRoot),
      symlink(path.join(outsideDirectory, 'missing-parent'), danglingAncestor),
    ]);
    expect(
      await pruneCompletedVisualQaRuns('current-run', {
        rootDirectory: danglingRoot,
      })
    ).toEqual([]);
    expect(
      await pruneCompletedVisualQaRuns('current-run', {
        rootDirectory: path.join(danglingAncestor, 'runs'),
      })
    ).toEqual([]);
    await expect(
      readFile(path.join(targetRoot, 'completed-old', 'diff-summary.json'))
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('preserves a candidate replaced by a live or dangling symlink at revalidation', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    outsideDirectory = await createRetentionDirectory(
      'jovie-visual-qa-outside-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'completed-recent', {
        computedAt: '2026-06-02T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'current-run', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: true,
      }),
    ]);
    const candidatePath = path.join(rootDirectory, 'completed-old');
    const removed = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async runId => {
        if (runId !== 'completed-old') return;
        await rm(candidatePath, { recursive: true });
        await symlink(outsideDirectory ?? '', candidatePath);
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });
    expect(removed).toEqual([]);
    expect((await lstat(candidatePath)).isSymbolicLink()).toBe(true);

    await rm(candidatePath);
    await writeDiffSummary(rootDirectory, 'completed-old', {
      computedAt: '2026-06-01T00:00:00.000Z',
      passed: true,
    });
    const removedDangling = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async runId => {
        if (runId !== 'completed-old') return;
        await rm(candidatePath, { recursive: true });
        await symlink(path.join(rootDirectory ?? '', 'missing'), candidatePath);
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });
    expect(removedDangling).toEqual([]);
    expect((await lstat(candidatePath)).isSymbolicLink()).toBe(true);
  });

  it('preserves candidates and stops pruning when activity, state, or current-run evidence changes', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'completed-recent', {
        computedAt: '2026-06-02T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'current-run', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: true,
      }),
    ]);
    const removed = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async runId => {
        await writeFile(
          path.join(rootDirectory ?? '', runId, 'late-capture.png'),
          'active'
        );
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });
    expect(removed).toEqual([]);

    await rm(path.join(rootDirectory, 'completed-old', 'late-capture.png'));
    const stateChanged = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async runId => {
        await writeDiffSummary(rootDirectory ?? '', runId, {
          computedAt: '2026-06-01T00:00:00.000Z',
          passed: false,
        });
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });
    expect(stateChanged).toEqual([]);

    await writeDiffSummary(rootDirectory, 'completed-old', {
      computedAt: '2026-06-01T00:00:00.000Z',
      passed: true,
    });
    const becameCurrent = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async runId => {
        await writeFile(
          path.join(rootDirectory ?? '', runId, 'diff-summary.json'),
          JSON.stringify({
            runId: 'current-run',
            computedAt: '2026-06-01T00:00:00.000Z',
            passed: true,
            surfaces: [],
          })
        );
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });
    expect(becameCurrent).toEqual([]);

    await writeDiffSummary(rootDirectory, 'completed-old', {
      computedAt: '2026-06-01T00:00:00.000Z',
      passed: true,
    });
    const currentChanged = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async () => {
        await writeDiffSummary(rootDirectory ?? '', 'current-run', {
          computedAt: '2026-06-03T00:00:00.000Z',
          passed: false,
        });
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });
    expect(currentChanged).toEqual([]);
    await expect(
      lstat(path.join(rootDirectory, 'completed-old'))
    ).resolves.toBeTruthy();
  });

  it('preserves a replacement directory even when its state and mtimes match the plan', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );
    await Promise.all([
      writeDiffSummary(rootDirectory, 'completed-old', {
        computedAt: '2026-06-01T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'completed-recent', {
        computedAt: '2026-06-02T00:00:00.000Z',
        passed: true,
      }),
      writeDiffSummary(rootDirectory, 'current-run', {
        computedAt: '2026-06-03T00:00:00.000Z',
        passed: true,
      }),
    ]);
    const candidatePath = path.join(rootDirectory, 'completed-old');
    const summaryPath = path.join(candidatePath, 'diff-summary.json');
    const fixedMtime = new Date('2026-06-04T00:00:00.000Z');
    await utimes(summaryPath, fixedMtime, fixedMtime);
    await utimes(candidatePath, fixedMtime, fixedMtime);

    const removed = await pruneCompletedVisualQaRuns('current-run', {
      beforeCandidateRevalidation: async runId => {
        if (runId !== 'completed-old') return;
        await rm(candidatePath, { recursive: true });
        await writeDiffSummary(rootDirectory ?? '', 'completed-old', {
          computedAt: '2026-06-01T00:00:00.000Z',
          passed: true,
        });
        await utimes(summaryPath, fixedMtime, fixedMtime);
        await utimes(candidatePath, fixedMtime, fixedMtime);
      },
      retainedCompletedRuns: 2,
      rootDirectory,
    });

    expect(removed).toEqual([]);
    await expect(readFile(summaryPath)).resolves.toBeInstanceOf(Buffer);
  });

  it('rejects current run traversal and invalid retention bounds', async () => {
    rootDirectory = await createRetentionDirectory(
      'jovie-visual-qa-retention-'
    );

    await expect(
      pruneCompletedVisualQaRuns('../outside', { rootDirectory })
    ).rejects.toThrow('Invalid Visual QA run id');
    await expect(
      pruneCompletedVisualQaRuns('current-run', {
        retainedFailedRuns: 21,
        rootDirectory,
      })
    ).rejects.toThrow(
      'Failed Visual QA run retention must be an integer between 1 and 20.'
    );
  });
});
