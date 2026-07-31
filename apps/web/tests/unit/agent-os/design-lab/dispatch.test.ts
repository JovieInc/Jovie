import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
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
  linkDesignLabDispatchToLinearIssue: vi.fn(),
  readDesignTasteMemoryExcerpt: vi.fn(),
}));

vi.mock('@/lib/hermes/dispatch', () => ({
  dispatchHermesWorker: mocks.dispatchHermesWorker,
  getHermesDispatchAvailability: () => ({ available: true }),
  HermesDispatchConfigurationError: class extends Error {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_GITHUB_OWNER: 'JovieInc',
    HUD_GITHUB_REPO: 'Jovie',
  },
}));

vi.mock('@/lib/agent-os/design-lab/taste-memory', () => ({
  readDesignTasteMemoryExcerpt: () => mocks.readDesignTasteMemoryExcerpt(),
}));

vi.mock('@/lib/agent-os/design-lab/linear', () => ({
  linkDesignLabDispatchToLinearIssue: mocks.linkDesignLabDispatchToLinearIssue,
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
    mocks.linkDesignLabDispatchToLinearIssue
      .mockReset()
      .mockResolvedValue(true);
    mocks.readDesignTasteMemoryExcerpt
      .mockReset()
      .mockResolvedValue(
        '## prior — profile — accepted\nDirection: Quiet surfaces only.'
      );
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

  it('routes approval to /design-html with full D2→D5 payload and Linear link', async () => {
    const { triggerDesignLabDispatch, DESIGN_HTML_BUILDER_SKILLS } =
      await import('@/lib/agent-os/design-lab/dispatch');

    const result = await triggerDesignLabDispatch({
      amendmentNotes: 'Keep the underline but reduce accent saturation.',
      proposal,
      requestedBy: 'tim@jovie.com',
    });

    expect(result.triggered).toBe(true);
    expect(result.dispatchId).toMatch(/^design-lab-/);

    const hermesCall = mocks.dispatchHermesWorker.mock.calls[0]?.[0] as {
      readonly skills: readonly string[];
      readonly prompt: string;
      readonly source: string;
      readonly sourceId: string;
    };
    expect(hermesCall.skills).toEqual([...DESIGN_HTML_BUILDER_SKILLS]);
    expect(hermesCall.skills).toContain('design-html');
    expect(hermesCall.source).toBe('linear');
    expect(hermesCall.sourceId).toBe('JOV-4264');
    expect(hermesCall.prompt).toContain('Surface ID: profile');
    expect(hermesCall.prompt).toContain(
      'Build the approved profile direction.'
    );
    expect(hermesCall.prompt).toContain(
      'Keep the underline but reduce accent saturation.'
    );
    expect(hermesCall.prompt).toContain('Taste memory context:');
    expect(hermesCall.prompt).toContain('Quiet surfaces only.');
    expect(hermesCall.prompt).toContain('/design-html');
    expect(hermesCall.prompt.length).toBeLessThanOrEqual(4000);

    const manifestRaw = await readFile(
      path.join(tempRoot, 'dispatches', `${result.dispatchId}.json`),
      'utf8'
    );
    const manifest = JSON.parse(manifestRaw) as {
      surfaceId: string;
      proposalText: string;
      amendmentNotes: string | null;
      tasteMemoryExcerpt: string;
      linearIssueId: string;
    };
    expect(manifest.surfaceId).toBe('profile');
    expect(manifest.proposalText).toBe('Build the approved profile direction.');
    expect(manifest.amendmentNotes).toBe(
      'Keep the underline but reduce accent saturation.'
    );
    expect(manifest.tasteMemoryExcerpt).toContain('Quiet surfaces only.');
    expect(manifest.linearIssueId).toBe('JOV-4264');

    expect(mocks.linkDesignLabDispatchToLinearIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        issueIdentifier: 'JOV-4264',
        dispatchId: result.dispatchId,
        surfaceId: 'profile',
        surfaceName: 'Profile',
        proposalId: 'proposal-1',
        amendmentNotes: 'Keep the underline but reduce accent saturation.',
        artifactRelativePath: `agentos/runs/design-lab/artifacts/${result.dispatchId}/`,
        dispatchRelativePath: `agentos/runs/design-lab/dispatches/${result.dispatchId}.json`,
        artifactUrl: expect.stringContaining(
          `agentos/runs/design-lab/artifacts/${result.dispatchId}`
        ),
      })
    );
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
    expect(mocks.linkDesignLabDispatchToLinearIssue).not.toHaveBeenCalled();
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

describe('buildDesignHtmlDispatchPrompt', () => {
  it('includes surface, proposal, amendments, and taste memory', async () => {
    const { buildDesignHtmlDispatchPrompt } = await import(
      '@/lib/agent-os/design-lab/dispatch'
    );

    const prompt = buildDesignHtmlDispatchPrompt({
      dispatchId: 'design-lab-00000000-0000-4000-8000-000000000099',
      proposalId: 'proposal-1',
      surfaceId: 'dashboard-sidebar',
      surfaceName: 'Dashboard sidebar',
      proposalText: 'Collapse unused nav groups by default.',
      amendmentNotes: 'Keep icons monochrome.',
      linearIssueId: 'JOV-1939',
      linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1939',
      tasteMemoryExcerpt: 'Reject loud accent squares on chrome.',
      requestedAt: '2026-07-31T00:00:00.000Z',
      requestedBy: 'tim@jovie.com',
    });

    expect(prompt).toContain('Surface ID: dashboard-sidebar');
    expect(prompt).toContain('Collapse unused nav groups by default.');
    expect(prompt).toContain('Keep icons monochrome.');
    expect(prompt).toContain('Taste memory context:');
    expect(prompt).toContain('Reject loud accent squares on chrome.');
    expect(prompt).toContain('/design-html');
    expect(prompt.length).toBeLessThanOrEqual(4000);
  });
});
