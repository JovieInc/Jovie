import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildSpotifyCatalogConnectionRoute } from '@/constants/routes';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Empty State',
  component: OpportunityInboxEmptyState,
  parameters: { layout: 'fullscreen' },
  render: args => (
    <div className='flex h-[32rem] bg-(--app-shell-content-surface)'>
      <OpportunityInboxEmptyState {...args} />
    </div>
  ),
} satisfies Meta<typeof OpportunityInboxEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  args: {
    actionCards: [
      {
        id: 'connect-spotify',
        title: 'Connect Spotify',
        body: 'Link your catalog so Jovie can spot releases.',
        actionLabel: 'Connect Spotify',
        href: buildSpotifyCatalogConnectionRoute(),
      },
    ],
  },
};

export const Narrow: Story = {
  args: {},
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
