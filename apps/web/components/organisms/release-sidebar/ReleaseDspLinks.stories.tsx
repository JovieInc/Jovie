import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import type { Release } from './types';

const mockRelease = {
  id: 'rel_1',
  title: 'Midnight Drive',
  providers: [
    {
      key: 'spotify' as ProviderKey,
      url: 'https://open.spotify.com/album/example',
      source: 'manual',
    },
  ],
  providerCounts: {
    canonical: 1,
    searchFallback: 0,
    unknown: 0,
    unresolvedProviders: ['apple_music' as ProviderKey],
  },
} as unknown as Release;

const providerConfig = {
  spotify: { label: 'Spotify', accent: 'text-primary-token' },
  apple_music: { label: 'Apple Music', accent: 'text-primary-token' },
} as Record<ProviderKey, { label: string; accent: string }>;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseDspLinks',
  component: ReleaseDspLinks,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'disabled',
        'isRemovingDspLink',
        'onNewLinkKeyDown',
        'showHeading',
      ],
    },
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseDspLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnlyQuietList: Story = {
  args: {
    release: mockRelease,
    providerConfig,
    isEditable: false,
    isAddingLink: false,
    newLinkUrl: '',
    selectedProvider: null,
    isAddingDspLink: false,
    onSetIsAddingLink: () => undefined,
    onSetNewLinkUrl: () => undefined,
    onSetSelectedProvider: () => undefined,
    onAddLink: async () => undefined,
    onRemoveLink: async () => undefined,
  },
};

export const EditableWithRemove: Story = {
  args: {
    release: mockRelease,
    providerConfig,
    isEditable: true,
    isAddingLink: false,
    newLinkUrl: '',
    selectedProvider: null,
    isAddingDspLink: false,
    onSetIsAddingLink: () => undefined,
    onSetNewLinkUrl: () => undefined,
    onSetSelectedProvider: () => undefined,
    onAddLink: async () => undefined,
    onRemoveLink: async () => undefined,
  },
};

export const AddingLinkDraft: Story = {
  args: {
    release: mockRelease,
    providerConfig,
    isEditable: true,
    isAddingLink: true,
    newLinkUrl: '',
    selectedProvider: 'apple_music',
    isAddingDspLink: false,
    onSetIsAddingLink: () => undefined,
    onSetNewLinkUrl: () => undefined,
    onSetSelectedProvider: () => undefined,
    onAddLink: async () => undefined,
    onRemoveLink: async () => undefined,
  },
};
