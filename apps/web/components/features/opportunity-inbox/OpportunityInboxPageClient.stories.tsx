import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useState } from 'react';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { queryKeys } from '@/lib/queries/keys';
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

function CompletedWorkFixture({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    client.setQueryData(
      [
        ...queryKeys.dashboard.jovieWorkFeed(
          '11111111-1111-4111-8111-111111111111',
          '30d'
        ),
        { completedOnly: true },
      ],
      [
        {
          id: 'workflow-story',
          source: 'workflow_run',
          phase: 'completed',
          title: 'Release workflow completed',
          description:
            'Completed work fixture with unavailable outcome measurement.',
          icon: 'workflow',
          timestamp: '2026-01-15T10:00:00Z',
          statusLabel: 'Done',
        },
      ]
    );
    setReady(true);
  }, [client]);
  return ready ? children : null;
}

export const DoneForYou: Story = {
  args: {
    ...Empty.args,
    initialView: 'done',
    profileId: '11111111-1111-4111-8111-111111111111',
  },
  decorators: [
    Story => (
      <CompletedWorkFixture>
        <Story />
      </CompletedWorkFixture>
    ),
  ],
};
