import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { ReleaseCell } from './ReleaseCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  artistNames: ['Jovie Artist'],
  slug: 'skyline-dreams',
  status: 'released',
  releaseType: 'single',
  isExplicit: false,
  releaseDate: '2026-01-01',
  totalTracks: 1,
  providers: [],
  smartLinkPath: '/smart/skyline-dreams',
  previewUrl: 'https://cdn.example.com/preview.mp3',
};

const meta = {
  title: 'Features/Dashboard/Releases/ReleaseCell',
  component: ReleaseCell,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='group w-72'>
        <Story />
      </div>
    ),
  ],
  args: {
    release,
    artistName: 'Jovie Artist',
  },
} satisfies Meta<typeof ReleaseCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selectable: Story = {
  args: { onSelect: fn() },
};

export const NoPreview: Story = {
  args: {
    release: { ...release, previewUrl: null },
  },
};
