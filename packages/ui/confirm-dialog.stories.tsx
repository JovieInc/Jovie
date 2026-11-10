import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

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

export const ErrorState: Story = {
  args: {
    title: 'Disconnect Spotify?',
    body: 'Jovie stops syncing new releases from Spotify. Synced data stays in your library.',
    cancelLabel: 'Keep connected',
    confirmLabel: 'Disconnect',
    onError: fn(),
    onConfirm: async () => {
      throw new Error('Request failed');
    },
  },
  play: async () => {
    const screen = within(document.body);
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed. Please try again.'
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'When onConfirm rejects, the dialog stays open, re-enables both actions and announces a retry message in an alert.',
      },
    },
  },
};

export const Partial: Story = {
  render: args => (
    <ConfirmDialog
      open={args.open}
      onOpenChange={args.onOpenChange}
      onConfirm={args.onConfirm}
      title='Discard unsaved changes?'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only the required props: no body, default Confirm and Cancel labels, and the default variant.',
      },
    },
  },
};

export const LongContent: Story = {
  args: {
    variant: 'destructive',
    title:
      'Delete the summer single, its extended club mix and every smart link shared with fans?',
    body: 'This permanently removes the release from your public profile, disables every smart link already shared with playlist curators, press contacts and fans, and stops new pre-saves. Analytics history for the release stays available in your dashboard for future reporting.',
    cancelLabel: 'Keep the release and its links',
    confirmLabel: 'Delete release and disable all links',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'A long title, body and action labels wrap inside the dialog on a narrow viewport without horizontal overflow.',
      },
    },
  },
};

/**
 * ConfirmDialog portals to document.body, so it takes its direction from the
 * document like a real right-to-left app; the story sets it on the docs iframe.
 */
function DocumentDirectionRtl({ children }: { readonly children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  args: {
    variant: 'destructive',
    title: 'هل تريد حذف جهة الاتصال من جمهورك نهائيًا؟',
    body: 'لن تظهر جهة الاتصال بعد الآن في قائمة الجمهور، وستتوقف رسائل البريد المجدولة لها. يبقى سجل الزيارات متاحًا في الإحصائيات.',
    cancelLabel: 'الإبقاء على جهة الاتصال',
    confirmLabel: 'حذف جهة الاتصال',
  },
  decorators: [
    Story => (
      <DocumentDirectionRtl>
        <Story />
      </DocumentDirectionRtl>
    ),
  ],
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      story: { inline: false, height: '28rem' },
      description: {
        story:
          'In a right-to-left document the Arabic title and body wrap inside the dialog and the footer actions follow the reading direction.',
      },
    },
  },
};
