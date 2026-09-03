import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SystemBErrorFallback } from './SystemBErrorFallback';

const meta: Meta<typeof SystemBErrorFallback> = {
  title: 'Providers/SystemBErrorFallback',
  component: SystemBErrorFallback,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex min-h-screen'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const RetryAction: Story = {
  args: {
    title: 'Something went wrong',
    description: 'Try again in a moment.',
    digest: 'dashboard-timeout',
    action: {
      type: 'button',
      label: 'Try again',
      onClick: () => undefined,
    },
    role: 'alert',
  },
};

export const RecoveryLink: Story = {
  args: {
    description: 'This page moved. Head back home.',
    action: {
      type: 'link',
      label: 'Go home',
      href: '/',
    },
    ariaLive: 'polite',
  },
};
