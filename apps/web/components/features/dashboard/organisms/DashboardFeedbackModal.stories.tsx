import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DashboardFeedbackModal } from './DashboardFeedbackModal';

const meta = {
  title: 'Dashboard/Organisms/DashboardFeedbackModal',
  component: DashboardFeedbackModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    isOpen: true,
    onClose: () => {},
    onSubmit: async () => {},
  },
} satisfies Meta<typeof DashboardFeedbackModal>;

export default meta;
type Story = StoryObj<typeof meta>;

// The dialog portals to document.body, so play functions query the body.
const body = () => within(document.body);

async function typeAndSend(text: string) {
  const field = await body().findByRole('textbox');
  await userEvent.type(field, text);
  await userEvent.click(body().getByRole('button', { name: 'Send Feedback' }));
}

export const Open: Story = {};

/** Nothing typed yet: the field is empty and Send stays unavailable. */
export const EmptyDraft: Story = {
  play: async () => {
    await expect(await body().findByRole('textbox')).toHaveValue('');
    await expect(
      body().getByRole('button', { name: 'Send Feedback' })
    ).toBeDisabled();
  },
};

/** The message is on its way: Send shows its pending state and the dialog cannot close. */
export const LoadingSending: Story = {
  args: { onSubmit: () => new Promise<void>(() => {}) },
  play: async () => {
    await typeAndSend('The release editor saves slowly');
    await waitFor(() =>
      expect(body().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    );
  },
};

/** The send fails: the typed message stays in the field so it can be sent again. */
export const ErrorSendFailed: Story = {
  args: {
    onSubmit: () => Promise.reject(new Error('Feedback service unavailable')),
  },
  play: async () => {
    await typeAndSend('Smart links need a QR code');
    await waitFor(() =>
      expect(body().getByRole('textbox')).toHaveValue(
        'Smart links need a QR code'
      )
    );
  },
};

/** Offline: the request never leaves the device, and the message is kept for a retry. */
export const OfflineSendFailed: Story = {
  args: { onSubmit: () => Promise.reject(new TypeError('Failed to fetch')) },
  play: async () => {
    await typeAndSend('Sent from the train');
    await waitFor(() =>
      expect(
        body().getByRole('button', { name: 'Send Feedback' })
      ).toBeEnabled()
    );
  },
};

const LONG_FEEDBACK =
  'The audience page is the part of Jovie I open most, and it would help a lot to filter fans by the city they listened from, export that list, and see which release brought each of them in. Right now I copy the numbers into a spreadsheet every Monday before planning the week of shows.';

/** A long message scrolls inside the field; the dialog keeps its width. */
export const LongFeedback: Story = {
  play: async () => {
    const field = await body().findByRole('textbox');
    await userEvent.click(field);
    await userEvent.paste(LONG_FEEDBACK);
    await expect(field).toHaveValue(LONG_FEEDBACK);
  },
};

function RtlDocument({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <>{children}</>;
}

/** Right to left: the portalled dialog follows the document direction. */
export const RtlLayout: Story = {
  decorators: [
    Story => (
      <RtlDocument>
        <Story />
      </RtlDocument>
    ),
  ],
};
