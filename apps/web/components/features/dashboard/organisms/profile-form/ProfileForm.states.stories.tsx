import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import * as React from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Artist } from '@/types/db';
import { ProfileForm } from './ProfileForm';

/**
 * Certification states for the profile form. The default lives in
 * ProfileForm.stories.tsx.
 */

const artist = {
  id: 'story-artist',
  owner_user_id: 'story-user',
  handle: 'story-artist',
  spotify_id: '',
  name: 'Mina Vale',
  tagline: 'Independent producer and vocalist',
  image_url: '',
  spotify_url: '',
  apple_music_url: '',
  youtube_url: '',
  settings: {},
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

type FetchMode = 'pending' | 'offline';

function profileFetch(mode: FetchMode, originalFetch: typeof fetch) {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (!url.includes('/api/dashboard/profile'))
      return originalFetch(input, init);
    if (mode === 'pending') return new Promise<Response>(() => {});
    return Promise.reject(new TypeError('Failed to fetch'));
  }) as typeof fetch;
}

function MockedProfileFetch({
  mode,
  children,
}: {
  readonly mode: FetchMode;
  readonly children: React.ReactNode;
}) {
  const [ready, setReady] = React.useState(false);
  React.useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    const mocked = profileFetch(mode, originalFetch);
    globalThis.fetch = mocked;
    setReady(true);
    return () => {
      if (globalThis.fetch === mocked) globalThis.fetch = originalFetch;
    };
  }, [mode]);
  return ready ? children : null;
}

const FormShell: Decorator = function FormShell(Story) {
  return (
    <div className='w-full max-w-96'>
      <Story />
    </div>
  );
};

const PendingFetch: Decorator = function PendingFetch(Story) {
  return (
    <MockedProfileFetch mode='pending'>
      <Story />
    </MockedProfileFetch>
  );
};

const OfflineFetch: Decorator = function OfflineFetch(Story) {
  return (
    <MockedProfileFetch mode='offline'>
      <Story />
    </MockedProfileFetch>
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
  title: 'Dashboard/Organisms/ProfileForm/States',
  component: ProfileForm,
  parameters: { layout: 'centered' },
  decorators: [FormShell],
  args: { artist, onUpdate: () => undefined },
} satisfies Meta<typeof ProfileForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the update was submitted and the save is in flight. */
export const LoadingSaving: Story = {
  decorators: [PendingFetch],
  play: async function playSave({ canvasElement }) {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', { name: /Update Profile/ });
    await userEvent.click(submit);
    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'));
  },
};

/** Error: the artist name was cleared, so validation blocks the save. */
export const ErrorNameRequired: Story = {
  play: async function playRequired({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByPlaceholderText('Your artist name'));
    await userEvent.click(
      canvas.getByRole('button', { name: /Update Profile/ })
    );
    await waitFor(() =>
      expect(canvas.getAllByText('Artist name is required')[0]).toBeVisible()
    );
  },
};

/** Offline: the save request cannot reach the server. */
export const OfflineSaveFailed: Story = {
  decorators: [OfflineFetch],
  play: async function playOffline({ canvasElement }) {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /Update Profile/ })
    );
  },
};

/** Long content: a long name and a tagline near the 160 character limit. */
export const LongContentTagline: Story = {
  args: {
    artist: {
      ...artist,
      name: 'Mina Vale and the Extraordinarily Long Named Band',
      tagline:
        'Independent producer, vocalist and multi-instrumentalist writing late-night electronic pop about cities, distance and the people who keep us up',
    },
  },
};

/** Right-to-left: Arabic profile copy in a right-to-left document. */
export const RtlArabicProfile: Story = {
  decorators: [RtlShell],
  args: {
    artist: { ...artist, name: 'مينا فال', tagline: 'منتجة ومغنية مستقلة' },
  },
};
