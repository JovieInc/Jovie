import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  listPendingDesignProposalsMock: vi.fn(),
  serverFetchMock: vi.fn(),
}));

vi.mock('@/lib/agent-os/design-lab/proposals', () => ({
  listPendingDesignProposals: hoisted.listPendingDesignProposalsMock,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: hoisted.serverFetchMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: { LINEAR_API_KEY: 'lin_api_test' },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe('buildMobileTasteInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listPendingDesignProposalsMock.mockResolvedValue([
      {
        id: 'card-1',
        surfaceId: 'hud',
        surfaceName: 'Taste card',
        proposalText: 'Approve the quiet hero treatment.',
        assetRefs: ['agentos/runs/design-lab/assets/local.png'],
        createdAt: '2026-08-01T00:00:00.000Z',
        dayBucket: '2026-08-01',
      },
      {
        id: 'still-1',
        surfaceId: 'merch',
        surfaceName: 'Merch still',
        proposalText: 'Existing Telegram still — do not regenerate.',
        assetRefs: ['https://cdn.jov.ie/stills/16197.jpg'],
        createdAt: '2026-08-02T00:00:00.000Z',
        dayBucket: '2026-08-02',
      },
    ]);
    hoisted.serverFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue-1',
                  identifier: 'JOV-3294',
                  title: 'Taste Inbox pane',
                  url: 'https://linear.app/jovie/issue/JOV-3294',
                  priority: 2,
                  priorityLabel: 'High',
                  createdAt: '2026-08-03T00:00:00.000Z',
                  description: 'Needs a founder yes/no.',
                  labels: { nodes: [{ id: 'l1', name: 'needs:taste' }] },
                },
              ],
            },
          },
        }),
        { status: 200 }
      )
    );
  });

  it('maps Taste issues and Design Lab cards/stills without artist action-loop items', async () => {
    const { buildMobileTasteInbox } = await import('./taste-inbox');
    const payload = await buildMobileTasteInbox();

    expect(payload.chatPrompt).toContain('Summer');
    expect(payload.items.map(item => item.typeLabel)).toEqual([
      'Taste',
      'Still',
      'Card',
    ]);
    expect(
      payload.items.find(item => item.typeLabel === 'Still')?.imageUrl
    ).toBe('https://cdn.jov.ie/stills/16197.jpg');
    expect(
      payload.items.find(item => item.typeLabel === 'Card')?.imageUrl
    ).toBeNull();
    expect(payload.items.some(item => item.id.startsWith('action-'))).toBe(
      false
    );
  });
});
