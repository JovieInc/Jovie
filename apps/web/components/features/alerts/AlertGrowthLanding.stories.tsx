import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { AlertGrowthLanding } from './AlertGrowthLanding';

const artist: Artist = {
  id: 'mock-artist-id',
  owner_user_id: 'mock-user-id',
  handle: 'artisthandle',
  spotify_id: 'mock-spotify-id',
  name: 'Mock Artist',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Mock artist tagline',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2023-01-01T00:00:00Z',
};

const meta = {
  title: 'Features/Alerts/AlertGrowthLanding',
  component: AlertGrowthLanding,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['artist', 'disabled'],
    },
  },
} satisfies Meta<typeof AlertGrowthLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    artist,
  },
};

function swapFetch(next: typeof fetch) {
  globalThis.fetch = next;
}

function withHangingFetch(Story: () => React.JSX.Element) {
  swapFetch(() => new Promise<Response>(() => {}));
  return <Story />;
}

function withOfflineFetch(Story: () => React.JSX.Element) {
  swapFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  return <Story />;
}

async function submitPhone(
  { canvasElement }: { canvasElement: HTMLElement },
  phone: string
) {
  const canvas = within(canvasElement);
  if (phone) {
    await userEvent.type(canvas.getByLabelText('Mobile number'), phone);
  }
  await userEvent.click(canvas.getByRole('button', { name: 'Get alerts' }));
}

export const LoadingSubmitting: Story = {
  args: { artist },
  decorators: [withHangingFetch],
  play: ctx => submitPhone(ctx, '5555551234'),
};

export const ErrorInvalidPhone: Story = {
  args: { artist },
  play: ctx => submitPhone(ctx, '123'),
};

export const OfflineSubmitFailed: Story = {
  args: { artist },
  decorators: [withOfflineFetch],
  play: ctx => submitPhone(ctx, '5555551234'),
};

export const PartialNameFallsBackToHandle: Story = {
  args: { artist: { ...artist, name: '' } },
};

export const LongContentArtistName: Story = {
  args: {
    artist: {
      ...artist,
      name: 'The Extraordinarily Long Named Midnight Orchestra And Friends Live In Concert',
    },
  },
};

export const RtlArtistName: Story = {
  args: { artist: { ...artist, name: 'فرقة منتصف الليل' } },
};
