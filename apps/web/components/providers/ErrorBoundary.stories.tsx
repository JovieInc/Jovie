import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ErrorBoundary } from './ErrorBoundary';

function WorkingChild() {
  return (
    <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-primary-token'>
      Content rendered without error.
    </p>
  );
}

function ThrowingChild(): never {
  throw new Error('Simulated render error for the story');
}

const meta = {
  title: 'Providers/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoError: Story = {
  args: {
    children: <WorkingChild />,
  },
};

export const CaughtError: Story = {
  args: {
    children: <ThrowingChild />,
    showToast: false,
  },
};

export const CustomFallback: Story = {
  args: {
    children: <ThrowingChild />,
    showToast: false,
    fallback: (
      <p className='rounded-lg border border-subtle bg-surface-0 p-4 text-sm text-secondary-token'>
        Custom fallback content
      </p>
    ),
  },
};
