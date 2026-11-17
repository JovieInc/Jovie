import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxRouteSkeleton } from './OpportunityInboxRouteSkeleton';

const meta = {
  title: 'OpportunityInbox/OpportunityInboxRouteSkeleton',
  component: OpportunityInboxRouteSkeleton,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='relative flex h-160 w-full overflow-hidden bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OpportunityInboxRouteSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The first-boot main slot `/app` shows while its inbox data streams. */
export const Loading: Story = {};

export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div
        dir='rtl'
        lang='ar'
        className='relative flex h-160 w-full overflow-hidden bg-base'
      >
        <Story />
      </div>
    ),
  ],
};
