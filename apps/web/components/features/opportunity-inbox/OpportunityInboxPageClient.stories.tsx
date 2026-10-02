import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { OpportunityInboxPageClient } from './OpportunityInboxPageClient';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Page Client',
  component: OpportunityInboxPageClient,
  parameters: { layout: 'fullscreen' },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof OpportunityInboxPageClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    inbox: {
      cards: [],
      emptyActionCards: [],
      availability: {
        suggestedActions: 'available',
        tourDates: 'not_requested',
      },
    },
    connectedDSPs: [],
    initialLinks: [],
  },
};

export const WithCards: Story = {
  args: {
    inbox: {
      availability: {
        suggestedActions: 'available',
        tourDates: 'not_requested',
      },
      cards: [
        {
          id: 'card-1',
          sourceKind: 'test.suggestion',
          signalType: 'other' as const,
          typeLabel: 'Suggestion',
          createdAt: '2026-09-01T18:00:00.000Z',
          title: 'Detroit listeners up 340% — book a show',
          why: 'Promoter email matched your Detroit growth spike.',
          primaryActionLabel: 'Review pitch',
          status: 'pending' as const,
          category: 'suggestion' as const,
        },
      ],
      emptyActionCards: [],
    },
    connectedDSPs: [],
    initialLinks: [],
  },
};

export const Unavailable: Story = {
  args: {
    inbox: {
      cards: [],
      emptyActionCards: [],
      availability: { suggestedActions: 'unknown', tourDates: 'not_requested' },
    },
  },
};

export const PartialTourRead: Story = {
  args: {
    ...WithCards.args,
    inbox: {
      ...WithCards.args!.inbox!,
      availability: { suggestedActions: 'available', tourDates: 'unknown' },
      tourDates: {
        availability: 'unknown',
        pending: [],
        confirmed: [],
        rejected: [],
      },
    },
  },
};

export const PartialSuggestionRead: Story = {
  args: {
    inbox: {
      cards: [],
      emptyActionCards: [],
      availability: { suggestedActions: 'unknown', tourDates: 'available' },
      tourDates: {
        availability: 'available',
        pending: [
          {
            id: 'date-1',
            title: 'Detroit Show',
            startDate: '2026-11-01T00:00:00Z',
            startTime: null,
            venueName: 'Saint Andrews Hall',
            location: 'Detroit, MI',
            providerLabel: 'Bandsintown',
            status: 'pending',
          },
        ],
        confirmed: [],
        rejected: [],
      },
    },
  },
};
