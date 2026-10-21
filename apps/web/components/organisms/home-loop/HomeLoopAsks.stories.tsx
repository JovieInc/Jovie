import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HOME_LOOP_FIXTURE_ASKS } from './fixtures';
import { HomeLoopAsks } from './HomeLoopAsks';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopAsks',
  component: HomeLoopAsks,
  parameters: { layout: 'padded' },
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS,
    answers: {},
    onApprove: fn(),
    onReply: fn(),
  },
} satisfies Meta<typeof HomeLoopAsks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Answered: Story = {
  args: {
    answers: {
      'vercel-concurrency': { label: 'Approved', state: 'pending' },
      'lyb-review': { label: 'Not recorded. Try again.', state: 'failed' },
    },
  },
};

export const OverflowLinksToInbox: Story = {
  args: {
    asks: [
      ...HOME_LOOP_FIXTURE_ASKS,
      ...HOME_LOOP_FIXTURE_ASKS.map(ask => ({ ...ask, id: `${ask.id}-2` })),
    ],
    moreHref: '/app/ov/inbox',
  },
};

export const WithAskerOptions: Story = {
  args: {
    asks: HOME_LOOP_FIXTURE_ASKS.map((ask, index) =>
      index === 0
        ? { ...ask, options: ['Signed in', 'Restarted it myself'] }
        : ask
    ),
  },
};
