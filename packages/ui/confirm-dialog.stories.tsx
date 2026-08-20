import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { ConfirmDialog } from './confirm-dialog';

const meta = {
  title: 'UI/Molecules/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onConfirm: fn(),
    title: 'Remove contact?',
    body: 'Avery will no longer appear in Audience. Their visit history will stay in analytics.',
    cancelLabel: 'Keep contact',
    confirmLabel: 'Remove contact',
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    title: 'Delete release?',
    body: 'This removes the release from your profile and disables its public links.',
    cancelLabel: 'Keep release',
    confirmLabel: 'Delete release',
  },
};

export const Pending: Story = {
  args: {
    isLoading: true,
    title: 'Disconnect Spotify?',
    body: 'Jovie is disconnecting Spotify and preserving the latest synced data.',
    cancelLabel: 'Keep connected',
    confirmLabel: 'Disconnect',
  },
};

export const ConfirmationRequired: Story = {
  args: {
    confirmDisabled: true,
    variant: 'destructive',
    title: 'Delete your account?',
    body: 'Enter DELETE before permanently removing your profile and workspace data.',
    cancelLabel: 'Keep account',
    confirmLabel: 'Delete account',
    children: (
      <label className='grid gap-2 text-sm font-medium text-primary-token'>
        Confirmation
        <input
          className='h-10 rounded-control border border-default bg-surface-0 px-3 text-sm font-normal outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/16'
          placeholder='Type DELETE'
        />
      </label>
    ),
  },
};
