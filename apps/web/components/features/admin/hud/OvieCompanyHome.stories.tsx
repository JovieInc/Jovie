import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OvieCompanyHome } from './OvieCompanyHome';

const meta = {
  title: 'Features/Admin/Hud/OvieCompanyHome',
  component: OvieCompanyHome,
  parameters: { layout: 'padded' },
  args: {
    tiles: null,
    since: null,
    copy: {
      constraintClear: 'Nothing is blocking shipping',
      asksTitle: 'Blocked On You',
      asksEmpty: 'Nothing needs your decision.',
      asksError: 'Decisions could not load.',
      inFlightTitle: 'In Flight',
      inFlightEmpty: 'No work in flight.',
      inFlightError: 'Shipping data could not load.',
      doneTitle: 'Shipped Today',
      doneEmpty: 'Nothing has landed yet today.',
      latencyTitle: 'Stage Time 7d (P50 / P95)',
      latencyEmpty: 'Not measured',
    },
    asks: [],
    asksStatus: 'ready',
    answers: {},
    done: [],
    doneSummary: null,
    loopStatus: 'ready',
    onApprove: () => undefined,
    onReply: () => undefined,
  },
} satisfies Meta<typeof OvieCompanyHome>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const Empty: Story = {
  args: { tiles: [], asksStatus: 'ready', loopStatus: 'ready' },
};
