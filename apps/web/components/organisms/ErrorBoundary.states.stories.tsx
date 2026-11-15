import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import ErrorBoundary from './ErrorBoundary';

/**
 * State coverage for the route error boundary UI. These render the same
 * boundary as ErrorBoundary.stories.tsx and change only the caught error, the
 * caller message or the document direction.
 */
const meta = {
  title: 'Organisms/ErrorBoundary States',
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
  args: {
    error: Object.assign(new Error('The dashboard request timed out.'), {
      digest: 'dashboard-timeout',
    }),
    reset: fn(),
    context: 'Dashboard',
  },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a caught route error offers one Try again action. */
export const ErrorRetry: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
    await expect(args.reset).toHaveBeenCalled();
  },
};

/** Partial: an error with no digest and the default message. */
export const PartialNoDigest: Story = {
  args: {
    error: new Error('Releases failed to load.'),
    context: 'Releases',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "We couldn't load this page. Give it another try, or head home."
      )
    ).toBeVisible();
  },
};

const LONG_MESSAGE =
  'We could not load your releases, audience and earnings because the analytics provider is slow to respond right now. Nothing you changed was lost, and trying again in a moment usually works. If it keeps happening, head home and come back later.';

/** Long content: a long caller message wraps inside the recovery card. */
export const LongContentMessage: Story = {
  args: {
    message: LONG_MESSAGE,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_MESSAGE)).toBeVisible();
  },
};

/** Right-to-left: an Arabic caller message inside an RTL document. */
export const RtlArabicMessage: Story = {
  args: {
    message: 'تعذر تحميل هذه الصفحة. حاول مرة أخرى.',
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
    await expect(
      canvas.getByText('تعذر تحميل هذه الصفحة. حاول مرة أخرى.')
    ).toBeVisible();
  },
};
