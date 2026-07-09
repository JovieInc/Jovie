import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  loadOpportunityInboxDataMock: vi.fn(),
}));

vi.mock('@/lib/connectors/opportunity-inbox-data', () => ({
  loadOpportunityInboxData: hoisted.loadOpportunityInboxDataMock,
}));

const { buildMobileInbox } = await import('@/lib/mobile/action-loop-inbox');

describe('buildMobileInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the web inbox loader cannot resolve a profile', async () => {
    hoisted.loadOpportunityInboxDataMock.mockResolvedValue(null);

    await expect(buildMobileInbox('user_123')).resolves.toBeNull();
  });

  it('maps pending cards and empty-state actions for mobile', async () => {
    hoisted.loadOpportunityInboxDataMock.mockResolvedValue({
      cards: [
        {
          id: 'action-1',
          signalType: 'other' as const,
          typeLabel: 'Suggestion',
          createdAt: '2026-06-28T10:00:00.000Z',
          title: 'Detroit listeners up 340% — book a show',
          why: 'Promoter email matched your Detroit growth spike.',
          primaryActionLabel: 'Add to calendar',
          status: 'pending',
          category: 'suggestion' as const,
        },
      ],
      emptyActionCards: [
        {
          id: 'connect-spotify',
          title: 'Connect Spotify',
          body: 'Link your catalog so Jovie can spot releases.',
          actionLabel: 'Connect catalog',
          href: '/app/settings/artist-profile',
        },
      ],
    });

    await expect(buildMobileInbox('user_123')).resolves.toEqual({
      pendingCount: 1,
      items: [
        {
          id: 'action-1',
          typeLabel: 'Suggestion',
          createdAt: '2026-06-28T10:00:00.000Z',
          title: 'Detroit listeners up 340% — book a show',
          why: 'Promoter email matched your Detroit growth spike.',
          primaryActionLabel: 'Add to calendar',
          status: 'pending',
        },
      ],
      emptyActionCards: [
        {
          id: 'connect-spotify',
          title: 'Connect Spotify',
          body: 'Link your catalog so Jovie can spot releases.',
          actionLabel: 'Connect catalog',
          continueOnWebPath: '/app/settings/artist-profile',
        },
      ],
      chatPrompt:
        'Ask Jovie which revenue opportunities I should act on first.',
    });
  });
});
