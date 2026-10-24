import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeLoopConstraintBanner } from './HomeLoopPulse';

const meta = {
  title: 'Organisms/HomeLoop/HomeLoopConstraintBanner',
  component: HomeLoopConstraintBanner,
  args: {
    constraint: { tone: 'warn', text: 'Shipping data is disconnected' },
    emptyLabel: 'Nothing is blocking shipping',
    loading: false,
    appearance: 'default',
  },
} satisfies Meta<typeof HomeLoopConstraintBanner>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Quiet: Story = { args: { appearance: 'quiet' } };
export const Loading: Story = { args: { appearance: 'quiet', loading: true } };
export const Clear: Story = { args: { appearance: 'quiet', constraint: null } };
