import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Empty State',
  component: OpportunityInboxEmptyState,
  parameters: { layout: 'fullscreen' },
  render: args => (
    <div className='min-h-screen bg-(--app-shell-content-surface) px-3 py-5'>
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

export const FirstRun: Story = {
  args: {
    setup: { profileComplete: false, musicConnected: false, linksAdded: false },
  },
};

export const PartiallyComplete: Story = {
  args: {
    setup: { profileComplete: true, musicConnected: true, linksAdded: false },
  },
};

export const SetupComplete: Story = {
  args: {
    setup: { profileComplete: true, musicConnected: true, linksAdded: true },
  },
};
