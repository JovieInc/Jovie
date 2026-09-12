import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import type { Release } from './types';

const noop = () => undefined;
const asyncNoop = async () => undefined;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseDspLinks',
  component: ReleaseDspLinks,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled', 'showHeading'] },
  },
  args: {
    release: {
      id: 'rel_1',
      title: 'Midnight Drive',
      providers: [{ key: 'spotify', url: 'https://open.spotify.com/album/x' }],
      providerCounts: { unresolvedProviders: ['apple_music'] },
    } as unknown as Release,
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
    onSetIsAddingLink: noop,
    onSetNewLinkUrl: noop,
    onSetSelectedProvider: noop,
    onAddLink: asyncNoop,
    onRemoveLink: asyncNoop,
    onNewLinkKeyDown: noop,
  },
} satisfies Meta<typeof ReleaseDspLinks>;

export default meta;
export const QuietList: StoryObj<typeof meta> = {};
