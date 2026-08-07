import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DashboardErrorFallback } from './DashboardErrorFallback';

const meta: Meta<typeof DashboardErrorFallback> = {
  title: 'Organisms/DashboardErrorFallback',
  component: DashboardErrorFallback,
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
type Story = StoryObj<typeof DashboardErrorFallback>;

const error = Object.assign(new Error('The dashboard request timed out.'), {
  digest: 'dashboard-timeout',
});

export const DashboardFatalErrorDesktop: Story = {
  args: {
    error,
    resetErrorBoundary: fn(),
  },
};

export const DashboardFatalErrorMobile: Story = {
  args: DashboardFatalErrorDesktop.args,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
