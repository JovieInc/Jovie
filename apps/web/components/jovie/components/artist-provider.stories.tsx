import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { EntityRef } from '@/lib/commands/entities';
import { artistProvider } from './artist-provider';

/**
 * `artistProvider.useSearch` calls a debounced, network-backed TanStack
 * Query hook, so this demo exercises `renderChip` directly with static
 * refs instead of driving the live search (avoids network calls in
 * Storybook, same rationale as other `EntityProvider` stories that seed
 * a QueryClient -- artist search has no stable queryKey to seed here).
 */
function ArtistChipDemo({ ref }: { readonly ref: EntityRef }) {
  return <div className='flex w-fit'>{artistProvider.renderChip(ref)}</div>;
}

const meta = {
  title: 'Jovie/ArtistProvider',
  component: ArtistChipDemo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ArtistChipDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifyArtist: Story = {
  args: {
    ref: {
      kind: 'artist',
      id: 'artist_1',
      label: 'Nova Wren',
      thumbnail: 'https://placehold.co/32x32/111827/f5f5f5?text=NW',
      meta: {
        kind: 'artist',
        subtitle: 'Spotify artist',
        followers: 128000,
        popularity: 62,
        verified: true,
        isYou: false,
      },
    },
  },
};

export const YourArtistProfile: Story = {
  args: {
    ref: {
      kind: 'artist',
      id: 'artist_2',
      label: 'Nova Wren',
      thumbnail: 'https://placehold.co/32x32/111827/f5f5f5?text=NW',
      meta: {
        kind: 'artist',
        subtitle: 'You',
        isYou: true,
      },
    },
  },
};
