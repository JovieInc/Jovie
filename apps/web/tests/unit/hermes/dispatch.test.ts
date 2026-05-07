import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchHermesWorker,
  getHermesDispatchAvailability,
  normalizeHermesDispatchRequest,
} from '@/lib/hermes/dispatch';

const mockEnv = vi.hoisted(() => ({
  GH_DISPATCH_TOKEN: 'dispatch-token',
  HUD_GITHUB_OWNER: 'JovieInc',
  HUD_GITHUB_REPO: 'Jovie',
  VERCEL_GIT_REPO_OWNER: undefined as string | undefined,
  VERCEL_GIT_REPO_SLUG: undefined as string | undefined,
}));
const mockServerFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: mockEnv,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mockServerFetch,
}));

describe('Hermes dispatch', () => {
  beforeEach(() => {
    mockEnv.GH_DISPATCH_TOKEN = 'dispatch-token';
    mockEnv.HUD_GITHUB_OWNER = 'JovieInc';
    mockEnv.HUD_GITHUB_REPO = 'Jovie';
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes skills, defaults, and branch names', () => {
    const payload = normalizeHermesDispatchRequest({
      source: 'linear',
      sourceId: 'JOV-123',
      sourceUrl: 'https://linear.app/jovie/issue/JOV-123/test',
      kind: 'bug_patch',
      runtime: 'codex-cli',
      skills: ['/investigate'],
      dryRun: true,
    });

    expect(payload.skills).toEqual(['investigate']);
    expect(payload.allowedPaths).toContain('apps/web');
    expect(payload.verification).toEqual([
      'pnpm --filter web exec tsc --noEmit',
    ]);
    expect(payload.branchName).toMatch(/^codex\/hermes-bug_patch-jov-123-/);
  });

  it('rejects unsafe verification commands', () => {
    expect(() =>
      normalizeHermesDispatchRequest({
        source: 'hermes',
        kind: 'investigation',
        runtime: 'claude-code',
        verification: ['rm -rf .next'],
      })
    ).toThrow();
  });

  it('reports unavailable dispatch config', () => {
    mockEnv.GH_DISPATCH_TOKEN = undefined;

    expect(getHermesDispatchAvailability()).toEqual({
      available: false,
      unavailableReason: 'GH_DISPATCH_TOKEN is not configured.',
      runtimes: ['codex-cli', 'claude-code', 'ruflo'],
    });
  });

  it('sends a repository_dispatch payload for Hermes workers', async () => {
    const result = await dispatchHermesWorker({
      source: 'github',
      sourceId: '123',
      sourceUrl: 'https://github.com/JovieInc/Jovie/issues/123',
      kind: 'investigation',
      runtime: 'ruflo',
      skills: ['autoplan', 'investigate'],
      dryRun: false,
    });

    expect(result.eventType).toBe('hermes_cli_worker');
    expect(result.branchName).toMatch(/^codex\/hermes-investigation-123-/);
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/JovieInc/Jovie/dispatches',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'token dispatch-token',
        }),
      })
    );

    const body = JSON.parse(mockServerFetch.mock.calls[0][1].body);
    expect(body.event_type).toBe('hermes_cli_worker');
    expect(body.client_payload.runtime).toBe('ruflo');
    expect(body.client_payload.skills).toEqual(['autoplan', 'investigate']);
  });
});
