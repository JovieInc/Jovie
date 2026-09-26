import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ProviderKey } from '@/lib/discography/types';
import { ReleaseSidebar } from './ReleaseSidebar';
import type { Release } from './types';

const mockRelease: Release = {
  profileId: 'profile-calvin',
  id: 'release-midnight-echo',
  title: 'Midnight Echo',
  artistNames: ['Example Artist'],
  status: 'released',
  releaseDate: '2026-01-15T00:00:00.000Z',
  slug: 'midnight-echo',
  smartLinkPath: '/example/midnight-echo',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  totalDiscs: 1,
  totalDurationMs: 181000,
};

const providerConfig = {} as Record<
  ProviderKey,
  { label: string; accent: string }
>;

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSidebar',
  component: ReleaseSidebar,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['disabled', 'isLoading', 'width'],
    },
  },
  args: {
    mode: 'admin',
    isOpen: true,
    providerConfig,
    artistName: 'Example Artist',
    onClose: () => undefined,
    onRefresh: () => undefined,
    analyticsOverride: null,
  },
  decorators: [
    Story => (
      <div className='relative h-screen w-full bg-surface-0'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReleaseSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    release: mockRelease,
  },
};

export const ReadOnly: Story = {
  args: {
    release: mockRelease,
    readOnly: true,
  },
};

export const Empty: Story = {
  args: {
    release: null,
  },
};
