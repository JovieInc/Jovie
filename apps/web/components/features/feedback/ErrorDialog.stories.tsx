import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { ErrorDialog } from './ErrorDialog';

const meta: Meta<typeof ErrorDialog> = {
  title: 'Feedback/ErrorDialog',
  component: ErrorDialog,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ErrorDialog>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Failed to save changes',
    description: 'An error occurred while saving your profile.',
    onClose: () => console.log('Close'),
    primaryActionLabel: 'Retry',
    onPrimaryAction: () => console.log('Retry'),
  },
};

export const WithSecondaryAction: Story = {
  args: {
    open: true,
    title: 'Network Error',
    description: 'Unable to connect to the server.',
    onClose: () => console.log('Close'),
    primaryActionLabel: 'Retry',
    onPrimaryAction: () => console.log('Retry'),
    secondaryActionLabel: 'Cancel',
    onSecondaryAction: () => console.log('Cancel'),
  },
};

export const SessionExpired: Story = {
  args: {
    open: true,
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again.',
    onClose: () => console.log('Close'),
    primaryActionLabel: 'Sign In',
    onPrimaryAction: () => console.log('Sign In'),
  },
};

export const Interactive: Story = {
  render: function InteractiveErrorDialog() {
    const [open, setOpen] = useState(false);

    return (
      <div className='space-y-4'>
        <Button onClick={() => setOpen(true)}>Trigger Error</Button>
        <ErrorDialog
          open={open}
          title='Something went wrong'
          description='We encountered an unexpected error.'
          onClose={() => setOpen(false)}
          primaryActionLabel='Try Again'
          onPrimaryAction={() => setOpen(false)}
          secondaryActionLabel='Dismiss'
          onSecondaryAction={() => setOpen(false)}
        />
      </div>
    );
  },
};
