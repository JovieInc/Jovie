import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHudAiOpsSummary } from '@/lib/hud/ai-ops';

const mockEnv = vi.hoisted(() => ({
  HUD_GITHUB_TOKEN: 'hud-token',
  HUD_GITHUB_OWNER: 'JovieInc',
  HUD_GITHUB_REPO: 'Jovie',
  GH_DISPATCH_TOKEN: 'dispatch-token',
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

describe('getHudAiOpsSummary', () => {
  beforeEach(() => {
    mockEnv.HUD_GITHUB_TOKEN = 'hud-token';
    mockEnv.HUD_GITHUB_OWNER = 'JovieInc';
    mockEnv.HUD_GITHUB_REPO = 'Jovie';
    mockEnv.GH_DISPATCH_TOKEN = 'dispatch-token';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('degrades when GitHub HUD source is not configured', async () => {
    mockEnv.HUD_GITHUB_TOKEN = undefined;

    const summary = await getHudAiOpsSummary(
      new Date('2026-05-07T12:00:00.000Z')
    );

    expect(summary.availability).toBe('not_configured');
    expect(summary.dispatch.available).toBe(true);
    expect(summary.sources.github.availability).toBe('not_configured');
    expect(summary.recommendations[0]?.summary).toContain('Dispatch');
  });

  it('normalizes blocked PRs and partial workflow failures', async () => {
    mockServerFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 42,
              title: 'Fix agent regression',
              html_url: 'https://github.com/JovieInc/Jovie/pull/42',
              updated_at: '2026-05-07T11:00:00.000Z',
              draft: false,
              labels: [{ name: 'needs-human' }],
              user: { login: 'jovie-bot' },
              head: { ref: 'codex/fix-agent-regression' },
            },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'not found' }), {
          status: 404,
        })
      );

    const summary = await getHudAiOpsSummary(
      new Date('2026-05-07T12:00:00.000Z')
    );

    expect(summary.availability).toBe('partial');
    expect(summary.counts.blocked).toBe(1);
    expect(summary.blockers[0]?.summary).toContain('#42');
    expect(summary.sources.ci.availability).toBe('error');
    expect(summary.mergeQueue.openAgentPrs).toBe(1);
  });
});
