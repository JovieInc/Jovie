import '@/app/globals.css';
import '@/styles/system-b-app.css';
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

export const Desktop: Story = {};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
