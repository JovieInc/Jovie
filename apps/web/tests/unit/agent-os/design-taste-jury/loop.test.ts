import { mkdtemp, readFile } from 'node:fs/promises';
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

  afterEach(() => {
    vi.resetModules();
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
  });
});
