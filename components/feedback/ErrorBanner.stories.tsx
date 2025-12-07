import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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
        <label className='text-sm font-medium'>Display Name</label>
        <input
          type='text'
          className='w-full px-3 py-2 border border-subtle rounded-lg'
          defaultValue='John Doe'
        />
      </div>
    </div>
  ),
};
