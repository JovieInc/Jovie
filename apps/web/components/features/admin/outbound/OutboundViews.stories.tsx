import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OutboundViews } from './OutboundViews';
import { outboundFixtureQueue, outboundFixtureRow } from './outbound-fixtures';

const meta = {
  title: 'Admin/Outbound/Views',
  component: OutboundViews,
  decorators: [
    Story => (
      <div className='flex w-full bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    view: 'ready',
    counts: outboundFixtureQueue([
      outboundFixtureRow(),
      outboundFixtureRow({ view: 'sent' }),
    ]).counts,
    onViewChange: fn(),
  },
} satisfies Meta<typeof OutboundViews>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Narrow: Story = {
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
};
export const SecondaryView: Story = { args: { view: 'sent' } };
export const LoadingCounts: Story = { args: { counts: undefined } };
