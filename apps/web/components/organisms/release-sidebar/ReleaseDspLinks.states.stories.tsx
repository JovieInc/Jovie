import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import type { Release } from './types';

const release = {
  profileId: 'profile-1',
  id: 'rel_1',
  title: 'Midnight Drive',
  status: 'released',
  slug: 'midnight-drive',
  smartLinkPath: '/example/midnight-drive',
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/x',
      label: 'Spotify',
      path: '',
      isPrimary: true,
      source: 'ingested',
      updatedAt: '2026-09-12T00:00:00Z',
    },
  ],
  providerCounts: {
    canonical: 1,
    searchFallback: 0,
    unknown: 1,
    unresolvedProviders: ['apple_music'],
  },
} satisfies Release;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseDspLinks/States',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: ReleaseDspLinks,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['showHeading'] },
  },
  args: {
    release,
    providerConfig: {
      spotify: { label: 'Spotify', accent: 'text-primary-token' },
      apple_music: { label: 'Apple Music', accent: 'text-primary-token' },
    } as Record<ProviderKey, { label: string; accent: string }>,
    isEditable: true,
    isAddingLink: false,
    newLinkUrl: '',
    selectedProvider: null,
    isAddingDspLink: false,
    isRemovingDspLink: null,
    onSetIsAddingLink: fn(),
    onSetNewLinkUrl: fn(),
    onSetSelectedProvider: fn(),
    onAddLink: fn().mockResolvedValue(undefined),
    onRemoveLink: fn().mockResolvedValue(undefined),
    onNewLinkKeyDown: fn(),
  },
} satisfies Meta<typeof ReleaseDspLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no DSP is linked yet and one is only found, not resolved. */
export const PartialUnresolvedOnly: Story = {
  args: { release: { ...release, providers: [] } },
};

/** Long content: a provider label far longer than the sidebar column. */
export const LongContentProviderLabel: Story = {
  args: {
    providerConfig: {
      spotify: {
        label: 'Spotify With An Extremely Long Regional Storefront Name',
        accent: 'text-primary-token',
      },
      apple_music: { label: 'Apple Music', accent: 'text-primary-token' },
    } as Record<ProviderKey, { label: string; accent: string }>,
  },
};
