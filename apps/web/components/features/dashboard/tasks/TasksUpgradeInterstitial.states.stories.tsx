import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  CompactReleasePlanUpgradeCard,
  ReleasePlanUpgradeInterstitial,
  TasksWorkspaceUpgradeInterstitial,
} from './TasksUpgradeInterstitial';

function UpgradeStatesQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Rendered states of the tasks upgrade prompts. The plain renders live in
 * TasksUpgradeInterstitial.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Tasks/TasksUpgradeInterstitial/States',
  parameters: {
    layout: 'padded',
    jovie: {
      uncoveredProps: ['heading', 'description', 'secondaryLabel'],
    },
  },
  decorators: [
    function WithUpgradeQueries(StoryComponent) {
      return (
        <UpgradeStatesQueryProvider>
          <StoryComponent />
        </UpgradeStatesQueryProvider>
      );
    },
  ],
} satisfies Meta<typeof ReleasePlanUpgradeInterstitial>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Permission denied: a free workspace opening Tasks sees the upgrade gate. */
export const PermissionDeniedWorkspace: Story = {
  render: function PermissionDeniedWorkspaceRender() {
    return (
      <div className='h-96'>
        <TasksWorkspaceUpgradeInterstitial />
      </div>
    );
  },
};

/** Empty: no release title, so the copy names "this release". */
export const EmptyReleaseTitle: Story = {
  render: function EmptyReleaseTitleRender() {
    return <ReleasePlanUpgradeInterstitial releaseTitle={null} />;
  },
};

/** Partial: the compact card with a dismiss action instead of a link. */
export const PartialCompactCard: Story = {
  render: function PartialCompactCardRender() {
    return <CompactReleasePlanUpgradeCard onDismiss={() => {}} />;
  },
};

/** Long content: a release title long enough to wrap the description. */
export const LongContentReleaseTitle: Story = {
  render: function LongContentReleaseTitleRender() {
    return (
      <ReleasePlanUpgradeInterstitial releaseTitle='Skyline Dreams (Extended Club Mix featuring the Midnight Orchestra and Friends)' />
    );
  },
};

/** Right-to-left: an Arabic release title in an Arabic document direction. */
export const RtlArabicReleaseTitle: Story = {
  render: function RtlArabicReleaseTitleRender() {
    return (
      <div dir='rtl' lang='ar'>
        <ReleasePlanUpgradeInterstitial releaseTitle='أحلام الأفق' />
      </div>
    );
  },
};
