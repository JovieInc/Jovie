import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
        id: 'connect-catalog',
        title: 'Connect Catalog',
        body: 'Link your catalog so Jovie can spot releases.',
        actionLabel: 'Connect Catalog',
        href: '/app/profiles',
      },
    ],
  },
};

export const Narrow: Story = {
  args: {},
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
