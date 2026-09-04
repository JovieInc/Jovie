import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ErrorBoundary from './ErrorBoundary';

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Organisms/ErrorBoundary',
  component: ErrorBoundary,
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

export const DashboardRetry: Story = {
  args: {
    error: Object.assign(new Error('The dashboard request timed out.'), {
      digest: 'dashboard-timeout',
    }),
    reset: () => undefined,
    context: 'Dashboard',
  },
};

export const DeploymentSkewReload: Story = {
  args: {
    error: new Error('Failed to find server action. Refresh to try again.'),
    reset: () => undefined,
    context: 'Global',
    message: 'This app was updated. Reload to get the latest version.',
  },
};
