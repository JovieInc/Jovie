import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LazyProviders } from './LazyProviders';

const meta = {
  title: 'Providers/LazyProviders',
  component: LazyProviders,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: (
      <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
        Page content
      </p>
    ),
  },
} satisfies Meta<typeof LazyProviders>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AnalyticsDisabled: Story = {
  args: {
    enableAnalytics: false,
  },
};
