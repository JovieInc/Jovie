import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingChild(): never {
  throw new Error('Simulated render error for the story');
}

const meta = {
  title: 'Providers/ErrorBoundary/States',
  component: ErrorBoundary,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing to guard, so the boundary renders no markup. */
export const Empty: Story = {
  args: { children: null },
};

/** Error: the default fallback with its reload action. */
export const Error: Story = {
  args: { children: <ThrowingChild />, showToast: false },
};

/** Partial: a custom fallback keeps the rest of the page usable. */
export const Partial: Story = {
  args: {
    children: <ThrowingChild />,
    showToast: false,
    fallback: (
      <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        This panel could not load. The rest of the page still works.
      </p>
    ),
  },
};

/** LongContent: a long custom fallback wraps inside the story frame. */
export const LongContent: Story = {
  args: {
    children: <ThrowingChild />,
    showToast: false,
    fallback: (
      <p className='max-w-sm rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        This panel could not load because the release catalog took longer than
        expected to answer, so none of its tracks, credits or smart links can be
        shown until the connection recovers and the page is reloaded.
      </p>
    ),
  },
};

/** Rtl: the default fallback centers and mirrors in a right-to-left page. */
export const Rtl: Story = {
  args: { children: <ThrowingChild />, showToast: false },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
