import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ErrorBanner } from './ErrorBanner';

const meta: Meta<typeof ErrorBanner> = {
  title: 'Feedback/ErrorBanner',
  component: ErrorBanner,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ErrorBanner>;

export const Default: Story = {
  args: {
    title: 'Something went wrong',
    className: 'w-96',
  },
};

export const WithDescription: Story = {
  args: {
    title: 'Failed to save changes',
    description: 'Please check your connection and try again.',
    className: 'w-96',
  },
};

export const WithSingleAction: Story = {
  args: {
    title: 'Session expired',
    description: 'Your session has expired. Please sign in again to continue.',
    actions: [{ label: 'Sign In', href: '/signin' }],
    className: 'w-96',
  },
};

export const WithMultipleActions: Story = {
  args: {
    title: 'Failed to load profile',
    description: 'We encountered an error while loading your profile data.',
    actions: [
      { label: 'Retry', onClick: () => console.log('Retry clicked') },
      { label: 'Contact Support', href: '/support' },
    ],
    className: 'w-96',
  },
};

export const NetworkError: Story = {
  args: {
    title: 'Network connection lost',
    description: 'Please check your internet connection and try again.',
    actions: [{ label: 'Retry', onClick: () => console.log('Retry') }],
    className: 'w-96',
  },
};

export const ValidationError: Story = {
  args: {
    title: 'Invalid form data',
    description: 'Please correct the errors below and submit again.',
    className: 'w-96',
  },
};

export const InContext: Story = {
  render: () => (
    <div className='w-96 space-y-4 p-6 border border-subtle rounded-xl bg-surface'>
      <h2 className='text-lg font-semibold'>Profile Settings</h2>
      <ErrorBanner
        title='Failed to update profile'
        description='Your changes could not be saved. Please try again.'
        actions={[{ label: 'Retry', onClick: () => {} }]}
      />
      <div className='space-y-2'>
        <label
          htmlFor='error-banner-story-display-name'
          className='text-sm font-medium'
        >
          Display Name
        </label>
        <input
          id='error-banner-story-display-name'
          type='text'
          className='w-full px-3 py-2 border border-subtle rounded-lg'
          defaultValue='John Doe'
        />
      </div>
    </div>
  ),
};

export const CanonicalTokens: Story = {
  args: {
    title: 'Something went wrong',
    description: 'Please check your connection and try again.',
    actions: [{ label: 'Try again', onClick: fn() }],
    onDismiss: fn(),
    className: 'w-96',
  },
};

export const Dismissible: Story = {
  args: {
    title: 'Something went wrong',
    onDismiss: fn(),
    className: 'w-96',
  },
};

export const DismissibleWithDescription: Story = {
  args: {
    title: 'Failed to save changes',
    description: 'Please check your connection and try again.',
    onDismiss: fn(),
    className: 'w-96',
  },
};

export const DismissibleWithActions: Story = {
  args: {
    title: 'Failed to load profile',
    description: 'We encountered an error while loading your profile data.',
    actions: [
      { label: 'Retry', onClick: fn() },
      { label: 'Contact Support', href: '/support' },
    ],
    onDismiss: fn(),
    className: 'w-96',
  },
};

export const InteractiveDismiss: Story = {
  render: function InteractiveDismissableBanner() {
    const [visible, setVisible] = useState(true);

    if (!visible) {
      return (
        <div className='w-96 p-4 text-center text-muted-foreground'>
          <p className='mb-4'>Banner dismissed!</p>
          <button
            type='button'
            onClick={() => setVisible(true)}
            className='text-sm text-primary underline hover:no-underline'
          >
            Show again
          </button>
        </div>
      );
    }

    return (
      <ErrorBanner
        title='Session expired'
        description='Your session has expired. Please sign in again to continue.'
        actions={[{ label: 'Sign In', href: '/signin' }]}
        onDismiss={() => setVisible(false)}
        className='w-96'
      />
    );
  },
};

/** No recovery actions: the banner shows its message and details toggle only. */
export const EmptyNoActions: Story = {
  args: {
    title: 'Failed to load tasks',
    description: 'The task list could not be loaded right now.',
    actions: [],
    className: 'w-96',
  },
};

/** A thrown error with a digest; the details panel is opened to show its ID. */
export const ErrorWithDigest: Story = {
  args: {
    title: 'Something went wrong',
    description: 'We could not finish loading this page.',
    error: Object.assign(new Error('Render failed'), { digest: 'a1b2c3d4' }),
    actions: [{ label: 'Try again', onClick: fn() }],
    className: 'w-96',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show error details' })
    );
    await expect(canvas.getByText('Error ID: a1b2c3d4')).toBeInTheDocument();
  },
};

/** A title and an action without a description. */
export const PartialNoDescription: Story = {
  args: {
    title: 'Failed to save changes',
    actions: [{ label: 'Retry', onClick: fn() }],
    className: 'w-96',
  },
};

/** Long title, description and action labels wrap at phone width. */
export const LongContentPhoneWidth: Story = {
  args: {
    title:
      'We could not save the changes you made to your release plan, tour dates and connected streaming profiles',
    description:
      'The server stopped responding before the last update finished. Your earlier edits are safe, but the most recent changes to the deluxe edition schedule, the press kit links and the playlist pitch notes were not stored.',
    actions: [
      { label: 'Retry saving every change', onClick: fn() },
      { label: 'Contact Support', href: '/support' },
    ],
    onDismiss: fn(),
    className: 'w-80',
  },
};

/** How a denied request reads: the one recovery is to ask for access. */
export const PermissionDeniedMessage: Story = {
  args: {
    title: "You don't have access to this workspace",
    description: 'Ask an owner of this workspace to invite you.',
    actions: [{ label: 'Request access', onClick: fn() }],
    className: 'w-96',
  },
};

export const RtlWithActions: Story = {
  args: {
    title: 'تعذر حفظ التغييرات',
    description: 'يرجى التحقق من اتصالك والمحاولة مرة أخرى.',
    actions: [
      { label: 'إعادة المحاولة', onClick: fn() },
      { label: 'الدعم', href: '/support' },
    ],
    onDismiss: fn(),
    className: 'w-96',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
