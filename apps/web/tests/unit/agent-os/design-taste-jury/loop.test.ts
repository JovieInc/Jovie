import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let tempRoot = '';

const juryRootDirectory = () =>
  path.join(tempRoot, 'agentos', 'runs', 'design-taste-jury');

vi.mock('@/lib/agent-os/design-taste-jury/paths', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/agent-os/design-taste-jury/paths')
  >('@/lib/agent-os/design-taste-jury/paths');

  return {
    ...actual,
    getDesignTasteJuryRootDirectory: juryRootDirectory,
    resolveDesignTasteJuryRunDirectory: (runId: string) =>
      path.join(juryRootDirectory(), runId),
    resolveDesignTasteJuryResultPath: (runId: string) =>
      path.join(juryRootDirectory(), runId, 'loop-result.json'),
    resolveDesignTasteJuryCapturePlanPath: (runId: string) =>
      path.join(juryRootDirectory(), runId, 'capture-plan.json'),
    resolveDesignTasteJuryConsensusPath: (runId: string) =>
      path.join(juryRootDirectory(), runId, 'consensus.json'),
  };
});

vi.mock('@/lib/filesystem-paths', async () => {
  const actual = await vi.importActual<typeof import('@/lib/filesystem-paths')>(
    '@/lib/filesystem-paths'
  );

  return {
    ...actual,
    resolveMonorepoPath: (...segments: string[]) =>
      path.join(tempRoot, ...segments),
  };
});

vi.mock('@/lib/agent-os/design-taste-jury/gbrain-write', () => ({
  persistDesignTasteFindings: vi.fn(async () => ({
    tasteMemoryWritten: true,
    gbrainWritten: false,
  })),
}));

describe('runDesignTasteJuryLoop', () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'design-taste-jury-'));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('skips unchanged screens for non-UI diffs', async () => {
    const { runDesignTasteJuryLoop } = await import(
      '@/lib/agent-os/design-taste-jury/loop'
    );

    const result = await runDesignTasteJuryLoop({
      runId: 'loop-skip',
      changedFiles: ['apps/web/lib/db/index.ts'],
      dryRun: true,
    });

    expect(result.capturePlan.skipped).toBe(true);
    expect(result.jury).toBeNull();
    expect(result.filedIssues).toEqual([]);

    const artifact = await readFile(
      path.join(
        tempRoot,
        'agentos',
        'runs',
        'design-taste-jury',
        'loop-skip',
        'loop-result.json'
      ),
      'utf8'
    );

    expect(artifact).toContain('screenshot capture skipped');
  });

  it('files ship drafts and persists taste findings for UI diffs', async () => {
    const { runDesignTasteJuryLoop } = await import(
      '@/lib/agent-os/design-taste-jury/loop'
    );

    const result = await runDesignTasteJuryLoop({
      runId: 'loop-run',
      changedFiles: ['apps/web/app/(home)/page.tsx'],
      signals: [
        {
          surfaceId: 'homepage',
          kind: 'pixel_drift',
          title: 'Homepage drift',
          summary: 'Hero band shifted by 12px.',
          severity: 0.8,
          compArtifactPath: 'agentos/runs/visual-qa/loop-run/diff-overlay.png',
        },
        {
          surfaceId: 'homepage',
          kind: 'marketing_composition',
          title: 'Hero composition',
          summary: 'Poster composition is too busy.',
          severity: 0.6,
          compArtifactPath: null,
        },
      ],
      dryRun: true,
    });

    expect(result.capturePlan.skipped).toBe(false);
    expect(result.capturePlan.targets).toHaveLength(1);
    expect(result.jury?.consensus).toHaveLength(2);
    expect(result.filedIssues).toHaveLength(1);
    expect(result.filedIssues[0]?.draft.queueTag).toBe('ship');
    expect(result.tasteMemoryWritten).toBe(true);
  });
});
