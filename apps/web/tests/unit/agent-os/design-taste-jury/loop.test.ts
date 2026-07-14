import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let tempRoot = '';

vi.mock('@/lib/agent-os/design-taste-jury/paths', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/agent-os/design-taste-jury/paths')
  >('@/lib/agent-os/design-taste-jury/paths');

  return {
    ...actual,
    getDesignTasteMemoryPath: () =>
      path.join(tempRoot, 'agentos', 'memory', 'design-taste.md'),
    getDesignTasteJuryRootDirectory: () =>
      path.join(tempRoot, 'agentos', 'runs', 'design-taste-jury'),
    resolveDesignTasteJuryCompletionPath: (runId: string) =>
      path.join(
        tempRoot,
        'agentos',
        'runs',
        'design-taste-jury',
        runId,
        'complete.json'
      ),
    resolveDesignTasteJuryRunDirectory: (runId: string) =>
      path.join(tempRoot, 'agentos', 'runs', 'design-taste-jury', runId),
    resolveDesignTasteJuryManifestPath: (runId: string) =>
      path.join(
        tempRoot,
        'agentos',
        'runs',
        'design-taste-jury',
        runId,
        'manifest.json'
      ),
    resolveDesignTasteJuryIssueFilingsPath: (runId: string) =>
      path.join(
        tempRoot,
        'agentos',
        'runs',
        'design-taste-jury',
        runId,
        'issue-filings.json'
      ),
  };
});

describe('runDesignTasteJuryLoop', () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'design-taste-jury-'));
  });

  afterEach(async () => {
    vi.resetModules();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('persists a manifest with surgical capture and issue filings', async () => {
    const { runDesignTasteJuryLoop } = await import(
      '@/lib/agent-os/design-taste-jury/loop'
    );

    const result = await runDesignTasteJuryLoop({
      runId: 'loop-run-1',
      changedFiles: [
        'apps/web/features/dashboard/insights/InsightsPanelView.tsx',
      ],
      gitSha: 'abc123',
    });

    expect(result.manifest.capturePlan.capture).toHaveLength(1);
    expect(result.manifest.issueFilings.length).toBeGreaterThan(0);

    const manifestRaw = await readFile(result.manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw) as {
      readonly capturePlan: { readonly skipped: readonly string[] };
    };

    expect(manifest.capturePlan.skipped).toContain('marketing-home-desktop');
    const completion = JSON.parse(
      await readFile(
        path.join(
          tempRoot,
          'agentos',
          'runs',
          'design-taste-jury',
          'loop-run-1',
          'complete.json'
        ),
        'utf8'
      )
    ) as { readonly runId: string; readonly status: string };
    expect(completion).toEqual(
      expect.objectContaining({ runId: 'loop-run-1', status: 'completed' })
    );
  });

  it('does not mark a run complete when an output write fails', async () => {
    const runDirectory = path.join(
      tempRoot,
      'agentos',
      'runs',
      'design-taste-jury',
      'failed-run'
    );
    await mkdir(path.join(runDirectory, 'issue-filings.json'), {
      recursive: true,
    });
    const { runDesignTasteJuryLoop } = await import(
      '@/lib/agent-os/design-taste-jury/loop'
    );

    await expect(
      runDesignTasteJuryLoop({
        runId: 'failed-run',
        changedFiles: [
          'apps/web/features/dashboard/insights/InsightsPanelView.tsx',
        ],
      })
    ).rejects.toThrow();
    await expect(
      lstat(path.join(runDirectory, 'complete.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
