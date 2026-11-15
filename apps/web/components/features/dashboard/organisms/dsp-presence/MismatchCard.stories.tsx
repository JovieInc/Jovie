import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { MismatchCard } from './MismatchCard';
import type { CatalogMismatch } from './types';

const mismatch: CatalogMismatch = {
  id: 'mismatch-1',
  scanId: 'scan-1',
  creatorProfileId: 'profile-1',
  isrc: 'USRC17607839',
  mismatchType: 'not_in_catalog',
  externalTrackId: '4uLU6hMCjMI75M1A2tKUQC',
  externalTrackName: 'Midnight Drive',
  externalAlbumName: 'Night Sessions',
  externalAlbumId: 'album-1',
  externalArtworkUrl: null,
  externalArtistNames: 'Midnight Echo',
  status: 'flagged',
  dismissedAt: null,
  dismissedReason: null,
  dedupKey: 'dedup-1',
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

const ListShell: Decorator = function ListShell(Story) {
  return (
    <ul className='w-full max-w-xl list-none space-y-1.5'>
      <Story />
    </ul>
  );
};

const RtlShell: Decorator = function RtlShell(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/DSP Presence/MismatchCard',
  component: MismatchCard,
  parameters: { layout: 'padded' },
  decorators: [ListShell],
  args: {
    mismatch,
    onAction: fn(async () => true),
    onRemoved: fn(),
  },
} satisfies Meta<typeof MismatchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: a flagged track awaiting a Mine or Not Mine answer. */
export const Default: Story = {};

/** Loading: Not Mine was pressed and the undo window is open. */
export const LoadingUndoWindow: Story = {
  play: async function playNotMine({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Not Mine' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Marked as not yours'
    );
  },
};

/** Error: the update fails after the undo window, so Retry is offered. */
export const ErrorUpdateFailed: Story = {
  args: { onAction: fn(async () => false) },
  play: async function playFailedUpdate({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Mine' }));
    await waitFor(() => expect(canvas.getByRole('alert')).toBeInTheDocument(), {
      timeout: 5000,
    });
  },
};

/** Offline: the request cannot reach the server, so the update reports false. */
export const OfflineUpdateFailed: Story = {
  args: { onAction: fn(async () => false) },
  play: async function playOfflineUpdate({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Not Mine' }));
    await waitFor(
      () =>
        expect(canvas.getByRole('alert')).toHaveTextContent(
          'Failed to update. Try again.'
        ),
      { timeout: 5000 }
    );
  },
};

/** Long content: long track, artist and album names truncate in one row. */
export const LongContentNames: Story = {
  args: {
    mismatch: {
      ...mismatch,
      externalTrackName:
        'An Exceptionally Long Track Title (Extended Club Mix) [Remastered Deluxe Edition]',
      externalArtistNames:
        'Midnight Echo, The Long Named Collective, Featured Guest Vocalist',
      externalAlbumName: 'The Complete Night Sessions Anthology, Volume Three',
    },
  },
};

/** Right-to-left: Arabic track metadata in a right-to-left document. */
export const RtlArabicTrack: Story = {
  decorators: [RtlShell],
  args: {
    mismatch: {
      ...mismatch,
      externalTrackName: 'قيادة منتصف الليل',
      externalArtistNames: 'صدى منتصف الليل',
      externalAlbumName: 'جلسات ليلية',
    },
  },
};
