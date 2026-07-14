import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignProposal } from '@/lib/agent-os/design-lab/types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  dispatchHermesWorker: vi.fn(),
}));

vi.mock('@/lib/hermes/dispatch', () => ({
  dispatchHermesWorker: mocks.dispatchHermesWorker,
  getHermesDispatchAvailability: () => ({ available: true }),
  HermesDispatchConfigurationError: class extends Error {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/agent-os/design-lab/taste-memory', () => ({
  readDesignTasteMemoryExcerpt: () => Promise.resolve(''),
}));

let tempRoot = '';

vi.mock('@/lib/agent-os/design-lab/paths', () => ({
  getDesignLabArtifactDirectory: () => path.join(tempRoot, 'artifacts'),
  getDesignLabDispatchDirectory: () => path.join(tempRoot, 'dispatches'),
  resolveDesignDispatchFilePath: (dispatchId: string) =>
    path.join(tempRoot, 'dispatches', `${dispatchId}.json`),
  resolveDesignLabArtifactRunDirectory: (dispatchId: string) =>
    path.join(tempRoot, 'artifacts', dispatchId),
}));

const proposal: DesignProposal = {
  assetRefs: [],
  createdAt: '2026-07-13T00:00:00.000Z',
  dayBucket: '2026-07-13',
  dispatchId: null,
  id: 'proposal-1',
  linearIssueId: 'JOV-4264',
  linearIssueUrl: 'https://linear.app/jovie/issue/JOV-4264',
  proposalText: 'Build the approved profile direction.',
  reviewDecision: null,
  reviewedAt: null,
  reviewer: null,
  reviewNotes: null,
  scoring: null,
  status: 'pending',
  surfaceId: 'profile',
  surfaceName: 'Profile',
};

describe('triggerDesignLabDispatch artifact lifecycle', () => {
  beforeEach(async () => {
    tempRoot = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'design-lab-dispatch-'))
    );
    mocks.dispatchHermesWorker.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.resetModules();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('scopes worker output and requires the terminal marker last', async () => {
    const { triggerDesignLabDispatch } = await import(
      '@/lib/agent-os/design-lab/dispatch'
    );
    const result = await triggerDesignLabDispatch({
      amendmentNotes: null,
      proposal,
      requestedBy: 'test',
    });

    expect(result.dispatchId).toMatch(/^design-lab-/);
    expect(mocks.dispatchHermesWorker).toHaveBeenCalledOnce();
    const call = mocks.dispatchHermesWorker.mock.calls[0]?.[0] as {
      readonly prompt: string;
    };
    expect(call.prompt).toContain(
      `agentos/runs/design-lab/artifacts/${result.dispatchId}/complete.json LAST`
    );
    expect(call.prompt).toContain(
      `{"status":"completed","runId":"${result.dispatchId}"}`
    );
    expect(
      await lstat(path.join(tempRoot, 'artifacts', result.dispatchId ?? ''))
    ).toBeTruthy();
  });

  it('rejects a new dispatch when unknown symlinked output makes usage unknowable', async () => {
    const outside = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'design-lab-outside-'))
    );
    await mkdir(path.join(tempRoot, 'artifacts'), { recursive: true });
    await symlink(outside, path.join(tempRoot, 'artifacts', 'unknown-output'));
    const { triggerDesignLabDispatch } = await import(
      '@/lib/agent-os/design-lab/dispatch'
    );

    await expect(
      triggerDesignLabDispatch({
        amendmentNotes: null,
        proposal,
        requestedBy: 'test',
      })
    ).rejects.toThrow(/symlinked artifact path/);
    expect(mocks.dispatchHermesWorker).not.toHaveBeenCalled();
    expect(await readdir(path.join(tempRoot, 'artifacts'))).toEqual([
      'unknown-output',
    ]);
    expect(await lstat(outside)).toBeTruthy();
    await rm(outside, { recursive: true, force: true });
  });

  it('rolls back an empty reservation when it alone crosses the directory budget', async () => {
    const artifactRoot = path.join(tempRoot, 'artifacts');
    await mkdir(artifactRoot, { recursive: true });
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        mkdir(path.join(artifactRoot, `existing-${index}`))
      )
    );
    const { triggerDesignLabDispatch } = await import(
      '@/lib/agent-os/design-lab/dispatch'
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        triggerDesignLabDispatch({
          amendmentNotes: null,
          proposal,
          requestedBy: 'test',
        })
      ).rejects.toThrow(/Artifact budget exceeded/);
      expect(await readdir(artifactRoot)).toHaveLength(100);
    }
    expect(mocks.dispatchHermesWorker).not.toHaveBeenCalled();
  });
});
