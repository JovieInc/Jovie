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
              labels: [{ name: 'hold' }],
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
    expect(summary.mergeQueue.pressure).toBe('normal');
  });

  it('counts numeric jov branches and ignores non-numeric ones', async () => {
    mockServerFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              number: 15,
              title: 'Numeric agent',
              html_url: 'https://github.com/JovieInc/Jovie/pull/15',
              updated_at: '2026-05-07T11:00:00.000Z',
              draft: false,
              labels: [{ name: 'hold' }],
              user: { login: 'bot' },
              head: { ref: 'feature/jov-15' },
            },
            {
              number: 16,
              title: 'Letter agent',
              html_url: 'https://github.com/JovieInc/Jovie/pull/16',
              updated_at: '2026-05-07T11:00:00.000Z',
              draft: false,
              labels: [],
              user: { login: 'bot' },
              head: { ref: 'feature/jov-abc' },
            },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
      );

    const summary = await getHudAiOpsSummary(
      new Date('2026-05-07T12:00:00.000Z')
    );

    expect(summary.mergeQueue.openAgentPrs).toBe(1);
    expect(summary.blockers.some(item => item.summary.includes('#15'))).toBe(
      true
    );
    expect(summary.blockers.some(item => item.summary.includes('#16'))).toBe(
      false
    );
  });

  it('raises merge pressure at seven and ten open agent PRs', async () => {
    const pulls = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        number: index + 1,
        title: `Agent PR ${index + 1}`,
        html_url: `https://github.com/JovieInc/Jovie/pull/${index + 1}`,
        updated_at: '2026-05-07T11:00:00.000Z',
        draft: false,
        labels: [],
        user: { login: 'jovie-bot' },
        head: { ref: `codex/agent-${index + 1}` },
      }));

    mockServerFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pulls(7)), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
      );
    const elevated = await getHudAiOpsSummary(
      new Date('2026-05-07T12:00:00.000Z')
    );
    expect(elevated.availability).toBe('available');
    expect(elevated.sources.github.availability).toBe('available');
    expect(elevated.mergeQueue.pressure).toBe('elevated');

    mockServerFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pulls(10)), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
      );
    const high = await getHudAiOpsSummary(new Date('2026-05-07T12:00:00.000Z'));
    expect(high.mergeQueue.pressure).toBe('high');
  });

  it('reports an error when both GitHub reads fail', async () => {
    mockServerFetch
      .mockResolvedValueOnce(new Response('no', { status: 500 }))
      .mockResolvedValueOnce(new Response('no', { status: 503 }));

    const summary = await getHudAiOpsSummary(
      new Date('2026-05-07T12:00:00.000Z')
    );

    expect(summary.availability).toBe('error');
    expect(summary.sources.github.availability).toBe('error');
    expect(summary.sources.ci.availability).toBe('error');
  });
});
