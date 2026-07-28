import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { PageErrorState } from './PageErrorState';

const meta: Meta<typeof PageErrorState> = {
  title: 'Feedback/PageErrorState',
  component: PageErrorState,
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
type Story = StoryObj<typeof PageErrorState>;

const error = Object.assign(new Error('The dashboard request timed out.'), {
  digest: 'dashboard-timeout',
});

export const DashboardFatalErrorDesktop: Story = {
  args: {
    title: 'Unable to Load Dashboard',
    message: 'Try again in a moment.',
    error,
    onRetry: fn(),
  },
};

export const DashboardFatalErrorMobile: Story = {
  args: DashboardFatalErrorDesktop.args,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const LongErrorDetails: Story = {
  args: {
    title: 'Unable to Load Dashboard',
    message: 'Try again in a moment.',
    error: Object.assign(
      new Error(
        'The dashboard request exceeded its timeout while loading profile, audience, release, and analytics data. Please retry after checking your connection.'
      ),
      { digest: 'dashboard-long-error' }
    ),
    onRetry: fn(),
  },
};
