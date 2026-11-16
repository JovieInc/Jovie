import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DashboardErrorFallback } from './DashboardErrorFallback';

/**
 * State coverage for the dashboard error boundary fallback. These render the
 * same fallback as DashboardErrorFallback.stories.tsx and change only the
 * error the boundary caught or the document direction.
 */
const meta = {
  title: 'Organisms/DashboardErrorFallback States',
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
  args: {
    error: Object.assign(new Error('The dashboard request timed out.'), {
      digest: 'dashboard-timeout',
    }),
    resetErrorBoundary: fn(),
  },
} satisfies Meta<typeof DashboardErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a thrown error with no message falls back to the default copy. */
export const ErrorWithoutMessage: Story = {
  args: {
    error: new Error(''),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        'An unexpected error occurred while loading your dashboard.'
      )
    ).toBeVisible();
  },
};

/** Offline: the dashboard request failed because the network dropped. */
export const OfflineNetworkFailure: Story = {
  args: {
    error: new TypeError('Failed to fetch'),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Failed to fetch')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.resetErrorBoundary).toHaveBeenCalled();
  },
};

const LONG_MESSAGE =
  'The dashboard could not load because three of its data sources (releases, audience and earnings) each timed out after thirty seconds while the upstream analytics provider was degraded. Nothing you changed was lost.';

/** Long content: a long error message wraps inside the recovery card. */
export const LongContentErrorMessage: Story = {
  args: {
    error: Object.assign(new Error(LONG_MESSAGE), {
      digest: 'dashboard-upstream-timeout-7f3a9c2e',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_MESSAGE)).toBeVisible();
  },
};

/** Right-to-left: an Arabic error message inside an RTL document. */
export const RtlArabicError: Story = {
  args: {
    error: new Error('انتهت مهلة طلب لوحة التحكم.'),
  },
  decorators: [
    Story => (
      <div dir='rtl' className='flex min-h-screen'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('انتهت مهلة طلب لوحة التحكم.')).toBeVisible();
  },
};
