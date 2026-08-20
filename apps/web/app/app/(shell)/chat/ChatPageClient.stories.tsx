import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ChatProfileFallback } from './ChatPageClient';

const meta = {
  title: 'App/Chat/Profile Fallback',
  component: ChatProfileFallback,
  parameters: { layout: 'fullscreen' },
  args: {
    needsOnboarding: false,
    dashboardLoadError: new Error('Dashboard unavailable'),
    isProfileSetupRace: false,
    canAutoRetry: false,
    autoRetryCount: 0,
    onRetry: fn(),
  },
  render: args => (
    <div className='relative h-[40rem] overflow-hidden bg-base'>
      <ChatProfileFallback {...args} />
    </div>
  ),
} satisfies Meta<typeof ChatProfileFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ErrorState: Story = {};

export const SetupLoading: Story = {
  args: {
    dashboardLoadError: null,
    isProfileSetupRace: true,
    canAutoRetry: true,
  },
};

export const ErrorNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
