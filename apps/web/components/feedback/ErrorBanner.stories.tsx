import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
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
        {
          // biome-ignore lint/a11y/noLabelWithoutControl: Story example - not a real form
          <label className='text-sm font-medium'>Display Name</label>
        }
        <input
          type='text'
          className='w-full px-3 py-2 border border-subtle rounded-lg'
          defaultValue='John Doe'
        />
      </div>
    </div>
  ),
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
