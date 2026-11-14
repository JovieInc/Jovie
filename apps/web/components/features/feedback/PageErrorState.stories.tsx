import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
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

export const ContactsReadTimeout: Story = {
  args: {
    message: 'Failed to load contacts. Please refresh the page.',
    onRetry: fn(),
  },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(args.message!);
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const AudienceReadTimeoutMobile: Story = {
  ...ContactsReadTimeout,
  args: {
    message: 'Failed to load audience data. Please refresh the page.',
    onRetry: fn(),
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const WorkspaceReadTimeout: Story = {
  ...ContactsReadTimeout,
  args: {
    message: 'Failed to load your workspace. Please refresh the page.',
    onRetry: fn(),
  },
};

export const ErrorWithDiagnostics: Story = {
  args: {
    title: 'Unable to Load Dashboard',
    message: 'Try again in a moment.',
    error: Object.assign(new Error('Request timed out after 30 seconds.'), {
      digest: 'dashboard-timeout',
    }),
    onRetry: fn(),
  },
};

/** Only the required message: default title, default action, no error object. */
export const PartialMessageOnly: Story = {
  args: {
    message: 'Failed to load your workspace. Please refresh the page.',
    onRetry: fn(),
  },
};

export const RtlArabicCopy: Story = {
  args: {
    title: 'تعذر تحميل لوحة التحكم',
    message: 'حاول مرة أخرى بعد قليل.',
    actionLabel: 'إعادة المحاولة',
    error: Object.assign(new Error('انتهت مهلة الطلب بعد ثلاثين ثانية.'), {
      digest: 'dashboard-timeout',
    }),
    onRetry: fn(),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='flex min-h-screen'>
        <Story />
      </div>
    ),
  ],
};
